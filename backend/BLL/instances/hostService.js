const db = require("../../DAL/dbconn");
const dal = require("../../DAL/instances/host");
const { fail, assertId } = require("./instanceUtils");
const { text, capacity } = require("./resourceUtils");
async function list(providerId) {
    return dal.list(providerId);
}
async function get(providerId, id) {
    assertId(id, "resource ID");
    const [resource] = await dal.list(providerId, id);
    if (!resource) fail(404, "Host not found.");
    return resource;
}
async function create(providerId, data) {
    if (!["Economy", "Business", "Critical"].includes(data.hostingClass))
        fail(400, "Invalid hosting class.");
    return dal.create(providerId, {
        name: text(data.name, "name"),
        region: text(data.region, "region", 50),
        hostingClass: data.hostingClass,
        totalCpu: capacity(data.totalCpu, "CPU"),
        totalRamGb: capacity(data.totalRamGb, "RAM"),
        totalDiskGb: capacity(data.totalDiskGb, "disk")
    });
}
async function update(providerId, id, data) {
    assertId(id, "host ID");
    return db.withTransaction(async (connection) => {
        const host = await dal.lock(connection, providerId, id);
        if (!host) fail(404, "Host not found.");
        const next = {
            name: text(data.name === undefined ? host.name : data.name, "name"),
            totalCpu: capacity(data.totalCpu === undefined ? host.total_cpu : data.totalCpu, "CPU"),
            totalRamGb: capacity(
                data.totalRamGb === undefined ? host.total_ram_gb : data.totalRamGb,
                "RAM"
            ),
            totalDiskGb: capacity(
                data.totalDiskGb === undefined ? host.total_disk_gb : data.totalDiskGb,
                "disk"
            ),
            status: data.status === undefined ? host.status : data.status
        };
        if (!["available", "maintenance", "inactive"].includes(next.status))
            fail(400, "Invalid host status.");
        const used = await dal.usage(connection, id);
        if (
            next.totalCpu < Number(used.cpu) ||
            next.totalRamGb < Number(used.ram) ||
            next.totalDiskGb < Number(used.disk)
        )
            fail(409, "Capacity cannot be reduced below active reservations.");
        if (next.status === "inactive" && Number(used.total))
            fail(409, "Cancel allocated VMs before removing the host.");
        await dal.update(connection, id, next);
        return { hostId: id, status: next.status };
    });
}
async function remove(providerId, id) {
    return update(providerId, id, { status: "inactive" });
}
module.exports = { list, get, create, update, remove };
