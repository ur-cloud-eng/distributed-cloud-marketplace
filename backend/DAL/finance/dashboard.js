const { withReadSnapshot } = require("../dbconn");

async function dashboardTotals() {
    return withReadSnapshot(async (connection) => {
        const [[invoices]] = await connection.execute(`
            SELECT COUNT(*) AS count,
                   COUNT(CASE WHEN status = 'Paid' THEN 1 END) AS paid_count,
                   COUNT(CASE WHEN status = 'Unpaid' THEN 1 END) AS unpaid_count,
                   COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) AS cancelled_count,
                   COALESCE(SUM(total), 0) AS invoiced_total,
                   COALESCE(SUM(CASE WHEN status = 'Paid' THEN total END), 0) AS paid_total,
                   COALESCE(SUM(CASE WHEN status = 'Unpaid' THEN total END), 0) AS unpaid_total
            FROM invoices
        `);
        const [[payments]] = await connection.execute(`
            SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS recorded_total
            FROM payments
        `);
        const [[earnings]] = await connection.execute(`
            SELECT COALESCE(SUM(gross_amount), 0) AS provider_gross,
                   COALESCE(SUM(commission_amount), 0) AS platform_commission,
                   COALESCE(SUM(net_amount), 0) AS provider_net
            FROM provider_earnings
        `);
        const [[notifications]] = await connection.execute(`
            SELECT COUNT(*) AS count, COUNT(CASE WHEN read_at IS NULL THEN 1 END) AS unread_count
            FROM Notifications WHERE category = 'billing'
        `);
        return { invoices, payments, earnings, notifications };
    });
}

module.exports = { dashboardTotals };
