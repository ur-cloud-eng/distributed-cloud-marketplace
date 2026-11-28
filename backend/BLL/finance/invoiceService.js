const { withTransaction } = require("../../DAL/dbconn");
const repository = require("../../DAL/finance/invoice");
const { HttpError, sumMoney, priceQuantity } = require("../../utils/util");
const { bad, makeRef } = require("../../utils/helpers");
const { MAX_MONEY, MAX_QUANTITY } = require("../../utils/constants");
const { notify } = require("./notificationService");

// Price items from pricing_rules (one query for all items)
async function priceItems(db, items) {
    if (!Array.isArray(items) || !items.length) throw bad("At least one invoice item is required.");

    const [rules] = await repository.listActivePrices(db);
    const prices = new Map(
        rules.map((r) => [`${r.resource_type}|${r.cloud_class}`, Number(r.unit_price)])
    );

    return items.map((item) => {
        const quantity = Number(item.quantity);

        // Fractional quantities are valid (usage billing produces them)
        if (
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            quantity > MAX_QUANTITY ||
            Number(quantity.toFixed(4)) !== quantity
        )
            throw bad(
                "Quantity must be positive, fit DECIMAL(14,4), and have at most four decimal places."
            );

        const unitPrice = prices.get(`${item.resource_type}|${item.cloud_class}`);

        if (unitPrice === undefined || !Number.isFinite(unitPrice) || unitPrice < 0)
            throw new HttpError(409, {
                error:
                    unitPrice === undefined
                        ? `No pricing rule found for ${item.resource_type} / ${item.cloud_class}.`
                        : "Invalid pricing rule or invoice amount."
            });

        const lineTotal = priceQuantity(quantity, unitPrice);
        if (!Number.isFinite(lineTotal) || lineTotal > MAX_MONEY)
            throw bad("Invoice item amount exceeds the supported limit.");
        return { ...item, quantity, unit_price: unitPrice, line_total: lineTotal };
    });
}

// Create invoice (must run inside a transaction). Input is validated by the routes.
async function createInvoiceRecord(db, { customerId, periodStart, periodEnd, items }) {
    const [[customer]] = await repository.findCustomer(db, customerId);
    if (!customer) throw new HttpError(404, { error: `Customer ID ${customerId} does not exist.` });
    if (String(customer.role).toLowerCase() !== "customer")
        throw bad(`User ID ${customerId} is not a customer account.`);

    // Provider allocations must be legitimate: otherwise customers could pay an invoice
    // whose earnings cannot be assigned to the correct provider.
    const priced = await priceItems(db, items);
    const subtotal = sumMoney(priced.map((item) => item.line_total));
    if (subtotal === 0)
        throw new HttpError(409, { error: "There is no payable amount for this billing period." });
    if (subtotal > MAX_MONEY) throw bad("Invoice subtotal exceeds the supported limit.");
    const providerIds = [...new Set(items.map((item) => Number(item.provider_id)))];
    if (providerIds.some((id) => !Number.isSafeInteger(id) || id <= 0))
        throw bad(
            "Every invoice item must identify a valid provider. Usage invoices derive this from usage records."
        );
    const [existingProviders] = await repository.findProviders(db, providerIds);
    if (existingProviders.length !== providerIds.length)
        throw bad("One or more Provider IDs do not belong to provider accounts.");

    const [[conflict]] = await repository.findOverlappingInvoice(db, [customerId, periodStart, periodEnd]);
    if (conflict) {
        throw new HttpError(409, {
            error: "An invoice already exists for an overlapping billing period.",
            invoice_id: conflict.invoice_id,
            invoice_number: conflict.invoice_number
        });
    }

    const total = subtotal;
    const invoiceNumber = makeRef("INV");

    const [invoice] = await repository.insertInvoice(db, [
        invoiceNumber,
        customerId,
        periodStart,
        periodEnd,
        subtotal,
        total
    ]);

    for (const item of priced)
        await repository.insertItem(db, [
            invoice.insertId,
            item.provider_id ?? null,
            item.resource_type,
            item.cloud_class,
            item.quantity,
            item.unit_price,
            item.line_total
        ]);

    await notify(db, {
        to: "Customer",
        id: customerId,
        title: "New invoice",
        message: `Invoice ${invoiceNumber} for $${total.toFixed(2)} is ready for payment.`
    });

    return {
        invoice_id: invoice.insertId,
        invoice_number: invoiceNumber,
        customer_id: customerId,
        billing_period: { start: periodStart, end: periodEnd },
        status: "Unpaid",
        subtotal,
        total,
        currency: "USD",
        items: priced
    };
}

async function getInvoice(id, customerId = null) {
    const invoice = await repository.findInvoice(id, customerId);

    if (!invoice) return null;

    const [items] = await repository.listItems(id);

    return { ...invoice, currency: "USD", items };
}

async function cancelInvoice(id) {
    return withTransaction(async (connection) => {
        const [[invoice]] = await repository.lockInvoice(connection, id);
        if (!invoice) throw new HttpError(404, { error: `Invoice ID ${id} does not exist.` });
        if (invoice.status !== "Unpaid")
            throw new HttpError(409, {
                error: `Invoice ${invoice.invoice_number} is ${invoice.status}. Only unpaid invoices can be cancelled.`
            });
        const [payments] = await repository.paymentExists(connection, id);
        if (payments.length)
            throw new HttpError(409, {
                error: "This invoice has a payment record and cannot be cancelled."
            });
        const [result] = await repository.cancelInvoice(connection, id);
        if (!result.affectedRows)
            throw new HttpError(409, { error: "Invoice status changed. Reload and try again." });
        await notify(connection, {
            to: "Customer",
            id: invoice.customer_id,
            title: "Invoice cancelled",
            message: `Invoice ${invoice.invoice_number} has been cancelled.`
        });
        return { message: "Invoice cancelled successfully.", invoice_id: id, status: "Cancelled" };
    });
}

module.exports = {
    cancelInvoice,
    priceItems,
    createInvoiceRecord,
    createInvoice: (input) =>
        withTransaction((connection) => createInvoiceRecord(connection, input)),
    listInvoices: repository.listInvoices,
    getInvoice
};
