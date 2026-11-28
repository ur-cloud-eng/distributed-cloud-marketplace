const repository = require("../../DAL/finance/providerFinance");
const { withCurrency } = require("../../utils/helpers");

// Earnings
async function getEarnings(providerId = null) {
    const rows = await repository.listEarnings(providerId);
    return rows.map(withCurrency);
}

async function getEarningsForProvider(providerId) {
    return (
        (await getEarnings(providerId))[0] ||
        withCurrency({
            provider_id: providerId,
            gross_earnings: 0,
            platform_commission: 0,
            net_earnings: 0
        })
    );
}

const listEarningLines = (providerId) => repository.listEarningLines([providerId]);

module.exports = { getEarnings, getEarningsForProvider, listEarningLines };
