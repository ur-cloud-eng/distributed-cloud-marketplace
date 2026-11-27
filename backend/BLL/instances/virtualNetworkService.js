const db = require("../../DAL/dbconn");
const groups = require("../../DAL/instances/resourceGroup");
const dal = require("../../DAL/instances/virtualNetwork");
const { fail, assertId } = require("./instanceUtils");
const { text, cidr } = require("./resourceUtils");
async function list(customerId, groupId) {
    assertId(groupId, "group ID");
    return dal.list(customerId, groupId);
}
async function get(customerId, groupId, id) {
    assertId(id, "resource ID");
    const [resource] = await dal.list(customerId, groupId, id);
    if (!resource) fail(404, "Virtual network not found.");
    return resource;
}
async function create(customerId, groupId, data) {
    assertId(groupId, "group ID");
    const name = text(data.name, "name");
    cidr(data.cidrBlock);
    return db.withTransaction(async (connection) => {
        if (!(await groups.lock(connection, customerId, groupId)))
            fail(404, "Resource group not found.");
        return dal.create(connection, groupId, name, data.cidrBlock);
    });
}
async function remove(customerId, groupId, id) {
    assertId(groupId, "group ID");
    assertId(id, "network ID");
    return db.withTransaction(async (connection) => {
        if (
            !(await groups.lock(connection, customerId, groupId)) ||
            !(await dal.lock(connection, groupId, id))
        )
            fail(404, "Virtual network not found.");
        if (await dal.inUse(connection, id))
            fail(409, "Remove dependent subnets and load balancers first.");
        await dal.remove(connection, id);
        return { vnetId: id, deleted: true };
    });
}
module.exports = { list, get, create, remove };
