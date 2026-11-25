
const express = require("express");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
    "/ai-architect",
    requireAuth,
    requireRole("customer"),
    (req, res) => {

        res.render("layout", {
            title: "AI Architect",
            description: "Design your cloud infrastructure with AI.",
            template: "pages/ai-architect",
            role: "customer",
            base: "/customer",
            currentPath: "/customer/ai-architect",
            breadcrumbs: [],
            action: null,
            previewMode: false,
            navigation: [
                ["Overview", ""],
                ["Resources", "/resources"],
                ["Resource Groups", "/resource-groups"],
                ["AI Architect", "/ai-architect"],
                ["Activity", "/activity"],
                ["Notifications", "/notifications"],
                ["Account & Security", "/account"]
            ]
        });
    }
);

module.exports = router;