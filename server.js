require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const session = require("express-session");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./backend/swagger");

const authRoutes = require("./backend/PL/routes/auth/authRoutes");

const pricingRoutes = require("./backend/PL/routes/finance/pricing");
const billingRoutes = require("./backend/PL/routes/finance/billing");
const financeRoutes = require("./backend/PL/routes/finance/finance");
const customerRoutes = require("./backend/PL/routes/finance/customer");
const notificationRoutes = require("./backend/PL/routes/finance/notifications");
const providerRoutes = require("./backend/PL/routes/finance/provider");
const adminRoutes = require("./backend/PL/routes/finance/admin");
const instanceRoutes = require("./backend/PL/routes/instances/instancesRoutes");

const { authenticate, requireRole } = require("./backend/PL/middleware/access");

const app = express();
const port = Number(process.env.PORT) || 3000;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long.");
}

// Middleware order matters: JSON -> session -> auth routes -> protected routes.
app.use(express.json());
app.use(
    session({
        name: "cortexops.sid",
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 2 * 60 * 60 * 1000
        }
    })
);

app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));
app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
        explorer: true
    })
);

require("./frontend/liveRoutes")(app);

app.get("/api/health", (req, res) => {
    res.json({ status: "OK", message: "API is running" });
});

app.use("/api", (req, res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
        if (req.body == null) req.body = {};
        if (typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({ error: "Request body must be a JSON object." });
        }
    }
    next();
});

// login, 2FA challenge, current user, logout, and email verification.
app.use("/api/auth", authRoutes);
app.use(require("./backend/PL/routes/aiRoutes"));

// finance API routes.
app.use("/api/pricing", authenticate, pricingRoutes);
app.use("/api/billing", authenticate, requireRole("Admin"), billingRoutes);
app.use("/api/finance", authenticate, requireRole("Admin"), financeRoutes);
app.use("/api/admin", authenticate, requireRole("Admin"), adminRoutes);
app.use("/api/customers/me", authenticate, requireRole("Customer"), customerRoutes);
app.use("/api/providers/me", authenticate, requireRole("Provider"), providerRoutes);
app.use("/api/notifications", authenticate, notificationRoutes);
app.use("/api/instances", instanceRoutes());
app.use("/api/hosts", require("./backend/PL/routes/instances/hostRoutes"));
app.use(
    "/api/resource-groups/:groupId/virtual-networks/:vnetId/subnets",
    require("./backend/PL/routes/instances/subnetRoutes")
);
app.use(
    "/api/resource-groups/:groupId/virtual-networks",
    require("./backend/PL/routes/instances/virtualNetworkRoutes")
);
app.use(
    "/api/resource-groups/:groupId/storage/:type",
    require("./backend/PL/routes/instances/storageRoutes")
);
app.use(
    "/api/resource-groups/:groupId/databases",
    require("./backend/PL/routes/instances/databaseRoutes")
);
app.use(
    "/api/resource-groups/:groupId/load-balancers",
    require("./backend/PL/routes/instances/loadBalancerRoutes")
);
app.use(
    "/api/resource-groups/:groupId/web-apps",
    require("./backend/PL/routes/instances/webAppRoutes")
);
app.use("/api/resource-groups", require("./backend/PL/routes/instances/resourceGroupRoutes"));

app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Invalid JSON body." });
    }
    if (error.type === "entity.too.large") {
        return res.status(413).json({ error: "Request body is too large." });
    }
    console.error(error);
    return res.status(500).json({ error: "Request failed." });
});

if (require.main === module) {
    const host = process.env.HOST || "127.0.0.1";
    app.listen(port, host, () => {
        console.log(`Server running at http://${host}:${port}`);
    });
}

module.exports = app;
