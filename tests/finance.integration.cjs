const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');

const testDatabase = process.env.CORTEXOPS_TEST_DB;
if (!testDatabase || !/^[a-zA-Z0-9_]+_test$/.test(testDatabase) ||
    testDatabase.toLowerCase() === (process.env.DB_NAME || 'cloud_marketplace').toLowerCase() ||
    !process.env.DB_HOST || !process.env.DB_PORT) {
    throw new Error('Use an empty, initialized disposable database ending in _test with explicit DB_HOST and DB_PORT.');
}
process.env.DB_NAME = testDatabase;
process.env.BILLING_HOURS_PER_MONTH = '720';
process.env.PLATFORM_COMMISSION_RATE = '15';

const db = require('../backend/DAL/dbconn');
const { authenticate, requireRole } = require('../backend/PL/middleware/access');
const routes = '../backend/PL/routes/finance/';
const hostService = require('../backend/BLL/instances/hostService');
const groupService = require('../backend/BLL/instances/resourceGroupService');
const networks = require('../backend/BLL/instances/virtualNetworkService');
const subnets = require('../backend/BLL/instances/subnetService');
const vm = require('../backend/BLL/instances/instanceService');
const storage = require('../backend/BLL/instances/storageService');

test('Financial routes on the simplified MySQL schema', { timeout: 30000 }, async t => {
    t.after(() => db.end());
    const [[users]] = await db.query('SELECT COUNT(*) AS total FROM Users');
    assert.equal(users.total, 0, 'Use a freshly initialized, disposable database.');

    const ids = {};
    const roles = { admin: 'admin', customer: 'customer', outsider: 'customer', first: 'provider', second: 'provider' };
    for (const [name, role] of Object.entries(roles)) {
        const [result] = await db.execute(
            `INSERT INTO Users(first_name,last_name,email,password_hash,role,email_verified_at)
             VALUES ('Finance','Test',?,'test-only',?,UTC_TIMESTAMP())`,
            [name + '@example.invalid', role]
        );
        ids[name] = result.insertId;
    }

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const actor = req.get('X-Test-Actor');
        if (Object.hasOwn(ids, actor))
            req.session = { user: { userId: ids[actor], role: roles[actor] } };
        next();
    });
    app.use('/pricing', authenticate, require(routes + 'pricing'));
    app.use('/billing', authenticate, requireRole('Admin'), require(routes + 'billing'));
    app.use('/finance', authenticate, requireRole('Admin'), require(routes + 'finance'));
    app.use('/admin', authenticate, requireRole('Admin'), require(routes + 'admin'));
    app.use('/customer', authenticate, requireRole('Customer'), require(routes + 'customer'));
    app.use('/provider', authenticate, requireRole('Provider'), require(routes + 'provider'));
    app.use('/notifications', authenticate, require(routes + 'notifications'));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve())
    ));
    await once(server, 'listening');

    async function request(actor, path, method = 'GET', data) {
        const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
            method,
            headers: { 'X-Test-Actor': actor, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return { status: response.status, body: await response.json() };
    }
    async function expect(expected, ...args) {
        const response = await request(...args);
        assert.equal(response.status, expected, JSON.stringify(response.body));
        return response.body;
    }

    const host = { name: 'host', hostingClass: 'Economy', totalCpu: 4, totalRamGb: 8, totalDiskGb: 40 };
    await hostService.create(ids.first, { ...host, region: 'east' });
    await hostService.create(ids.second, { ...host, region: 'west' });
    const east = await groupService.create(ids.customer, { name: 'east', region: 'east' });
    const west = await groupService.create(ids.customer, { name: 'west', region: 'west' });
    const network = await networks.create(ids.customer, east, { name: 'net', cidrBlock: '10.0.0.0/16' });
    const subnet = await subnets.create(ids.customer, east, network, { name: 'subnet', cidrBlock: '10.0.1.0/24' });
    const vmId = await vm.createInstance(ids.customer, {
        name: 'vm', subnetId: subnet, hostingClass: 'Economy', vcpu: 2, ramGb: 4, diskGb: 20
    });
    const [[{ resource_id: vmResource }]] = await db.execute("SELECT resource_id FROM ResourceRegistry WHERE vm_id=?", [vmId]);
    const actor = { id: ids.customer, role: 'Customer' };
    await vm.startInstance(vmId, actor);
    await vm.stopInstance(vmId, actor);
    const blob = await storage.create(ids.customer, west, 'blob', {
        name: 'blob', hostingClass: 'Economy', sizeGb: 10
    });

    await db.execute("UPDATE ResourceUsagePeriods SET started_at='2025-01-01', ended_at='2025-01-16' WHERE resource_id=? AND resource_type<>'Storage'", [vmResource]);
    await db.execute("UPDATE ResourceUsagePeriods SET started_at='2025-01-01' WHERE resource_id=? AND resource_type='Storage'", [vmResource]);
    await db.execute("UPDATE ResourceUsagePeriods SET started_at='2025-01-01', ended_at='2025-01-31' WHERE resource_id=?", [blob.resourceId]);

    const prices = await expect(200, 'admin', '/pricing');
    const cpu = prices.find(row => row.resource_type === 'CPU' && row.cloud_class === 'Economy');
    const rate = { cloud_class: 'Economy', cpu_cores: 2, ram_gb: 4, storage_gb: 20 };
    assert.equal((await expect(200, 'customer', '/pricing/calculate', 'POST', rate)).estimated_monthly_price, 8.6);
    await expect(403, 'customer', '/pricing/' + cpu.id, 'PUT', { unit_price: 3 });
    await expect(403, 'customer', '/billing/invoices');

    const input = { customer_id: ids.customer, billing_period_start: '2025-01-01', billing_period_end: '2025-01-31' };
    const preview = await expect(200, 'admin', '/billing/usage-invoices', 'POST', { ...input, dry_run: true });
    assert.equal(preview.total, 4.9);
    assert.deepEqual(preview.items.map(item => [item.provider_id, item.resource_type, item.line_total]), [
        [ids.first, 'CPU', 2], [ids.first, 'RAM', 2], [ids.first, 'Storage', 0.6], [ids.second, 'Storage', 0.3]
    ]);
    assert.deepEqual(await expect(200, 'customer', '/customer/invoices'), []);

    const overlap = { ...input, billing_period_end: '2025-02-01' };
    const generated = await Promise.all([input, overlap].map(body =>
        request('admin', '/billing/usage-invoices', 'POST', body)
    ));
    assert.deepEqual(generated.map(response => response.status).sort(), [201, 409]);
    const invoice = generated.find(response => response.status === 201).body;
    assert.equal(invoice.total, invoice.subtotal);
    assert.equal(invoice.total, invoice.items.reduce((total, item) => total + Math.round(item.line_total * 100), 0) / 100);

    await expect(200, 'admin', '/pricing/' + cpu.id, 'PUT', { unit_price: 3 });
    const detail = await expect(200, 'customer', '/customer/invoices/' + invoice.invoice_id);
    assert.equal(detail.total, invoice.total);
    assert.equal(detail.items.find(item => item.resource_type === 'CPU').unit_price, 2);
    await expect(404, 'outsider', '/customer/invoices/' + invoice.invoice_id);

    const paymentInput = { invoice_id: invoice.invoice_id };
    await expect(404, 'outsider', '/customer/payments', 'POST', paymentInput);
    await expect(403, 'first', '/customer/payments', 'POST', paymentInput);
    const attempts = await Promise.all([1, 2].map(() =>
        request('customer', '/customer/payments', 'POST', paymentInput)
    ));
    assert.deepEqual(attempts.map(response => response.status).sort(), [201, 409]);
    const payment = attempts.find(response => response.status === 201).body;
    assert.equal(payment.amount, invoice.total);
    assert.equal(payment.platform_commission_rate, 15);
    const gross = invoice.items.reduce((cents, item) =>
        cents + (item.provider_id === ids.first ? Math.round(item.line_total * 100) : 0), 0);
    const commission = Math.round(gross * 0.15);
    assert.deepEqual(payment.provider_earnings.map(line =>
        [line.provider_id, line.gross_amount, line.commission_amount, line.net_amount]), [
        [ids.first, gross / 100, commission / 100, (gross - commission) / 100],
        [ids.second, 0.3, 0.05, 0.25]
    ]);
    await expect(409, 'admin', '/billing/invoices/' + invoice.invoice_id + '/cancel', 'PATCH');
    assert.equal((await expect(200, 'customer', '/customer/payments')).length, 1);

    const manual = {
        ...input, billing_period_start: '2025-03-01', billing_period_end: '2025-04-01',
        resources: [{ provider_id: ids.first, resource_type: 'CPU', cloud_class: 'Economy', quantity: 1 }]
    };
    await expect(200, 'admin', '/pricing/' + cpu.id, 'DELETE');
    await expect(409, 'admin', '/billing/invoices', 'POST', manual);
    const [[period]] = await db.query("SELECT COUNT(*) AS total FROM invoices WHERE period_start='2025-03-01'");
    assert.equal(period.total, 0);
    const restored = await expect(201, 'admin', '/pricing', 'POST', {
        resource_type: 'CPU', cloud_class: 'Economy', unit_price: 3
    });
    assert.equal(restored.id, cpu.id);
    const largeItem = { ...manual.resources[0], quantity: 2000000000 };
    await expect(400, 'admin', '/billing/invoices', 'POST', { ...manual, resources: [largeItem, largeItem] });
    const [[rolledBack]] = await db.query("SELECT COUNT(*) AS total FROM invoices WHERE period_start='2025-03-01'");
    assert.equal(rolledBack.total, 0);
    const unpaid = await expect(201, 'admin', '/billing/invoices', 'POST', manual);
    await expect(200, 'admin', '/billing/invoices/' + unpaid.invoice_id + '/cancel', 'PATCH');
    await expect(409, 'customer', '/customer/payments', 'POST', { invoice_id: unpaid.invoice_id });

    const earnings = await expect(200, 'second', '/provider/earnings');
    assert.deepEqual([earnings.gross_earnings, earnings.platform_commission, earnings.net_earnings], [0.3, 0.05, 0.25]);
    assert.equal(earnings.lines.length, 1);
    const dashboard = await expect(200, 'admin', '/admin/dashboard');
    assert.deepEqual([dashboard.invoices.paid_count, dashboard.invoices.unpaid_count, dashboard.invoices.cancelled_count], [1, 0, 1]);
    assert.equal(dashboard.payments.recorded_total, payment.amount);
    assert.equal(dashboard.earnings.platform_commission, (commission + 5) / 100);
    await expect(403, 'second', '/finance/dashboard');

    const inbox = await expect(200, 'customer', '/notifications?unread_only=true');
    const notice = inbox.find(row => row.payment_id === payment.payment_id);
    assert.ok(notice);
    await expect(404, 'outsider', '/notifications/' + notice.id + '/read', 'PATCH');
    await expect(200, 'customer', '/notifications/' + notice.id + '/read', 'PATCH');
    assert.ok(!(await expect(200, 'customer', '/notifications?unread_only=true')).some(row => row.id === notice.id));
    assert.equal((await expect(200, 'second', '/notifications'))[0].title, 'Earnings recorded');

    await t.test('retired rates are required only for quantities above zero', async () => {
        const gpu = prices.find(row => row.resource_type === 'GPU' && row.cloud_class === 'Economy');
        const ram = prices.find(row => row.resource_type === 'RAM' && row.cloud_class === 'Economy');
        await expect(200, 'admin', '/pricing/' + gpu.id, 'DELETE');
        try {
            const estimate = await expect(200, 'customer', '/pricing/calculate', 'POST', rate);
            assert.equal(estimate.estimated_monthly_price, 10.6);
            assert.equal(estimate.estimated_hourly_price, Number((10.6 / 720).toFixed(8)));
            assert.equal(estimate.price_breakdown.GPU, 0);
            assert.match((await expect(409, 'customer', '/pricing/calculate', 'POST', { ...rate, gpu_units: 1 })).error, /GPU/);
            const ordinaryVm = await vm.createInstance(ids.customer, {
                name: 'No GPU required', subnetId: subnet, hostingClass: 'Economy', vcpu: 1, ramGb: 1, diskGb: 5
            });
            await vm.deleteInstance(ordinaryVm, actor);

            await expect(200, 'admin', '/pricing/' + ram.id, 'DELETE');
            try {
                const cpuOnly = await expect(200, 'customer', '/pricing/calculate', 'POST', { ...rate, ram_gb: 0, storage_gb: 0 });
                assert.equal(cpuOnly.estimated_monthly_price, 6);
                assert.equal(cpuOnly.price_breakdown.RAM, 0);
                assert.match((await expect(409, 'customer', '/pricing/calculate', 'POST', rate)).error, /RAM/);
            } finally {
                await expect(201, 'admin', '/pricing', 'POST', ram);
            }
        } finally {
            await expect(201, 'admin', '/pricing', 'POST', gpu);
        }
    });

    await t.test('zero invoices are rejected and their periods remain available', async () => {
        const rounded = { ...manual, billing_period_start: '2025-04-01', billing_period_end: '2025-05-01' };
        const tiny = { ...rounded.resources[0], quantity: 0.0001 };
        const zero = await expect(409, 'admin', '/billing/invoices', 'POST', { ...rounded, resources: [tiny] });
        assert.match(zero.error, /no payable amount/i);
        assert.equal((await expect(201, 'admin', '/billing/invoices', 'POST', rounded)).total, 3);

        const freeStorage = prices.find(row => row.resource_type === 'Storage' && row.cloud_class === 'Economy');
        const usagePeriod = { ...input, billing_period_start: '2025-06-01', billing_period_end: '2025-07-01' };
        await expect(200, 'admin', '/pricing/' + freeStorage.id, 'PUT', { unit_price: 0 });
        try {
            const dryRun = await expect(200, 'admin', '/billing/usage-invoices', 'POST', { ...usagePeriod, dry_run: true });
            assert.ok(dryRun.items.length);
            assert.equal(dryRun.total, 0);
            const rejected = await expect(409, 'admin', '/billing/usage-invoices', 'POST', usagePeriod);
            assert.match(rejected.error, /no payable amount/i);
            const [[reserved]] = await db.execute('SELECT COUNT(*) AS total FROM invoices WHERE customer_id=? AND period_start=?',
                [ids.customer, usagePeriod.billing_period_start]);
            assert.equal(reserved.total, 0);
        } finally {
            await expect(200, 'admin', '/pricing/' + freeStorage.id, 'PUT', { unit_price: freeStorage.unit_price });
        }
        assert.equal((await expect(201, 'admin', '/billing/usage-invoices', 'POST', usagePeriod)).total, 0.6);
        const empty = { ...input, customer_id: ids.outsider };
        assert.equal((await expect(200, 'admin', '/billing/usage-invoices', 'POST', { ...empty, dry_run: true })).total, 0);
        assert.match((await expect(409, 'admin', '/billing/usage-invoices', 'POST', empty)).error, /no payable amount/i);
    });

    await t.test('cancelled and exact periods still block overlap, while adjacent periods work', async () => {
        const duplicate = await expect(409, 'admin', '/billing/invoices', 'POST', manual);
        assert.equal(duplicate.invoice_id, unpaid.invoice_id);
        const overlap = { ...manual, billing_period_start: '2025-03-15', billing_period_end: '2025-04-02' };
        assert.equal((await expect(409, 'admin', '/billing/invoices', 'POST', overlap)).invoice_id, unpaid.invoice_id);
        const adjacent = { ...manual, billing_period_start: '2025-05-01', billing_period_end: '2025-06-01' };
        const created = await expect(201, 'admin', '/billing/invoices', 'POST', adjacent);
        assert.deepEqual(created.billing_period, { start: '2025-05-01', end: '2025-06-01' });
        const stored = await expect(200, 'customer', '/customer/invoices/' + created.invoice_id);
        assert.equal(stored.customer_id, ids.customer);
        assert.equal(stored.period_start, adjacent.billing_period_start);
        assert.equal(stored.period_end, adjacent.billing_period_end);
    });

    await t.test('historical billing uses actual intervals and still detects a missing open interval', async () => {
        const historicalVm = await vm.createInstance(ids.customer, {
            name: 'Historical VM', subnetId: subnet, hostingClass: 'Economy', vcpu: 1, ramGb: 1, diskGb: 10
        });
        const [[{ resource_id: historicalResource }]] = await db.execute("SELECT resource_id FROM ResourceRegistry WHERE vm_id=?", [historicalVm]);
        const period = { ...input, billing_period_start: '2024-11-01', billing_period_end: '2024-12-01' };
        const preview = () => expect(200, 'admin', '/billing/usage-invoices', 'POST', { ...period, dry_run: true });
        await db.execute("UPDATE VirtualMachines SET created_at='2024-10-31' WHERE vm_id=?", [historicalVm]);
        await db.execute("UPDATE ResourceUsagePeriods SET started_at='2024-10-31' WHERE resource_id=? AND resource_type='Storage'", [historicalResource]);
        const stopped = await preview();
        assert.deepEqual(stopped.items.map(item => [item.resource_type, item.line_total]), [['Storage', 0.3]]);

        await vm.startInstance(historicalVm, actor);
        await db.execute("UPDATE ResourceUsagePeriods SET started_at='2024-12-01' WHERE resource_id=? AND resource_type<>'Storage'", [historicalResource]);
        assert.equal((await preview()).total, stopped.total);
        assert.equal((await expect(201, 'admin', '/billing/usage-invoices', 'POST', period)).total, stopped.total);

        await db.execute("UPDATE ResourceUsagePeriods SET started_at='2024-10-31' WHERE resource_id=? AND resource_type<>'Storage'", [historicalResource]);
        assert.deepEqual((await preview()).items.map(item => [item.resource_type, item.quantity]), [
            ['CPU', 1], ['RAM', 1], ['Storage', 10]
        ]);
        await vm.stopInstance(historicalVm, actor);
        await db.execute("UPDATE ResourceUsagePeriods SET ended_at='2024-11-16' WHERE resource_id=? AND resource_type<>'Storage'", [historicalResource]);
        assert.equal((await preview()).total, 2.3);

        await vm.startInstance(historicalVm, actor);
        await db.execute("DELETE FROM ResourceUsagePeriods WHERE resource_id=? AND resource_type='RAM' AND ended_at IS NULL", [historicalResource]);
        const invalid = await expect(409, 'admin', '/billing/usage-invoices', 'POST', { ...period, dry_run: true });
        assert.deepEqual(invalid.vm_ids, [historicalVm]);
        const beforeCreation = await expect(200, 'admin', '/billing/usage-invoices', 'POST', {
            ...period, billing_period_start: '2024-09-01', billing_period_end: '2024-10-01', dry_run: true
        });
        assert.equal(beforeCreation.total, 0);
    });

});
