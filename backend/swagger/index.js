// Central Swagger configuration. Endpoints are grouped by feature.
const system = require("./system");
const auth = require("./auth");
const pricing = require("./pricing");
const billing = require("./billing");
const finance = require("./finance");
const customer = require("./customer");
const provider = require("./provider");
const notifications = require("./notifications");
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
            name: "Admin"
        },
        {
            name: "Instances"
        }
    ],
    paths: {
        ...auth,
        "/api/ai/architecture/recommend": {
            post: {
                tags: ["Customer"], summary: "Recommend cloud resources for a project", security,
                requestBody: { required: true, content: { "application/json": { schema: {
                    type: "object", required: ["requirements"], properties: {
                        requirements: { type: "string", minLength: 10, maxLength: 4000 }
                    }
                } } } },
                responses: { 200: { description: "Suggested resources, reasons, warnings and advisory capacity check" },
                    400: { description: "Invalid project requirements" },
                    401: { description: "Sign in required" }, 403: { description: "Customer role required" },
                    415: { description: "JSON content is required" }, 429: { description: "Request limit reached" },
                    502: { description: "Invalid response from the AI advisor" },
                    503: { description: "Advisor unavailable" }, 504: { description: "Advisor timed out" } }
            }
        },
        ...system,
        ...pricing,
        ...billing,
        ...finance,
        ...customer,
        ...provider,
        ...notifications,
        ...admin,
        ...instances,
        ...resources,
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
