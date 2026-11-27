const dal = require("../../DAL/instances/loadBalancer");
const common = require("./allocatedResourceService");
const { fail, assertId } = require("./instanceUtils");
const db = require("../../DAL/dbconn");
const groups = require("../../DAL/instances/resourceGroup");
const networks = require("../../DAL/instances/virtualNetwork");
const allocation = require("../../DAL/instances/resourceAllocation");
async function create(customerId, groupId, data) {
    assertId(data.vnetId, "network ID");
    const algorithm = data.algorithm ?? "round_robin";
    if (!["round_robin", "least_connections"].includes(algorithm)) fail(400, "Invalid algorithm.");
    return common.create(
        customerId,
        groupId,
        dal,
        {
            ...common.specification(data, false),
            type: "LOAD_BALANCER",
            vnetId: data.vnetId,
            algorithm
        },
        async (connection) => {
            if (!(await networks.lock(connection, groupId, data.vnetId)))
                fail(404, "Virtual network not found.");
        }
    );
}
async function withBalancer(customerId, groupId, id, action) {
    assertId(id, "load balancer ID");
    return db.withTransaction(async (connection) => {
        if (
            !(await groups.lock(connection, customerId, groupId)) ||
            !(await allocation.lockResource(connection, customerId, groupId, "lb_id", id))
        )
            fail(404, "Load balancer not found.");
        return action(connection);
    });
}
async function addTarget(customerId, groupId, id, vmId) {
    assertId(vmId, "VM ID");
    return withBalancer(customerId, groupId, id, async (connection) => {
        if (
            !(await allocation.lockResource(connection, customerId, groupId, "vm_id", vmId)) ||
            !(await dal.sameNetwork(connection, id, vmId))
        )
            fail(409, "VM must belong to the same virtual network.");
        await dal.addTarget(connection, id, vmId);
        return { vmId, added: true };
    });
}
async function removeTarget(customerId, groupId, id, vmId) {
    assertId(vmId, "VM ID");
    return withBalancer(customerId, groupId, id, async (connection) => {
        await dal.removeTarget(connection, id, vmId);
        return { vmId, removed: true };
    });
}
const targets = (c, g, id) => withBalancer(c, g, id, (connection) => dal.targets(connection, id));
const list = (c, g) => common.list(c, g, dal);
const get = (c, g, id) => common.get(c, g, dal, id);
const remove = (c, g, id) => common.remove(c, g, dal, id);
module.exports = { create, list, get, remove, addTarget, removeTarget, targets };
