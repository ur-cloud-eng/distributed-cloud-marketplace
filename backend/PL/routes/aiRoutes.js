const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { authenticate, requireRole, handle } = require("../middleware/access");
const { recommend } = require("../../BLL/ai/architectureService");

const router = express.Router();
const customer = [authenticate, requireRole("Customer")];
const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    keyGenerator: req => String(req.user.id),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many recommendations. Please try again later." }
});

router.post("/api/ai/architecture/recommend", customer, limit, handle(async (req, res) => {
    if (!req.is("application/json")) return res.status(415).json({ error: "JSON content is required." });
    res.json(await recommend(req.body.requirements));
}, "Unable to recommend an architecture."));

module.exports = router;
