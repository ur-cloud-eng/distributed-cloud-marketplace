const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Unified metering and invoice regressions (mocked DAL)', async t => {
    const oldHours = process.env.BILLING_HOURS_PER_MONTH;
    process.env.BILLING_HOURS_PER_MONTH = '720';
    const saved = new Map();
    function mock(path, exports) {
        const key = require.resolve(path);
        saved.set(key, require.cache[key]);
        require.cache[key] = { loaded: true, exports };
    }
    t.after(() => {
        if (oldHours === undefined) delete process.env.BILLING_HOURS_PER_MONTH;
        else process.env.BILLING_HOURS_PER_MONTH = oldHours;
        for (const [key, value] of saved) {
            if (value) require.cache[key] = value;
            else delete require.cache[key];
        }
    });
    let rates = [['CPU', 2], ['RAM', 1], ['Storage', 0.03]].map(([resource_type, unit_price]) => ({ resource_type, unit_price, cloud_class: 'Economy' }));
    const start = { provider_id: 1, cloud_class: 'Economy', started_at: '2025-01-01 00:00:00.000000' };
    const records = [
        { ...start, resource_type: 'CPU', quantity: 2, ended_at: '2025-01-16 00:00:00.000000' },
        { ...start, resource_type: 'RAM', quantity: 4, ended_at: '2025-01-16 00:00:00.000000' },
        { ...start, resource_type: 'Storage', quantity: 20, ended_at: null },
        { ...start, provider_id: 2, resource_type: 'Storage', quantity: 10, ended_at: '2025-01-31 00:00:00.000000' }
    ];
    let missing = [];
    const inserted = [];
    mock('../backend/DAL/dbconn', { withReadSnapshot: fn => fn({}), withTransaction: fn => fn({}) });
    mock('../backend/DAL/finance/usageBilling', {
        billingCap: async () => [[{ cap: '2025-01-31 00:00:00' }]],
        runningVmsWithoutOpenUsage: async () => missing,
        loadUsage: async () => records
    });
    mock('../backend/DAL/finance/invoice', {
        listActivePrices: async () => [rates],
        findCustomer: async () => [[{ role: 'customer' }]],
        findProviders: async () => [[{ user_id: 1 }, { user_id: 2 }]],
        findOverlappingInvoice: async () => [[]],
        insertInvoice: async (connection, values) => { inserted.push(values); return [{ insertId: 1 }]; },
        insertItem: async () => {}
    });
    mock('../backend/DAL/finance/pricing', { listClassPrices: async () => [rates] });
    mock('../backend/BLL/finance/notificationService', { notify: async () => {} });
    const billing = require('../backend/BLL/finance/usageBillingService');
    const pricing = require('../backend/BLL/finance/pricingService');
    const input = { customerId: 3, periodStart: '2025-01-01', periodEnd: '2025-01-31' };

    await t.test('Compute stops midway while storage continues; two providers total $4.90', async () => {
        const preview = await billing.previewUsageInvoice(input);
        assert.equal(preview.total, 4.9);
        assert.deepEqual(preview.items.map(i => [i.provider_id, i.resource_type, i.line_total]), [
            [1, 'CPU', 2], [1, 'RAM', 2], [1, 'Storage', 0.6], [2, 'Storage', 0.3]
        ]);
        assert.equal(inserted.length, 0);
        const invoice = await billing.generateUsageInvoice(input);
        assert.equal(invoice.total, 4.9);
        assert.equal(inserted.length, 1);
        assert.deepEqual(inserted[0].slice(1), [3, input.periodStart, input.periodEnd, 4.9, 4.9]);
    });
    await t.test('Missing open usage is rejected', async () => {
        missing = [9];
        await assert.rejects(() => billing.previewUsageInvoice(input), e => e.status === 409);
        missing = [];
    });
    await t.test('Missing unused GPU rate is accepted, required GPU rate is rejected', async () => {
        const estimate = { cloud_class: 'Economy', cpu_cores: 2, ram_gb: 4, storage_gb: 20, gpu_units: 0 };
        assert.equal((await pricing.calculatePrice(estimate)).price_breakdown.GPU, 0);
        await assert.rejects(() => pricing.calculatePrice({ ...estimate, gpu_units: 1 }), e => e.status === 409);
    });
    await t.test('Zero-rate preview remains allowed; invoice creation rejects zero before insertion', async () => {
        rates = rates.map(r => ({ ...r, unit_price: 0 }));
        assert.equal((await billing.previewUsageInvoice(input)).total, 0);
        await assert.rejects(() => billing.generateUsageInvoice(input), e => e.status === 409);
        assert.equal(inserted.length, 1);
    });
});
