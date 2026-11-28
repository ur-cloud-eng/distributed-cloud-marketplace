const { handle } = require("../../middleware/access");
const express = require("express");

const earnings = require("../../../BLL/finance/providerFinanceService");

const router = express.Router();

// Provider earnings
router.get(
    "/earnings",
    handle(async (req, res) => {
        const [summary, lines] = await Promise.all([
            earnings.getEarningsForProvider(req.user.id),
            earnings.listEarningLines(req.user.id)
        ]);

        res.json({ ...summary, lines });
    }, "Could not load your earnings.")
);

module.exports = router;
