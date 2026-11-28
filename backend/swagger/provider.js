// Provider endpoints for Swagger UI.
module.exports = {
    "/api/providers/me/earnings": {
        get: {
            tags: ["Provider"],
            summary: "My earnings (Provider)",
            description:
                "Gross earnings, platform commission, net earnings, and individual earning records.",
            responses: {
                200: {
                    description: "Returns provider_id, gross_earnings, platform_commission, net_earnings, currency and lines"
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
