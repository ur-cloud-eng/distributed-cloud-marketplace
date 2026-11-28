param(
    [ValidateRange(1024,65535)][int]$AppPort = 3100,
    [ValidateRange(1024,65535)][int]$MySqlPort = 3310
)

$ErrorActionPreference = 'Stop'
if ($AppPort -eq $MySqlPort) { throw 'Choose two different ports.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install and start Docker Desktop first.' }
& docker info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable. Start Docker Desktop.' }
& docker compose version
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required.' }

function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

$project = 'cortexops_verify_' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$envFile = '.env.' + $project
$settings = [ordered]@{
    NODE_ENV = 'development'
    APP_PORT = "127.0.0.1:${AppPort}"
    MYSQL_HOST_PORT = "$MySqlPort"
    APP_BASE_URL = "http://localhost:$AppPort"
    DB_USER = 'marketplace'
    DB_PASSWORD = (New-Secret)
    MYSQL_ROOT_PASSWORD = (New-Secret)
    SESSION_SECRET = (New-Secret)
    TOTP_ENCRYPTION_KEY = (New-Secret)
    BILLING_HOURS_PER_MONTH = '720'
    PLATFORM_COMMISSION_RATE = '15'
    BREVO_SMTP_HOST = ''
    BREVO_SMTP_PORT = ''
    BREVO_SMTP_LOGIN = ''
    BREVO_SMTP_KEY = ''
    MAIL_FROM = ''
    GEMINI_API_KEY = ''
}
$oldEnvironment = @{}
$compose = @('compose','-f','compose.yaml','--env-file',$envFile,'-p',$project)
$failures = @()

function Run-Compose {
    & docker @compose @args
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose command failed (exit $LASTEXITCODE)." }
}

function Test-Suite([string]$Name, [string]$Database, [string]$Pattern) {
    Write-Host "`n=== $Name ==="
    $options = @('exec','-T')
    if ($Database) { $options += @('-e',"CORTEXOPS_TEST_DB=$Database") }
    # Explicit file paths avoid shell glob expansion differences on Windows.
    $files = @(Get-ChildItem -Path tests -Filter $Pattern | ForEach-Object { 'tests/' + $_.Name })
    if ($files.Count -eq 0) { throw "No test files match $Pattern" }
    & docker @compose @options app node --test @files | Out-Host
    if ($LASTEXITCODE -eq 0) { Write-Host "PASS: $Name"; return $true }
    Write-Host "FAIL: $Name"
    return $false
}

Push-Location $PSScriptRoot
try {
    if (Test-Path $envFile) { throw 'Unexpected existing verification environment file.' }
    $settings.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" } | Set-Content -Encoding ASCII $envFile
    # Compose gives shell variables precedence; isolate them for this run.
    foreach ($key in $settings.Keys) {
        $oldEnvironment[$key] = [Environment]::GetEnvironmentVariable($key,'Process')
        [Environment]::SetEnvironmentVariable($key,[string]$settings[$key],'Process')
    }
    Write-Host "Isolated project: $project"
    Write-Host "Private configuration: $envFile (do not share or commit)"
    Run-Compose config --quiet
    Run-Compose up --build --wait --wait-timeout 240

    $countSql = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_marketplace' AND table_type='BASE TABLE'; SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_marketplace'; SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='cloud_marketplace' AND routine_type='PROCEDURE'; SELECT COUNT(*) FROM information_schema.views WHERE table_schema='cloud_marketplace';"
    $mysql = 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD exec mysql -uroot --batch --skip-column-names'
    $counts = @($countSql | & docker @compose exec -T db sh -c $mysql)
    if ($LASTEXITCODE -ne 0) { throw 'MySQL schema inspection failed.' }
    Write-Host "Database object counts (tables, triggers, procedures, views): $($counts -join ', ')"
    if (($counts -join ',').Trim() -ne '22,9,3,1') { throw 'Unexpected schema object counts.' }

    $ready = $false
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        try {
            $health = Invoke-RestMethod "http://localhost:$AppPort/api/health" -TimeoutSec 3
            if ($health.status -eq 'OK') { $ready = $true; break }
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $ready) { throw 'Application did not respond to its health endpoint.' }
    foreach ($path in @('/','/api-docs/','/api-docs.json','/login')) {
        $response = Invoke-WebRequest -UseBasicParsing "http://localhost:$AppPort$path" -TimeoutSec 10
        if ($response.StatusCode -ne 200) { throw "Unexpected HTTP status for $path" }
    }
    Write-Host 'PASS: application and public/Swagger/login HTTP checks'

    # The production Docker image has runtime dependencies but omits tests.
    # Copy tests into this disposable app container only.
    Run-Compose cp tests app:/app/
    foreach ($schema in @('cortex_resource_test','cortex_finance_test','cortex_marketplace_test')) {
        $sql = "CREATE DATABASE $schema; GRANT ALL PRIVILEGES ON ${schema}.* TO 'marketplace'@'%';"
        $sql | & docker @compose exec -T db sh -c $mysql
        if ($LASTEXITCODE -ne 0) { throw "Could not create disposable schema $schema." }
        $load = 'for file in /docker-entrypoint-initdb.d/*.sql; do MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot $1 < $file || exit 1; done'
        Run-Compose exec -T db sh -c $load sh $schema
    }

    if (-not (Test-Suite 'Standard tests' '' '*.test.cjs')) { $failures += 'Standard tests' }
    if (-not (Test-Suite 'Resource lifecycle' 'cortex_resource_test' 'resource-lifecycle.integration.cjs')) { $failures += 'Resource lifecycle' }
    if (-not (Test-Suite 'Finance' 'cortex_finance_test' 'finance.integration.cjs')) { $failures += 'Finance' }
    if (-not (Test-Suite 'Marketplace HTTP' 'cortex_marketplace_test' 'marketplace.integration.cjs')) { $failures += 'Marketplace HTTP' }
    if ($failures.Count -gt 0) { throw ('Failed suites: ' + ($failures -join ', ')) }
    Write-Host "`nPASS: all automated suites. Live Brevo, Gemini and browser usability still require manual verification."
} finally {
    foreach ($key in $oldEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key,$oldEnvironment[$key],'Process') }
    Write-Host "Application: http://localhost:$AppPort"
    Write-Host "Swagger: http://localhost:$AppPort/api-docs/"
    Write-Host "Inspect: docker compose -f compose.yaml --env-file $envFile -p $project ps"
    Write-Host "Stop (retain volumes): docker compose -f compose.yaml --env-file $envFile -p $project down"
    Pop-Location
}
