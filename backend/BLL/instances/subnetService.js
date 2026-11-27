const db = require("../../DAL/dbconn");
const groups = require("../../DAL/instances/resourceGroup");
const networks = require("../../DAL/instances/virtualNetwork");
const dal = require("../../DAL/instances/subnet");
const { fail, assertId } = require("./instanceUtils");
const { text, cidr } = require("./resourceUtils");
async function list(customerId, groupId, vnetId) {
    assertId(groupId, "group ID");
    assertId(vnetId, "network ID");
    return dal.list(customerId, groupId, vnetId);
}
async function lockNetwork(connection, customerId, groupId, vnetId) {
    if (!(await groups.lock(connection, customerId, groupId)))
        fail(404, "Resource group not found.");
    const network = await networks.lock(connection, groupId, vnetId);
    if (!network) fail(404, "Virtual network not found.");
    return network;
}
async function get(customerId, groupId, vnetId, id) {
    assertId(id, "resource ID");
    const [resource] = await dal.list(customerId, groupId, vnetId, id);
    if (!resource) fail(404, "Subnet not found.");
    return resource;
}
async function create(customerId, groupId, vnetId, data) {
    assertId(groupId, "group ID");
    assertId(vnetId, "network ID");
    const name = text(data.name, "name");
    const range = cidr(data.cidrBlock);
    return db.withTransaction(async (connection) => {
        const network = await lockNetwork(connection, customerId, groupId, vnetId);
        const parent = cidr(network.cidr_block);
        if (range.start < parent.start || range.end > parent.end)
            fail(400, "Subnet must be inside the network CIDR.");
        for (const row of await dal.ranges(connection, vnetId)) {
            const existing = cidr(row.cidr_block);
            if (range.start <= existing.end && existing.start <= range.end)
                fail(409, "Subnet overlaps an existing subnet.");
        }
        return dal.create(connection, vnetId, name, data.cidrBlock);
    });
}
async function remove(customerId, groupId, vnetId, id) {
    assertId(groupId, "group ID");
    assertId(vnetId, "network ID");
    assertId(id, "subnet ID");
    return db.withTransaction(async (connection) => {
        await lockNetwork(connection, customerId, groupId, vnetId);
        if (!(await dal.lock(connection, vnetId, id))) fail(404, "Subnet not found.");
        if (await dal.inUse(connection, id)) fail(409, "Cancel dependent VMs first.");
        await dal.remove(connection, id);
        return { subnetId: id, deleted: true };
    });
}
module.exports = { list, get, create, remove };
