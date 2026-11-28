const { where } = require("../query");
const db = require("../dbconn");

const findCustomer = (connection, customerId) =>
    connection.execute("SELECT user_id, role FROM Users WHERE user_id = ? LIMIT 1 FOR UPDATE", [
        customerId
    ]);

const findProviders = (connection, ids) =>
    connection.execute(
        `SELECT user_id FROM Users WHERE role = 'provider' AND user_id IN (${ids.map(() => "?").join(",")})`,
        ids
    );

const listItems = (invoiceId) =>
    db.execute(
        `
        SELECT provider_id, resource_type, cloud_class, quantity, unit_price, line_total
        FROM invoice_items WHERE invoice_id = ? ORDER BY id
    `,
        [invoiceId]
    );

const insertItem = (connection, params) =>
    connection.execute(
        `
            INSERT INTO invoice_items
            (invoice_id, provider_id, resource_type, cloud_class, quantity, unit_price, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        params
    );

const insertInvoice = (connection, params) =>
    connection.execute(
        `
        INSERT INTO invoices
        (invoice_number, customer_id, period_start, period_end, status, subtotal, total)
        VALUES (?, ?, ?, ?, 'Unpaid', ?, ?)
    `,
        params
    );

const findOverlappingInvoice = (connection, params) =>
    connection.execute(
        `SELECT id AS invoice_id, invoice_number FROM invoices
         WHERE customer_id=? AND period_end>? AND period_start<?
         ORDER BY period_start, id LIMIT 1 FOR UPDATE`,
        params
    );

const listActivePrices = (connection) =>
    connection.execute("SELECT resource_type, cloud_class, unit_price FROM pricing_rules WHERE active = TRUE");

async function listInvoices(customerId = null) {
    const w = where({ "i.customer_id": customerId });

    const [rows] = await db.execute(
        `
        SELECT ${columns}
        FROM invoices i
        ${w.sql}
        ORDER BY i.created_at DESC, i.id DESC
    `,
        w.params
    );

    return rows;
}

const columns = `i.id, i.invoice_number, i.customer_id, i.period_start, i.period_end, i.status, i.subtotal, i.total, i.created_at`;

async function findInvoice(id, customerId) {
    const w = where({ "i.id": id, "i.customer_id": customerId });
    const [[invoice]] = await db.execute(
        `SELECT ${columns} FROM invoices i ${w.sql}`,
        w.params
    );
    return invoice || null;
}

const lockInvoice = (connection, id) =>
    connection.execute(
        `
    SELECT i.invoice_number, i.status, i.total, i.customer_id
    FROM invoices i
    WHERE i.id = ? FOR UPDATE
`,
        [id]
    );

const paymentExists = (connection, id) =>
    connection.execute("SELECT id FROM payments WHERE invoice_id = ? LIMIT 1", [id]);

const cancelInvoice = (connection, id) =>
    connection.execute(
        "UPDATE invoices SET status = 'Cancelled' WHERE id = ? AND status = 'Unpaid'",
        [id]
    );

module.exports = {
    findProviders,
    lockInvoice,
    paymentExists,
    cancelInvoice,
    findCustomer,
    findInvoice,
    listInvoices,
    listItems,
    insertItem,
    insertInvoice,
    findOverlappingInvoice,
    listActivePrices
};
