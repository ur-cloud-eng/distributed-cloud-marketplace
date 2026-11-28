const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { createHash, randomBytes } = require('node:crypto');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const schema = process.env.CORTEXOPS_TEST_DB;
if (!schema || !/^\w+_test$/.test(schema) ||
    schema.toLowerCase() === (process.env.DB_NAME || 'cloud_marketplace').toLowerCase() ||
    !process.env.DB_HOST || !process.env.DB_PORT)
    throw new Error('Use a fresh disposable MySQL schema ending in _test with explicit DB_HOST and DB_PORT.');

Object.assign(process.env, {
    DB_NAME: schema, NODE_ENV: 'test', SESSION_SECRET: randomBytes(32).toString('hex'),
    TOTP_ENCRYPTION_KEY: randomBytes(32).toString('hex'), APP_BASE_URL: 'http://localhost:3000',
    BREVO_SMTP_HOST: 'smtp.example.invalid', BREVO_SMTP_PORT: '587', BREVO_SMTP_LOGIN: 'fixture',
    BREVO_SMTP_KEY: 'fixture', MAIL_FROM: 'test@example.invalid', GEMINI_API_KEY: 'fixture',
    BILLING_HOURS_PER_MONTH: '720', PLATFORM_COMMISSION_RATE: '15'
});

test('Marketplace workflows through real session-authenticated HTTP routes', { timeout: 45000 }, async t => {
    const tokens = new Map();
    t.mock.method(nodemailer, 'createTransport', () => ({
        async sendMail({ to, text }) {
            const link = new URL(text.match(/http[^\s]+/)[0]);
            assert.equal(link.pathname, '/verify-email');
            tokens.set(to, link.searchParams.get('token'));
        }
    }));
    const httpFetch = globalThis.fetch;
    let mode = 'normal';
    let geminiCalls = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        geminiCalls++;
        assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
        const request = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
        assert.equal(request.requirements, 'Recommend a small test project');
        assert.ok(request.availableCapacity.some(host => host.region === 'east'));
        if (mode === 'offline') return { ok: false, status: 503 };
        const output = { summary: 'Project', warnings: [], resources: [
            { id: 'g', name: 'Group', type: 'Resource Group', region: 'east', reason: 'Organize', dependsOn: [] },
            { id: 'b', name: 'Files', type: 'File Storage', hostingClass: 'Economy',
                sizeGb: mode === 'invalid' ? -1 : 500, reason: 'Store', dependsOn: ['g'] }
        ] };
        return { ok: true, json: async () => ({
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }]
        }) };
    });

    const db = require('../backend/DAL/dbconn');
    const server = require('../server').listen(0, '127.0.0.1');
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await db.end();
    });
    await once(server, 'listening');
    assert.equal((await db.query('SELECT COUNT(*) AS total FROM Users'))[0][0].total, 0, 'Use a fresh schema.');
    const origin = 'http://127.0.0.1:' + server.address().port;

    function client() {
        let session;
        async function request(path, method = 'GET', data, expected = 200) {
            const response = await httpFetch(origin + path, {
                method, redirect: 'manual', body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}) }
            });
            const cookie = response.headers.get('set-cookie');
            if (cookie) {
                assert.match(cookie, /HttpOnly/i);
                assert.match(cookie, /SameSite=Lax/i);
                session = cookie.split(';')[0];
            }
            const body = response.headers.get('content-type')?.includes('application/json')
                ? await response.json() : await response.text();
            assert.equal(response.status, expected, method + ' ' + path);
            return expected === 302 ? response.headers.get('location') : body;
        }
        request.session = () => session;
        return request;
    }

    const customer = client(), provider = client(), admin = client(), outsider = client(), otherProvider = client();
    const auth = '/api/auth';
    const password = 'Disposable-fixture-password-28';
    const email = role => role + '@example.invalid';
    const credentials = role => ({ email: email(role), password });
    const registration = role => ({ ...credentials(role), role, firstName: 'Test', lastName: 'User' });
    const verify = (account, token, status = 200) => account(auth + '/verify-email', 'POST', { token }, status);
    const login = (account, role, status = 200) => account(auth + '/login', 'POST', credentials(role), status);

    await customer('/api/instances', 'GET', undefined, 401);
    await customer(auth + '/register', 'POST', { ...registration('customer'), password: 'short' }, 400);
    await customer(auth + '/register', 'POST', registration('customer'), 201);
    await provider(auth + '/register', 'POST', registration('provider'), 201);
    await customer(auth + '/register', 'POST', registration('customer'), 409);
    await admin(auth + '/register', 'POST', registration('admin'), 400);
    await admin(auth + '/register', 'POST', registration('provider'), 429);

    const [[user]] = await db.execute('SELECT user_id,password_hash FROM Users WHERE email=?', [email('customer')]);
    assert.notEqual(user.password_hash, password);
    assert.equal(await bcrypt.compare(password, user.password_hash), true);
    const initial = tokens.get(email('customer'));
    const [[stored]] = await db.execute('SELECT token_hash FROM EmailVerificationTokens WHERE user_id=?', [user.user_id]);
    assert.equal(stored.token_hash, createHash('sha256').update(initial).digest('hex'));
    await login(customer, 'customer', 401);
    await verify(customer, 'invalid', 400);
    await db.execute('UPDATE EmailVerificationTokens SET created_at=UTC_TIMESTAMP()-INTERVAL 32 MINUTE, expires_at=UTC_TIMESTAMP()-INTERVAL 2 MINUTE WHERE user_id=?', [user.user_id]);
    await verify(customer, initial, 400);
    await customer(auth + '/resend-verification', 'POST', { email: email('customer') });
    assert.notEqual(tokens.get(email('customer')), initial);
    await verify(customer, tokens.get(email('customer')));
    await verify(customer, tokens.get(email('customer')), 400);
    await verify(provider, tokens.get(email('provider')));

    const hash = await bcrypt.hash(password, 4);
    for (const [name, role] of [['admin', 'admin'], ['outsider', 'customer'], ['other-provider', 'provider']])
        await db.execute("INSERT INTO Users(first_name,last_name,email,password_hash,role,email_verified_at) VALUES ('Fixture','User',?,?,?,UTC_TIMESTAMP())", [email(name), hash, role]);

    await customer(auth + '/login', 'POST', { email: email('customer'), password: 'wrong-password' }, 401);
    for (const [session, role] of [[customer, 'customer'], [provider, 'provider'], [admin, 'admin'], [outsider, 'outsider'], [otherProvider, 'other-provider']])
        await login(session, role);
    assert.equal((await customer(auth + '/me')).user.role, 'customer');
    assert.equal(await customer('/portal/admin', 'GET', undefined, 302), '/portal/customer');
    assert.match(await provider('/portal/provider'), /My Hosts/);
    await customer('/api/admin/dashboard', 'GET', undefined, 403);
    await provider('/api/customers/me/invoices', 'GET', undefined, 403);

    const host = { name: 'East', region: 'east', hostingClass: 'Economy', totalCpu: 4, totalRamGb: 8, totalDiskGb: 100 };
    const { hostId } = await provider('/api/hosts', 'POST', host, 201);
    const hostPath = '/api/hosts/' + hostId;
    await provider('/api/hosts', 'POST', { ...host, name: 'Invalid', totalCpu: 0 }, 400);
    await provider('/api/hosts', 'POST', { ...host, name: 'Other region', region: 'west' }, 201);
    await provider('/api/hosts', 'POST', { ...host, name: 'Other class', hostingClass: 'Business' }, 201);
    assert.equal((await provider('/api/hosts')).hosts.length, 3);
    await provider(hostPath, 'PATCH', { status: 'maintenance' });
    await provider(hostPath, 'PATCH', { status: 'available' });
    await otherProvider(hostPath, 'PATCH', { totalCpu: 90 }, 404);

    const { groupId } = await customer('/api/resource-groups', 'POST', { name: 'Project', region: 'east' }, 201);
    const group = '/api/resource-groups/' + groupId;
    const networks = group + '/virtual-networks';
    await outsider(group, 'GET', undefined, 404);
    await customer(networks, 'POST', { name: 'Invalid', cidrBlock: '10.0.0.1/16' }, 400);
    const { vnetId } = await customer(networks, 'POST', { name: 'Network', cidrBlock: '10.0.0.0/16' }, 201);
    const subnets = networks + '/' + vnetId + '/subnets';
    const { subnetId } = await customer(subnets, 'POST', { name: 'Subnet', cidrBlock: '10.0.1.0/24' }, 201);
    for (const path of ['/api/resource-groups', group, networks, networks + '/' + vnetId, subnets, subnets + '/' + subnetId])
        await customer(path);

    const instances = '/api/instances';
    const vmData = { subnetId, hostingClass: 'Economy', vcpu: 3, ramGb: 4, diskGb: 20 };
    const { vmId } = await customer(instances, 'POST', { ...vmData, name: 'VM' }, 201);
    const vm = instances + '/' + vmId;
    assert.equal((await customer(vm)).instance.host_id, hostId);
    await outsider(vm + '/start', 'POST', {}, 404);
    await provider(hostPath, 'PATCH', { totalCpu: 2 }, 409);
    await customer(subnets + '/' + subnetId, 'DELETE', undefined, 409);
    await customer(vm + '/start', 'POST', {});
    await customer(vm + '/stop', 'POST', {});
    assert.equal((await provider(hostPath)).free_cpu, 1);
    await customer(vm, 'DELETE');
    await customer(vm, 'GET', undefined, 404);

    const shape = { name: 'Allocated', hostingClass: 'Economy', vcpu: 1, ramGb: 1, diskGb: 5, sizeGb: 5 };
    const blobs = group + '/storage/blob';
    const files = group + '/storage/file';
    const blob = await customer(blobs, 'POST', { ...shape, name: 'Shared name' }, 201);
    const file = await customer(files, 'POST', { ...shape, name: 'Shared name' }, 201);
    assert.deepEqual((await customer(blobs)).map(row => row.blob_id), [blob.id]);
    assert.deepEqual((await customer(files)).map(row => row.file_id), [file.id]);
    assert.equal((await customer(blobs + '/' + blob.id)).blob_id, blob.id);
    assert.equal((await customer(files + '/' + file.id)).file_id, file.id);
    await customer(blobs + '/' + file.id, 'GET', undefined, 404);
    await customer(files + '/' + blob.id, 'DELETE', undefined, 404);
    await outsider(blobs + '/' + blob.id, 'GET', undefined, 404);
    await customer(blobs, 'POST', { ...shape, name: 'Shared name' }, 409);
    await customer(group, 'DELETE', undefined, 409);
    assert.equal((await provider(hostPath)).free_disk_gb, 90);
    for (const resourceId of [blob.resourceId, file.resourceId]) {
        const [[meter]] = await db.execute(
            "SELECT quantity FROM ResourceUsagePeriods WHERE resource_id=? AND resource_type='Storage' AND ended_at IS NULL", [resourceId]);
        assert.equal(meter.quantity, 5);
    }
    await assert.rejects(db.execute("UPDATE StorageVolumes SET storage_type='FILE_STORAGE' WHERE storage_id=?", [blob.id]), /Storage type cannot change/);
    await assert.rejects(db.execute("UPDATE ResourceRegistry SET storage_id=? WHERE resource_id=?", [file.id, blob.resourceId]), /registry identity cannot change/);
    const [{ insertId: unregistered }] = await db.execute(
        "INSERT INTO StorageVolumes(group_id,storage_type,name,size_gb) VALUES (?,'BLOB_STORAGE','Registry fixture',1)", [groupId]);
    await assert.rejects(db.execute(
        "INSERT INTO ResourceRegistry(group_id,customer_user_id,resource_type,storage_id) VALUES (?,?,'FILE_STORAGE',?)",
        [groupId, user.user_id, unregistered]), /Storage type\/resource type mismatch/);
    await db.execute('DELETE FROM StorageVolumes WHERE storage_id=?', [unregistered]);
    await customer(blobs + '/' + blob.id, 'DELETE');
    await customer(files + '/' + file.id, 'DELETE');
    assert.equal((await provider(hostPath)).free_disk_gb, 100);

    const types = [
        ['/storage/blob', {}, 'blob_id'], ['/storage/file', {}, 'file_id'],
        ['/load-balancers', { vnetId, algorithm: 'round_robin' }, 'lb_id'],
        ...['SQL_SERVER', 'POSTGRESQL', 'MYSQL'].map(engine => ['/databases', { engine, name: engine }, 'database_id'])
    ];
    for (const [suffix, fields, idKey] of types) {
        const path = group + suffix;
        const item = await customer(path, 'POST', { ...shape, ...fields }, 201);
        assert.equal(item.hostId, hostId);
        assert.ok((await customer(path)).some(row => row[idKey] === item.id));
        const details = await customer(path + '/' + item.id);
        if (fields.engine) {
            assert.equal(details.engine, fields.engine);
            assert.equal(details.resource_type, fields.engine);
        }
        await outsider(path + '/' + item.id, 'DELETE', undefined, 404);
        await customer(path + '/' + item.id, 'DELETE');
    }

    const { id: databaseId } = await customer(group + '/databases', 'POST', { ...shape, name: 'Web database', engine: 'MYSQL' }, 201);
    const apps = group + '/web-apps';
    const { id: appId } = await customer(apps, 'POST', { ...shape, databaseId }, 201);
    assert.ok((await customer(apps)).some(row => row.webapp_id === appId));
    await customer(apps + '/' + appId);
    await outsider(apps + '/' + appId, 'DELETE', undefined, 404);
    await customer(group + '/databases/' + databaseId, 'DELETE', undefined, 409);
    await customer(apps + '/' + appId, 'DELETE');
    await customer(group + '/databases/' + databaseId, 'DELETE');
    assert.equal((await provider(hostPath)).free_disk_gb, 100);

    const race = await Promise.allSettled(['Race A', 'Race B'].map(name => customer(instances, 'POST', { ...vmData, name }, 201)));
    const winner = race.find(result => result.status === 'fulfilled');
    assert.ok(winner);
    assert.equal(race.find(result => result.status === 'rejected')?.reason.actual, 409);
    assert.equal((await provider(hostPath)).free_cpu, 1);
    await customer(instances + '/' + winner.value.vmId, 'DELETE');
    await customer(subnets + '/' + subnetId, 'DELETE');
    await customer(networks + '/' + vnetId, 'DELETE');
    await customer(group, 'DELETE');

    const [[{ resource_id: vmResource }]] = await db.execute("SELECT resource_id FROM ResourceRegistry WHERE vm_id=?", [vmId]);
    await db.execute("UPDATE ResourceUsagePeriods SET started_at='2025-01-01',ended_at='2025-01-31' WHERE resource_id=? AND resource_type<>'Storage'", [vmResource]);
    await db.execute("UPDATE ResourceUsagePeriods SET started_at='2025-01-01',ended_at='2025-01-31' WHERE resource_id=? AND resource_type='Storage'", [vmResource]);
    const period = { customer_id: user.user_id, billing_period_start: '2025-01-01', billing_period_end: '2025-01-31' };
    assert.equal((await admin('/api/billing/usage-invoices', 'POST', { ...period, dry_run: true })).total, 10.6);
    const invoice = await admin('/api/billing/usage-invoices', 'POST', period, 201);
    await outsider('/api/customers/me/invoices/' + invoice.invoice_id, 'GET', undefined, 404);
    const payment = await customer('/api/customers/me/payments', 'POST', { invoice_id: invoice.invoice_id }, 201);
    assert.equal(payment.amount, 10.6);
    const earnings = await provider('/api/providers/me/earnings');
    assert.deepEqual([earnings.gross_earnings, earnings.platform_commission, earnings.net_earnings], [10.6, 1.59, 9.01]);
    assert.equal((await admin('/api/admin/dashboard')).invoices.paid_count, 1);
    assert.ok((await customer('/api/notifications')).some(row => row.payment_id === payment.payment_id));

    const advisor = '/api/ai/architecture/recommend';
    const input = { requirements: 'Recommend a small test project' };
    await provider(advisor, 'POST', input, 403);
    await customer(advisor, 'POST', { requirements: 'short' }, 400);
    assert.deepEqual((await customer(advisor, 'POST', input)).capacityCheck, { feasible: false, unavailable: ['Files'] });
    mode = 'invalid';
    await customer(advisor, 'POST', input, 502);
    mode = 'offline';
    await customer(advisor, 'POST', input, 502);
    await customer(advisor, 'POST', input, 502);
    await customer(advisor, 'POST', input, 429);
    assert.equal(geminiCalls, 4);
    await provider(hostPath, 'DELETE');
    assert.equal((await provider(hostPath)).status, 'inactive');

    for (const [session, method, path] of [
        [customer, 'POST', vm + '/restart'], [customer, 'POST', vm + '/ip'],
        [customer, 'DELETE', vm + '/ip'], [customer, 'GET', vm + '/activity'],
        [customer, 'GET', group + '/load-balancers/1/targets'],
        [customer, 'POST', group + '/load-balancers/1/targets'],
        [customer, 'DELETE', group + '/load-balancers/1/targets/1'],
        [customer, 'GET', '/api/customers/me/refunds'], [admin, 'GET', '/api/admin/refunds'],
        [admin, 'POST', '/api/finance/refunds'], [provider, 'GET', '/api/providers/me/withdrawals'],
        [admin, 'GET', '/api/finance/withdrawals'], [admin, 'GET', '/api/discounts'],
        [admin, 'GET', '/api/finance/discount-codes'], [admin, 'GET', '/api/admin/audit-log'],
        [admin, 'GET', '/api/pricing/1/history']
    ]) await session(path, method, method === 'POST' ? {} : undefined, 404);

    await assert.rejects(db.execute("UPDATE pricing_rules SET unit_price=-1 WHERE id=1"), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    await assert.rejects(db.execute("INSERT INTO Notifications(user_id,category,title,message) VALUES (-1,'billing','Test','Test')"), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(db.execute("INSERT INTO payments(payment_reference,invoice_id,amount) VALUES ('duplicate-fixture',?,?)", [invoice.invoice_id, payment.amount]), { code: 'ER_DUP_ENTRY' });

    const { generate } = await import('otplib');
    const now = Date.now();
    t.mock.method(Date, 'now', () => now);
    const setup = await customer(auth + '/2fa/setup', 'POST', {});
    assert.match(setup.qrCode, /^data:image\/png;base64,/);
    const [[enrollment]] = await db.execute('SELECT encrypted_secret FROM UserTwoFactor WHERE user_id=?', [user.user_id]);
    assert.equal(enrollment.encrypted_secret.includes(setup.manualKey), false);
    const epoch = Math.floor(Date.now() / 30000) * 30;
    const previous = await generate({ secret: setup.manualKey, epoch: epoch - 30 });
    const current = await generate({ secret: setup.manualKey, epoch });
    await customer(auth + '/2fa/confirm', 'POST', { code: previous });
    const originalSession = customer.session();
    assert.equal((await login(customer, 'customer', 202)).requires2FA, true);
    const pendingSession = customer.session();
    assert.ok(pendingSession !== originalSession);
    await customer(auth + '/me', 'GET', undefined, 401);
    assert.match(await customer('/two-factor'), /Two-factor authentication/);
    await customer(auth + '/login/2fa', 'POST', { code: 'invalid' }, 400);
    const wrongCode = ['000000', '111111', '222222'].find(code => code !== previous && code !== current);
    await customer(auth + '/login/2fa', 'POST', { code: wrongCode }, 401);
    await customer(auth + '/login/2fa', 'POST', { code: previous }, 401);
    await customer(auth + '/login/2fa', 'POST', { code: current });
    assert.ok(customer.session() !== pendingSession);
    await customer(auth + '/me');
    const authenticatedSession = customer.session();
    await customer(auth + '/logout', 'POST', {});
    await customer(auth + '/me', 'GET', undefined, 401);
    const signedOut = await httpFetch(origin + auth + '/me', { headers: { Cookie: authenticatedSession } });
    assert.equal(signedOut.status, 401);
});
