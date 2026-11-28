// Admin endpoints for Swagger UI.
module.exports = {
    "/api/admin/dashboard": {
        get: {
            tags: ["Admin"],
            summary: "Financial dashboard (Admin)",
            description:
                "Invoice counts by status, simulated payments, provider gross and net earnings, and platform commissions, including per-provider earnings.",
            responses: {
                200: {
                    description: "Dashboard totals in USD"
                },
                401: {
                    description: "Not logged in"
                },
                403: {
                    description: "Your role may not use this endpoint"
                }
            }
        }
    }
};
