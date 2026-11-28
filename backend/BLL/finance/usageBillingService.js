const { withReadSnapshot, withTransaction } = require("../../DAL/dbconn");
const repository = require("../../DAL/finance/usageBilling");

const { HttpError, sumMoney } = require("../../utils/util");
const { priceItems, createInvoiceRecord } = require("./invoiceService");

const { HOURS_PER_MONTH } = require("../../utils/constants");
const round4 = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;

// Calculate billable resource usage
async function buildUsageItems(db, customerId, periodStart, periodEnd) {
    if (!Number.isFinite(HOURS_PER_MONTH) || HOURS_PER_MONTH <= 0)
        throw new HttpError(500, { error: "Invalid billing hours per month." });

    const start = `${periodStart} 00:00:00`;
    const end = `${periodEnd} 00:00:00`;

    const [[row]] = await repository.billingCap(db, end);

    const cap = row.cap;
    const unmetered = await repository.runningVmsWithoutOpenUsage(db, customerId, cap);
    if (unmetered.length)
        throw new HttpError(409, {
            error: "A running VM is missing open CPU or RAM usage. Repair its metering before invoicing.",
            vm_ids: unmetered
        });
    const resources = await repository.loadUsage(db, customerId, start, cap);

    const buckets = new Map();
    const timestamp = (value) => new Date(value.replace(" ", "T") + "Z").getTime();
    const periodStartMs = timestamp(start);
    const capMs = timestamp(cap);
    const seconds = (from, to) =>
        Math.max(
            0,
            (Math.min(to ? timestamp(to) : capMs, capMs) -
                Math.max(timestamp(from), periodStartMs)) /
                1000
        );

    function add(providerId, type, cloudClass, quantity, seconds) {
        const hours = (Number(quantity) * Number(seconds)) / 3600;
        if (hours <= 0) return;

        const key = `${providerId}|${type}|${cloudClass}`;
        const item = buckets.get(key) || {
            provider_id: providerId,
            resource_type: type,
            cloud_class: cloudClass,
            unit_hours: 0
        };

        item.unit_hours += hours;
        buckets.set(key, item);
    }

    for (const r of resources)
        add(
            r.provider_id,
            r.resource_type,
            r.cloud_class,
            r.quantity,
            seconds(r.started_at, r.ended_at)
        );

    if (
        [...buckets.values()].some(
            (item) =>
                !Number.isSafeInteger(Number(item.provider_id)) || Number(item.provider_id) <= 0
        )
    )
        throw new HttpError(409, {
            error: "Usage records are missing provider assignment. Fix resource ownership before billing."
        });

    const items = [...buckets.values()]
        .map((item) => ({
            ...item,
            quantity: round4(item.unit_hours / HOURS_PER_MONTH),
            unit_hours: round4(item.unit_hours)
        }))
        .filter((item) => item.quantity > 0)
        .sort(
            (a, b) =>
                a.provider_id - b.provider_id ||
                a.resource_type.localeCompare(b.resource_type) ||
                a.cloud_class.localeCompare(b.cloud_class)
        );

    return {
        items,
        period_complete: cap === end,
        usage_counted_until: cap
    };
}

// Preview invoice without saving
async function previewUsageInvoice(db, { customerId, periodStart, periodEnd }) {
    const built = await buildUsageItems(db, customerId, periodStart, periodEnd);
    const priced = built.items.length ? await priceItems(db, built.items) : [];
    const subtotal = sumMoney(priced.map((item) => item.line_total));

    return {
        dry_run: true,
        customer_id: customerId,
        billing_period: { start: periodStart, end: periodEnd },
        period_complete: built.period_complete,
        usage_counted_until: built.usage_counted_until,
        subtotal,
        total: subtotal,
        currency: "USD",
        items: priced
    };
}

// Generate invoice
async function generateUsageInvoice(db, { customerId, periodStart, periodEnd }) {
    const built = await buildUsageItems(db, customerId, periodStart, periodEnd);

    if (!built.period_complete)
        throw new HttpError(409, {
            error: "Billing period has not ended. Use dry_run to preview.",
            usage_counted_until: built.usage_counted_until
        });

    if (!built.items.length)
        throw new HttpError(409, {
            error: "There is no payable amount for this billing period."
        });

    return createInvoiceRecord(db, {
        customerId,
        periodStart,
        periodEnd,
        items: built.items
    });
}

const previewUsageInvoiceForCustomer = (input) =>
    withReadSnapshot((connection) => previewUsageInvoice(connection, input));

const generateUsageInvoiceForCustomer = (input) =>
    withTransaction((connection) => generateUsageInvoice(connection, input));

module.exports = {
    previewUsageInvoice: previewUsageInvoiceForCustomer,
    generateUsageInvoice: generateUsageInvoiceForCustomer
};
