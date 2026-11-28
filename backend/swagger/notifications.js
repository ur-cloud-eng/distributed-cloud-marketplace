// Notifications endpoints for Swagger UI.
module.exports = {
    "/api/notifications": {
        get: {
            tags: ["Notifications"],
            summary: "List my notifications (Admin can also query a recipient)",
            description:
                "Includes invoice creation and cancellation, successful payments, and provider earnings.",
            parameters: [
                {
                    name: "recipient_type",
                    in: "query",
                    description:
                        "Admin only: look up a specific recipient instead of your own inbox. Requires recipient_id too.",
                    schema: { type: "string", enum: ["Customer", "Provider", "Admin"] }
                },
                {
                    name: "recipient_id",
                    in: "query",
                    description: "Admin only: recipient user ID. Requires recipient_type too.",
                    schema: { type: "integer", minimum: 1 }
                },
                {
                    name: "unread_only",
                    in: "query",
                    schema: {
                        type: "boolean",
                        default: false
                    }
                }
            ],
            responses: {
                200: {
                    description: "Billing notifications for the selected inbox, including id, recipient_type, recipient_id, category, title, message, payment_id, is_read and created_at"
                },
                401: {
                    description: "Not logged in"
                },
                400: {
                    description: "Invalid admin recipient filter or unread_only flag"
                }
            }
        }
    },
    "/api/notifications/{id}/read": {
        patch: {
            tags: ["Notifications"],
            summary: "Mark notification as read (own inbox; Admin may select recipient)",
            description:
                "By default marks a notification in your own inbox. Admins may pass recipient_type and recipient_id together to target another inbox.",
            parameters: [
                { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
                {
                    name: "recipient_type",
                    in: "query",
                    description: "Admin only; requires recipient_id",
                    schema: { type: "string", enum: ["Customer", "Provider", "Admin"] }
                },
                {
                    name: "recipient_id",
                    in: "query",
                    description: "Admin only; requires recipient_type",
                    schema: { type: "integer", minimum: 1 }
                }
            ],
            responses: {
                200: {
                    description: "Returns the notification id and is_read set to true"
                },
                400: { description: "Invalid notification ID or admin recipient filter" },
                401: {
                    description: "Not logged in"
                },
                404: {
                    description: "Not found (or not yours)"
                }
            }
        }
    }
};
