const { dashboardTotals } = require("../../DAL/finance/dashboard");

async function getDashboard() {
    return { currency: "USD", ...(await dashboardTotals()) };
}

module.exports = { getDashboard };
