
const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
    generateAIArchitectureProposal
} = require("../../BLL/ai/architectureService");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const router = express.Router();

const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        error: "Too many AI requests. Please try again later."
    }
});

router.post(
    "/architecture/recommend",
    requireAuth,
    aiLimiter,
    requireRole("customer"),
    async (req, res) => {

        if (!req.is("application/json")) {
            return res.status(415).json({
                error: "JSON content is required."
            });
        }
        const requirements = req.body?.requirements;

        if (typeof requirements !== "string" ||
            requirements.trim().length < 10 ||
            requirements.length > 4000) {

            return res.status(400).json({
                error: "Invalid cloud requirements."
            });
        }

        try {
            const proposal =
                await generateAIArchitectureProposal(requirements);

            return res.status(200).json(proposal);

        } catch (error) {
            if (error.status === 429) {
                return res.status(429).json({
                    error: "AI quota exceeded. Try again later."
                });
            }

            return res.status(500).json({
                error: "Unable to generate architecture proposal."
            });
        }
    }
);

module.exports = router;