const { handle, requireRole } = require("../../middleware/access");
const express = require("express");
const earnings = require("../../../BLL/finance/providerFinanceService");
const dashboard = require("../../../BLL/finance/dashboardService");

const router = express.Router();
router.use(requireRole("Admin"));

// Dashboard
router.get(
    "/dashboard",
    handle(async (req, res) => {
        const [totals, providers] = await Promise.all([
            dashboard.getDashboard(),
            earnings.getEarnings()
        ]);
        res.json({ ...totals, providers });
    }, "Could not load admin dashboard.")
);

module.exports = router;
