const errors = {
    400: { description: "Invalid input" },
    401: { description: "Not signed in" },
    403: { description: "Access denied" },
    404: { description: "Not found" },
    409: { description: "Dependency or capacity conflict" }
};
const str = { type: "string" };
const num = { type: "integer", minimum: 1 };
const name = { type: "string", maxLength: 100 };
const cidr = { type: "string", example: "10.0.0.0/24" };
const hostFields = {
    name,
    region: str,
    hostingClass: { type: "string", enum: ["Economy", "Business", "Critical"] },
    totalCpu: num,
    totalRamGb: num,
    totalDiskGb: num
};
const params = (path) =>
    [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
        name: m[1],
        in: "path",
        required: true,
        schema: num
    }));
function operation(path, summary, code = 200, fields, required = []) {
    const op = {
        tags: ["Resource Management"],
        summary,
        parameters: params(path),
        responses: { [code]: { description: "Success" }, ...errors }
    };
    if (fields)
        op.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: fields,
                        ...(required.length ? { required } : {})
                    }
                }
            }
        };
    return op;
}
const paths = {};
function add(path, label, fields, required) {
    paths[path] = {
        get: operation(path, `List ${label}`),
        post: operation(path, `Create ${label}`, 201, fields, required)
    };
    paths[path + "/{id}"] = {
        get: operation(path + "/{id}", `Get ${label} details`),
        delete: operation(path + "/{id}", `Remove ${label}`)
    };
}
add("/api/hosts", "provider hosts", hostFields, Object.keys(hostFields));
paths["/api/hosts/{id}"].patch = operation(
    "/api/hosts/{id}",
    "Update host capacity or status",
    200,
    {
        name,
        totalCpu: num,
        totalRamGb: num,
        totalDiskGb: num,
        status: { type: "string", enum: ["available", "maintenance", "inactive"] }
    }
);
add("/api/resource-groups", "resource groups", { name, region: str }, ["name", "region"]);
add(
    "/api/resource-groups/{groupId}/virtual-networks",
    "virtual networks",
    { name, cidrBlock: { type: "string", example: "10.0.0.0/16" } },
    ["name", "cidrBlock"]
);
add(
    "/api/resource-groups/{groupId}/virtual-networks/{vnetId}/subnets",
    "subnets",
    { name, cidrBlock: cidr },
    ["name", "cidrBlock"]
);
const compute = { name, hostingClass: hostFields.hostingClass, vcpu: num, ramGb: num, diskGb: num };
const base = "/api/resource-groups/{groupId}";
add(
    base + "/storage/{type}",
    "storage",
    { name, hostingClass: hostFields.hostingClass, sizeGb: num },
    ["name", "hostingClass", "sizeGb"]
);
const storagePath = base + "/storage/{type}";
for (const path of [storagePath, storagePath + "/{id}"])
    for (const op of Object.values(paths[path])) {
        op.description = "The blob and file paths only access their specified storage type. List and detail responses retain the corresponding blob_id or file_id.";
        op.parameters.find((p) => p.name === "type").schema = {
            type: "string",
            enum: ["blob", "file"]
        };
    }
add(
    base + "/databases",
    "managed databases",
    {
        name,
        hostingClass: compute.hostingClass,
        vcpu: num,
        ramGb: num,
        sizeGb: num,
        engine: { type: "string", enum: ["SQL_SERVER", "POSTGRESQL", "MYSQL"] }
    },
    ["name", "hostingClass", "vcpu", "ramGb", "sizeGb", "engine"]
);
add(
    base + "/web-apps",
    "web apps",
    { ...compute, databaseId: { ...num, nullable: true } },
    Object.keys(compute)
);
add(
    base + "/load-balancers",
    "load balancers",
    {
        ...compute,
        vnetId: num,
        algorithm: { type: "string", enum: ["round_robin", "least_connections"] }
    },
    [...Object.keys(compute), "vnetId"]
);
module.exports = paths;
