const { query, where } = require("../query");

const markInvoicePaid = (connection, params = []) =>
    connection.execute("UPDATE invoices SET status = 'Paid' WHERE id = ?", params);

const insertEarnings = (connection, params = []) =>
    connection.execute(
        `
                INSERT INTO provider_earnings
                (payment_id, provider_id, gross_amount, commission_rate, commission_amount, net_amount)
                VALUES (?, ?, ?, ?, ?, ?)
            `,
        params
    );

const insertPayment = (connection, params = []) =>
    connection.execute(
        `
            INSERT INTO payments (payment_reference, invoice_id, amount, status, simulated)
            VALUES (?, ?, ?, 'Succeeded', 1)
        `,
        params
    );

const providerInvoiceTotals = (connection, params = []) =>
    connection.execute(
        `
        SELECT provider_id, SUM(line_total) AS gross_amount
        FROM invoice_items
        WHERE invoice_id = ?
        GROUP BY provider_id ORDER BY provider_id
    `,
        params
    );

function listPayments({ invoiceId = null, customerId = null } = {}) {
    const w = where({ "p.invoice_id": invoiceId, "i.customer_id": customerId });

    return query(
        `
        SELECT p.id, p.payment_reference, p.invoice_id, i.invoice_number,
               p.amount, p.status, p.simulated, p.created_at, i.customer_id
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        ${w.sql}
        ORDER BY p.id DESC
    `,
        w.params
    );
}

module.exports = {
    listPayments,
    markInvoicePaid,
    insertEarnings,
    insertPayment,
    providerInvoiceTotals
};
