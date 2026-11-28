// Pricing endpoints for Swagger UI.
module.exports = {
    "/api/pricing": {
        get: {
            tags: ["Pricing"],
            summary: "List pricing rules",
            responses: {
                200: {
                    description: "Pricing rules"
                }
            }
        },
        post: {
            tags: ["Pricing"],
            summary: "Create or reactivate a pricing rule (Admin)",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            $ref: "#/components/schemas/PricingRule"
                        }
                    }
                }
            },
            responses: {
                201: {
                    description: "Rule created"
                },
                400: {
                    description: "Invalid input"
                },
                409: {
                    description: "Resource and class combination already exists"
                }
            }
        }
    },
    "/api/pricing/calculate": {
        post: {
            tags: ["Pricing"],
            summary: "Calculate monthly and hourly resource price estimates",
            description:
                "Estimates full allocation at active monthly rates. Invoices use actual metered usage and rates active at invoice generation. Stored invoice line prices are unaffected by later price changes. Only positive quantities require active pricing rules. Unused categories contribute zero, and missing rates are omitted from unit_prices.",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            $ref: "#/components/schemas/CalculatePrice"
                        }
                    }
                }
            },
            responses: {
                200: {
                    description:
                        "Calculated estimate with estimated_monthly_price, estimated_hourly_price, hours_per_month, currency and price_breakdown"
                },
                400: {
                    description: "Invalid input"
                },
                409: { description: "Pricing rule missing or invalid for a requested resource" }
            }
        }
    },
    "/api/pricing/{id}": {
        delete: {
            tags: ["Pricing"],
            summary: "Retire an active pricing rule (Admin)",
            parameters: [
                { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
            ],
            responses: {
                200: { description: "Rule deactivated" },
                404: { description: "Active rule not found" }
            }
        },
        put: {
            tags: ["Pricing"],
            summary: "Update a pricing rule (Admin)",
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    schema: {
                        type: "integer",
                        minimum: 1
                    }
                }
            ],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            required: ["unit_price"],
                            properties: {
                                unit_price: {
                                    type: "number",
                                    minimum: 0,
                                    maximum: 99999999.99,
                                    multipleOf: 0.01
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                200: {
                    description: "Price updated"
                },
                400: {
                    description: "Invalid input"
                },
                404: {
                    description: "Rule not found"
                }
            }
        }
    }
};
