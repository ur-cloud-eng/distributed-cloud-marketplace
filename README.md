# CortexOps

CortexOps is a Web Programming I project by two third-year Computer and Communications Engineering students. It simulates a distributed cloud marketplace. Providers register capacity, customers rent resources from that capacity, and administrators manage pricing and billing. All resources, invoices, and payments are simulated.

| Role | Responsibilities |
| --- | --- |
| Customer | Create and manage resources, review invoices, make simulated payments, and request an architecture recommendation. |
| Provider | Register hosts, manage available capacity, and review gross earnings, commissions, and net earnings. |
| Administrator | Manage prices and invoices, review payments and commissions, and look up infrastructure. |

The catalog contains eleven resource types: Resource Group, Virtual Network, Subnet, Virtual Machine, Blob Storage, File Storage, Load Balancer, Managed SQL Server, Managed PostgreSQL, Managed MySQL, and Web App.

CortexOps selects a compatible host by region, hosting class, and available CPU, RAM, and storage. Transactions protect capacity reservations and release. Usage-based billing uses metered compute and storage, records item prices on invoices, and credits providers after applying the platform commission. The Gemini Architecture Advisor recommends resource sizes and relationships and checks current capacity. Its results are advisory.

Accounts use bcrypt password hashing, Brevo SMTP email verification, session cookies, role-based authorization, and optional Google Authenticator TOTP. Registration is available for customers and providers. An administrator account must be provisioned separately.

## Technology and structure

CortexOps uses Node.js, Express, MySQL with mysql2, EJS, HTML, CSS, and vanilla JavaScript. Swagger documents the API, Gemini provides recommendations, and Docker Compose runs the application and database.

| Path | Responsibility |
| --- | --- |
| `backend/PL/` | Presentation layer. Express routes, request handling, and access checks. |
| `backend/BLL/` | Business logic layer. Resource allocation, billing, authentication, and advisor logic. |
| `backend/DAL/` | Data access layer. Parameterized SQL, connections, and transactions. |
| `backend/swagger/`, `backend/utils/` | OpenAPI definitions and shared validation and calculation utilities. |
| `database/schema/` | Ordered MySQL schema and starting price rules. |
| `frontend/` | Integrated EJS views, public assets, and portal configuration. |
| `tests/` | Node.js contract tests and MySQL integration tests. |
| `server.js`, `Dockerfile`, `compose.yaml` | Application entry point and container configuration. |

## Database and billing

The fresh schema has 22 tables. Blob and File Storage share `StorageVolumes`, with separate API paths and name uniqueness per resource group and storage type. The registry enforces ownership and storage type. Managed databases share one API collection and expose their engine.

`ResourceUsagePeriods` records the provider, customer, hosting class, quantity, and UTC interval for each billable dimension. VMs keep a storage interval from creation until cancellation. CPU and RAM are recorded while running. VM GPU allocation is not supported. Resource Groups, Virtual Networks, and Subnets remain free.

Invoices store their customer and date range directly. A customer lock serializes invoice creation, and exact or overlapping periods are rejected even when the existing invoice was cancelled. Usage billing clips actual metered intervals to the requested dates, uses active rates when generating an invoice, and preserves the prices on issued items.

## Local setup

1. Install Node.js 22 and the MySQL 8.0 client and server.
2. Run `npm ci` at the repository root.
3. Copy `.env.example` to `.env`. Fill in the database credentials and set `SESSION_SECRET` to at least 32 characters. Keep `.env` private.
4. Create an empty MySQL database named by `DB_NAME`. From the repository root, load the schema with `mysql -h 127.0.0.1 -u YOUR_DB_USER -p cloud_marketplace < database/cloud_marketplace.sql`. Substitute the database name if configured differently.
5. Run `npm start`. Open [CortexOps](http://localhost:3000) or [Swagger UI](http://localhost:3000/api-docs/). The OpenAPI JSON is at `/api-docs.json`.

For email verification, set the `BREVO_SMTP_*` values, `MAIL_FROM`, and `APP_BASE_URL` to the address visitors use. Enable TOTP enrollment with a private 64-character hexadecimal `TOTP_ENCRYPTION_KEY`. Add a private `GEMINI_API_KEY` to enable the advisor. The default simulated commission is 15%, and billing uses a 720-hour model month. Secrets can be generated locally with `openssl rand -hex 32`.

## Docker startup

Configure `.env`, then run `docker compose up --build`. The application defaults to port 3000 and the database is published locally on port 3307. Set `APP_BASE_URL` to match the published application port if you change it. Compose loads the schema when it initializes a new database volume. It reuses an existing volume on later starts. Use a separate Compose project or a disposable test container when testing schema initialization.

## Tests

- `npm test` runs the frontend, Swagger, and local Gemini fixture tests.
- `npm run test:frontend` runs the frontend contract and EJS rendering tests.
- Set `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD` to a disposable MySQL instance. Initialize a database ending in `_test` and set `CORTEXOPS_TEST_DB` to its name. Run `npm run test:integration` for resource lifecycle coverage. Use a freshly initialized disposable schema for `node --test tests/finance.integration.cjs`.
- Run `node --test tests/marketplace.integration.cjs` against another fresh disposable schema. It starts the integrated HTTP app and uses local email and Gemini fixtures.

## Provision a demonstration administrator

Register a dedicated **customer** account through the normal UI and verify the email. Use an account with no resources, hosts, or billing history. Sign out, then have an authorized database administrator connect to the intended database. Look up the account by its exact email and copy its numeric `user_id`. Confirm the email and verification timestamp before proceeding.

```sql
SET @demo_email = 'replace-with-exact-verified-email@example.invalid';
SELECT user_id, email, role, email_verified_at FROM Users WHERE BINARY email = BINARY @demo_email;

-- Replace 0 with the user_id returned above.
SET @demo_user_id = 0;
START TRANSACTION;
UPDATE Users AS u
SET role = 'admin'
WHERE u.user_id = @demo_user_id AND BINARY u.email = BINARY @demo_email
  AND u.role = 'customer' AND u.email_verified_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ResourceGroups WHERE customer_user_id = u.user_id)
  AND NOT EXISTS (SELECT 1 FROM ProviderHosts WHERE provider_user_id = u.user_id)
  AND NOT EXISTS (SELECT 1 FROM invoices WHERE customer_id = u.user_id);
SELECT ROW_COUNT() AS promoted_accounts;
```

Run `COMMIT;` only if exactly one account was promoted. Otherwise run `ROLLBACK;` and check the account selection. Sign in again using the account's existing password. This preserves the stored bcrypt hash, email verification, and normal session and role checks.

## Reproduce the presentation demo

Use a new, disposable MySQL schema named `cortexops_hybrid_demo`. Initialize it using the local setup steps, point only the demo application at it with `DB_NAME=cortexops_hybrid_demo`, and retain the seed rates, the 720-hour billing month, and the 15% commission. Create separate verified customer and provider accounts, then provision the dedicated administrator above. Use different browser profiles for the three sessions.

1. As the provider, register an Economy host in a demo region with at least 4 vCPU, 8 GB RAM, and 40 GB disk.
2. As the customer, create a Resource Group in that region, a Virtual Network and Subnet, and an Economy VM named `Demo VM` with 2 vCPU, 4 GB RAM, and 20 GB disk. Note its `vm_id` in Resources and the customer user ID in Account & Security. Check the provider's Capacity page to see where the VM was placed.
3. Start and stop the VM once. Keep it stopped during the billing demonstration. The provider still sees the reserved capacity.
4. In the disposable schema only, move the VM's real, closed compute interval and existing storage start into a completed test period. Use the IDs from step 2. Verify the affected rows before committing.

```sql
USE cortexops_hybrid_demo;
SET @demo_vm_id = 0;       -- Replace with the VM ID.
SET @demo_customer_id = 0; -- Replace with the customer user ID.

START TRANSACTION;
SET @demo_resource_id = (
    SELECT r.resource_id
    FROM ResourceRegistry r JOIN VirtualMachines v ON v.vm_id = r.vm_id
    WHERE DATABASE() = 'cortexops_hybrid_demo' AND v.vm_id = @demo_vm_id
      AND r.customer_user_id = @demo_customer_id AND v.name = 'Demo VM'
      AND v.status = 'stopped' AND r.status = 'stopped'
    FOR UPDATE
);

SELECT resource_type, quantity, started_at, ended_at
FROM ResourceUsagePeriods WHERE resource_id = @demo_resource_id;

UPDATE VirtualMachines SET created_at = '2025-11-01 00:00:00'
WHERE vm_id = @demo_vm_id AND @demo_resource_id IS NOT NULL;
SELECT ROW_COUNT() AS vm_rows_updated;

UPDATE ResourceUsagePeriods
SET started_at = '2025-11-01 00:00:00', ended_at = '2025-11-16 00:00:00'
WHERE resource_id = @demo_resource_id AND customer_id = @demo_customer_id
  AND resource_type IN ('CPU','RAM') AND ended_at IS NOT NULL;
SELECT ROW_COUNT() AS compute_rows_updated;

UPDATE ResourceUsagePeriods SET started_at = '2025-11-01 00:00:00'
WHERE resource_id = @demo_resource_id AND customer_id = @demo_customer_id
  AND resource_type = 'Storage' AND ended_at IS NULL;
SELECT ROW_COUNT() AS storage_rows_updated;
```

Confirm the query returned one closed CPU row, one closed RAM row, and one open Storage row. The first run should update one VM row, two compute rows, and one storage row. Run `COMMIT;` if the checks match. Otherwise run `ROLLBACK;`. Keep this fixture in the disposable demo database.

5. As the administrator, preview the usage invoice for that customer from **2025-11-01** inclusive to **2025-12-01** exclusive, then generate it. With only this VM's usage, expect **$4.60**, made up of **$2.00 CPU**, **$2.00 RAM**, and **$0.60 storage**.
6. As the customer, pay the invoice and open Notifications. As the provider, check Earnings and Notifications for **$4.60 gross**, **$0.69 platform commission**, and **$3.91 net**.
7. Cancel the VM and refresh the provider Capacity page to verify that the full reservation was released. For a repeat demonstration, initialize a separate fresh demo database.

Historical compute billing uses recorded intervals. The application can detect a currently running VM created before the billing cutoff with a missing open interval, but it cannot reconstruct an unrecorded historical start or stop. Repair or investigate inconsistencies instead of inventing usage.

## Session storage

Express stores sessions in application memory. Sessions are lost on restart. This configuration is intended for a single-server academic demonstration. A more robust production deployment would require persistent session storage.

## Migrating an existing 26-table database

The installation commands initialize a fresh database. They do not migrate an existing database or Docker volume. Keep the original database and its backup, and rehearse any data copy into a separately initialized database before switching the application connection.

1. Preserve account, group, host, resource registry, allocation, and financial IDs. For storage, create a mapping keyed by **old type and old ID** to the new `storage_id`. Blob and File IDs can overlap. Copy the group, name, size, status, and creation date, and translate each registry reference using that mapping. Keep the mapping for clients with saved legacy IDs.
2. Retain each existing non-VM usage row. Split each historical VM runtime row into CPU and RAM records and include GPU only when the original recorded quantity was positive. Map VM IDs through the preserved registry IDs. Copy each VM storage interval, its original quantity, and the original provider, customer, hosting class, and timestamps. Validate ownership, overlapping intervals, and running state. Investigate missing attribution or metering rather than guessing it.
3. Copy customer and dates from each old billing-period row onto its invoice. Preserve invoice IDs, status, totals, items, payments, earnings, and notifications. Reconcile record counts, invoice totals, and provider totals before cutover.
4. Import historical usage through a reviewed staging procedure. The normal insert trigger validates **current** resource state and allocations, so old rows for cancelled resources or previously recorded quantities require staged loading and explicit integrity checks before the live triggers are enabled. No migration script runs automatically.

## Windows PowerShell verification

Run the following from the project root after installing Node.js 22, MySQL 8.0 and, for the container check, Docker Desktop. Copy the example only if `.env` does not already exist, then fill in the database and private settings.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
# Create the configured empty application database first.
mysql.exe -h 127.0.0.1 -u YOUR_DB_USER -p -D cloud_marketplace -e "source database/cloud_marketplace.sql"
npm start
```

In a separate PowerShell window, point the tests at a disposable MySQL instance. Supply an authorized test database user and its password locally. Use freshly initialized schemas for the finance and marketplace suites.

```powershell
npm test
npm run test:frontend
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3306"
$env:DB_USER = "YOUR_DISPOSABLE_DB_USER"
$env:DB_PASSWORD = Read-Host "Disposable MySQL password" -MaskInput
$env:MYSQL_PWD = $env:DB_PASSWORD
foreach ($db in @("cortex_resource_test", "cortex_finance_test", "cortex_marketplace_test")) {
    mysql.exe -h $env:DB_HOST -P $env:DB_PORT -u $env:DB_USER -e "CREATE DATABASE $db"
    if ($LASTEXITCODE -ne 0) { throw "Use an unused disposable schema name." }
    mysql.exe -h $env:DB_HOST -P $env:DB_PORT -u $env:DB_USER -D $db -e "source database/cloud_marketplace.sql"
    if ($LASTEXITCODE -ne 0) { throw "Schema initialization failed." }
}
Remove-Item Env:MYSQL_PWD
$env:CORTEXOPS_TEST_DB = "cortex_resource_test"
npm run test:integration
$env:CORTEXOPS_TEST_DB = "cortex_finance_test"
node --test tests/finance.integration.cjs
$env:CORTEXOPS_TEST_DB = "cortex_marketplace_test"
node --test tests/marketplace.integration.cjs
Remove-Item Env:DB_PASSWORD, Env:CORTEXOPS_TEST_DB
```

Use an unused Compose project name and free ports for a fresh container check. The settings in `.env` must include a private session secret and database passwords.

```powershell
$env:APP_PORT = "3100"
$env:MYSQL_HOST_PORT = "3310"
$env:APP_BASE_URL = "http://localhost:3100"
docker compose -p cortexops_verify config --quiet
docker compose -p cortexops_verify up --build --wait
Invoke-RestMethod http://localhost:3100/api/health
Invoke-WebRequest http://localhost:3100/
Invoke-WebRequest http://localhost:3100/api-docs/
docker compose -p cortexops_verify down
```

## One-command isolated Windows verification

With Docker Desktop running, open PowerShell in the extracted project root and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-local.ps1
```

The script creates a uniquely named Compose project and fresh volume with randomly generated private secrets, binds the application to localhost on port 3100 and MySQL to port 3310, checks the actual database object counts and HTTP endpoints, and runs the standard, resource lifecycle, finance and marketplace HTTP test suites. It creates separate `_test` schemas inside the isolated MySQL container. It does not require a local Node.js or MySQL installation and does not delete existing databases or volumes. Docker needs network access for the initial image and npm dependency downloads. If the ports are occupied, pass `-AppPort 3101 -MySqlPort 3311` (or other free ports). The script reports failed suites and leaves its isolated environment available for inspection; use the printed stop command to stop it without deleting volumes.

The script generates a private `.env.cortexops_verify_*` file rather than overwriting `.env`. Do not share or commit this file. For real email and AI testing, fill in its Brevo and Gemini settings and recreate the app in the same isolated project using the printed Compose arguments and `up -d --build`. The automated marketplace suite uses email/Gemini fixtures, so success does not verify those external services or interactive browser usability. The script is provided for local runtime verification; it has not been executed in the review environment because Docker and Windows PowerShell were unavailable.

`npm test` also includes a dependency-free mocked-DAL regression suite for unified metering, multi-provider billing, missing usage, zero invoices and unused pricing categories (`tests/billing-fixtures.test.cjs`). This does not replace the MySQL integration suites.
