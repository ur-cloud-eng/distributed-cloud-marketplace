const { handle } = require("../../middleware/access");
const express = require("express");
const { optionalId } = require("../../../utils/helpers");
const payment = require("../../../BLL/finance/paymentService");
const earnings = require("../../../BLL/finance/providerFinanceService");
const dashboard = require("../../../BLL/finance/dashboardService");

const router = express.Router();

router.use("/notifications", require("./notifications"));

// Payments (customer-initiated only)
router.get(
    "/payments",
    handle(async (req, res) => {
        res.json(
            await payment.listPayments({
                invoiceId: optionalId(req.query.invoice_id, "invoice_id")
            })
        );
    }, "Could not load payments.")
);

// Earnings
router.get(
    "/earnings",
    handle(async (req, res) => {
        res.json(await earnings.getEarnings(optionalId(req.query.provider_id, "provider_id")));
    }, "Could not load earnings.")
);

// Dashboard (the admin router also serves this with provider totals)
router.get(
    "/dashboard",
    handle(async (req, res) => {
        res.json(await dashboard.getDashboard());
    }, "Could not load dashboard.")
);

module.exports = router;
