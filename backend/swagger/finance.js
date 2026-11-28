// Finance endpoints for Swagger UI.
module.exports = {
    "/api/finance/payments": {
        get: {
            tags: ["Finance"],
            summary: "List simulated payments (Admin)",
            parameters: [
                {
                    name: "invoice_id",
                    in: "query",
                    required: false,
                    description: "Filter by invoice",
                    schema: {
                        type: "integer",
                        minimum: 1
                    }
                }
            ],
            responses: {
                200: {
                    description: "Payment list"
                }
            }
        }
    },
    "/api/finance/earnings": {
        get: {
            tags: ["Finance"],
            summary: "List provider earnings (Admin)",
            parameters: [
                {
                    name: "provider_id",
                    in: "query",
                    required: false,
                    description: "Filter by provider",
                    schema: {
                        type: "integer",
                        minimum: 1
                    }
                }
            ],
            responses: {
                200: {
                    description: "Gross earnings, platform commission and net earnings by provider"
                }
            }
        }
    },
    "/api/finance/dashboard": {
        get: {
            tags: ["Finance"],
            summary: "Get financial dashboard totals (Admin)",
            responses: {
                200: {
                    description: "Invoice counts by status, simulated payment totals, gross and net earnings, platform commission and notification counts in USD"
                }
            }
        }
    }
};
