// Central Swagger configuration. Endpoints are grouped by feature.
const system = require("./system");
const auth = require("./auth");
const pricing = require("./pricing");
const billing = require("./billing");
const finance = require("./finance");
const customer = require("./customer");
const provider = require("./provider");
const notifications = require("./notifications");
const discounts = require("./discounts");
const admin = require("./admin");
const instances = require("./instances");
const resources = require("./resources");
const schemas = require("./schemas");
const { securitySchemes, security } = require("./security");

function adminOperation(operation, overrides = {}) {
    return {
        ...operation,
        ...overrides,
        responses: {
            ...operation.responses,
            403: { description: "Administrator role required" }
        }
    };
}

module.exports = {
    openapi: "3.0.0",
    info: {
        title: "Cloud Marketplace API",
        version: "1.0.0",
        description:
            "Marketplace APIs secured with session authentication. Admin bills actual resource usage through /api/billing/usage-invoices. Provider IDs are required for manually created invoices. No real money is transferred."
    },
    servers: [
        {
            url: "/"
        }
    ],
    tags: [
        { name: "Resource Management" },
        { name: "Authentication" },
        {
            name: "System"
        },
        {
            name: "Pricing"
        },
        {
            name: "Billing"
        },
        {
            name: "Finance"
        },
        {
            name: "Customer"
        },
        {
            name: "Provider"
        },
        {
            name: "Notifications"
        },
        {
            name: "Discounts"
        },
        {
            name: "Admin"
        },
        {
            name: "Instances"
        }
    ],
    paths: {
        ...auth,
        ...system,
        ...pricing,
        ...billing,
        ...finance,
        ...customer,
        ...provider,
        ...notifications,
        ...discounts,
        ...admin,
        ...instances,
        ...resources,
        "/api/finance/discount-codes": discounts["/api/discounts"],
        "/api/finance/discount-codes/{id}": discounts["/api/discounts/{id}"],
        "/api/finance/discount-codes/validate": {
            post: adminOperation(discounts["/api/discounts/validate"].post, {
                summary: "Validate a discount code (Admin)",
                description: "Requires an administrator session. Validation does not consume a use."
            })
        },
        "/api/finance/notifications": {
            get: adminOperation(notifications["/api/notifications"].get, {
                description:
                    "Requires an administrator session. Lists the administrator inbox or the explicitly selected recipient inbox."
            })
        },
        "/api/finance/notifications/{id}/read": {
            patch: adminOperation(notifications["/api/notifications/{id}/read"].patch, {
                description:
                    "Requires an administrator session. Supply both recipient query parameters to select another inbox."
            })
        }
    },
    components: { schemas, securitySchemes },
    security
};
