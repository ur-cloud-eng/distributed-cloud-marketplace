// System endpoints for Swagger UI.
module.exports = {
    "/api-docs.json": {
        get: {
            tags: ["System"],
            summary: "Get the OpenAPI document",
            security: [],
            responses: { 200: { description: "OpenAPI document in JSON" } }
        }
    },
    "/api/health": {
        get: {
            tags: ["System"],
            summary: "Health check",
            responses: {
                200: {
                    description: "API health status"
                }
            },
            security: []
        }
    }
};
