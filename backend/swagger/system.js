// System endpoints for Swagger UI.
module.exports = {
    "/": {
        get: {
            tags: ["System"],
            summary: "Redirect to Swagger",
            responses: {
                302: {
                    description: "Redirect to Swagger UI"
                }
            },
            security: []
        }
    },
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
