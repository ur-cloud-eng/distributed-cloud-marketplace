const { query, where } = require("../query");


// Earnings
const listEarningLines = (params = []) =>
    query(
        `
    SELECT pe.id, pe.payment_id, p.payment_reference,
           pe.gross_amount, pe.commission_rate,
           pe.commission_amount, pe.net_amount, pe.created_at
    FROM provider_earnings pe
    JOIN payments p ON p.id = pe.payment_id
    WHERE pe.provider_id = ?
    ORDER BY pe.id DESC
`,
        params
    );

async function listEarnings(providerId) {
    const w = where({ "pe.provider_id": providerId });

    return query(
        `
        SELECT pe.provider_id,
               ROUND(SUM(pe.gross_amount), 2) AS gross_earnings,
               ROUND(SUM(pe.commission_amount), 2) AS platform_commission,
               ROUND(SUM(pe.net_amount), 2) AS net_earnings
        FROM provider_earnings pe
        ${w.sql}
        GROUP BY pe.provider_id
        ORDER BY pe.provider_id
    `,
        w.params
    );
}

module.exports = { listEarningLines, listEarnings };
