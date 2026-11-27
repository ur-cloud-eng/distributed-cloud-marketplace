// Integrated Developer 1 creation + Developer 2 simulated lifecycle.
const id = { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } };
const errors = {
    400: { description: "Invalid input" },
    401: { description: "Not signed in" },
    403: { description: "Insufficient role" },
    404: { description: "Instance not found or does not belong to this customer" },
    409: { description: "Capacity or state conflict" },
    500: { description: "Unexpected server/database error" }
};
const endpoint = (summary) => ({
    tags: ["Instances"],
    summary,
    parameters: [id],
    responses: { 200: { description: "Successful operation" }, ...errors }
});
module.exports = {
    "/api/instances": {
        get: {
            tags: ["Instances"],
            summary: "List my VMs (Developer 1)",
            responses: { 200: { description: "Customer instances" }, ...errors }
        },
        post: {
            tags: ["Instances"],
            summary: "Create VM with automatic compatible host selection",
            description:
                "Calculates and stores a server-side hourly estimate using active pricing rules. Use POST /api/pricing/calculate before creating. The saved hourly_price is an estimate, not a locked invoice rate. Disk billing begins on creation and continues while stopped.",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            required: [
                                "name",
                                "subnetId",
                                "hostingClass",
                                "vcpu",
                                "ramGb",
                                "diskGb"
                            ],
                            properties: {
                                name: { type: "string", example: "demo-vm" },
                                subnetId: { type: "integer", example: 1 },
                                hostingClass: {
                                    type: "string",
                                    enum: ["Economy", "Business", "Critical"]
                                },
                                vcpu: { type: "integer", minimum: 1, example: 2 },
                                ramGb: { type: "integer", minimum: 1, example: 4 },
                                diskGb: { type: "integer", minimum: 1, example: 40 }
                            }
                        }
                    }
                }
            },
            responses: { 201: { description: "VM created, host capacity reserved" }, ...errors }
        }
    },
    "/api/instances/{id}": {
        get: endpoint("Get VM details and registry state"),
        delete: endpoint(
            "Cancel VM via existing sp_CancelResource and release host capacity and close disk metering"
        )
    },
    "/api/instances/{id}/start": { post: endpoint("Start stopped VM and record VM metered usage") },
    "/api/instances/{id}/stop": {
        post: endpoint("Stop VM and close compute usage (disk remains billable)")
    },
    "/api/instances/{id}/restart": {
        post: endpoint("Simulate restart without splitting metered interval")
    },
    "/api/instances/{id}/activity": { get: endpoint("Retrieve resource activity log") },
    "/api/instances/{id}/ip": {
        post: endpoint(
            "Assign optional simulated IP from InstanceIPPool (requires migration + pool entries)"
        ),
        delete: endpoint("Release optional simulated IP when stopped")
    }
};
