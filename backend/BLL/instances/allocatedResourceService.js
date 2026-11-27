const db = require("../../DAL/dbconn");
const groups = require("../../DAL/instances/resourceGroup");
const dal = require("../../DAL/instances/resourceAllocation");
const { fail, assertId } = require("./instanceUtils");
const { text, capacity } = require("./resourceUtils");

function specification(data, storageOnly) {
    if (!["Economy", "Business", "Critical"].includes(data.hostingClass))
        fail(400, "Invalid hosting class.");
    return {
        name: text(data.name, "name"),
        hostingClass: data.hostingClass,
        vcpu: storageOnly ? 0 : capacity(data.vcpu, "CPU"),
        ramGb: storageOnly ? 0 : capacity(data.ramGb, "RAM"),
        diskGb: capacity(data.diskGb, "disk")
    };
}

async function create(customerId, groupId, model, data, validateDependency) {
    assertId(groupId, "group ID");
    return db.withTransaction(async (connection) => {
        const group = await groups.lock(connection, customerId, groupId);
        if (!group) fail(404, "Resource group not found.");
        if (validateDependency) await validateDependency(connection);
        const hosts = await dal.lockHosts(connection, group.region, data.hostingClass);
        let selected;
        for (const host of hosts) {
            const used = await dal.usage(connection, host.host_id);
            if (
                host.total_cpu - Number(used.cpu) >= data.vcpu &&
                host.total_ram_gb - Number(used.ram) >= data.ramGb &&
                host.total_disk_gb - Number(used.disk) >= data.diskGb
            ) {
                selected = host;
                break;
            }
        }
        if (!selected) fail(409, "No compatible host has sufficient capacity.");
        const entityId = await model.insert(connection, groupId, data);
        const resourceId = await dal.register(
            connection,
            groupId,
            customerId,
            data.type,
            model.column,
            entityId
        );
        await dal.reserve(connection, resourceId, selected, { ...data, customerId });
        return { id: entityId, resourceId, hostId: selected.host_id, status: "active" };
    });
}

async function list(customerId, groupId, model) {
    assertId(groupId, "group ID");
    return dal.list(customerId, groupId, model);
}

async function get(customerId, groupId, model, id) {
    assertId(id, "resource ID");
    const rows = await dal.list(customerId, groupId, model, id);
    if (!rows.length) fail(404, "Resource not found.");
    return rows[0];
}

async function remove(customerId, groupId, model, id) {
    const resource = await get(customerId, groupId, model, id);
    try {
        await dal.cancel(resource.resource_id, customerId);
    } catch (error) {
        if (error.message === "Resource not found or actor unauthorized")
            fail(404, "Resource not found.");
        if (
            ["Resource already cancelled", "Cancel dependent Web Apps first"].includes(
                error.message
            )
        )
            fail(409, error.message);
        throw error;
    }
    return { id, cancelled: true };
}
module.exports = { specification, create, list, get, remove };
