const db = require("../../DAL/dbconn");
const dal = require("../../DAL/instances/resourceGroup");
const { fail, assertId } = require("./instanceUtils");
const { text } = require("./resourceUtils");
async function list(customerId) {
    return dal.list(customerId);
}
async function get(customerId, id) {
    assertId(id, "resource ID");
    const [resource] = await dal.list(customerId, id);
    if (!resource) fail(404, "Resource group not found.");
    return resource;
}
async function create(customerId, data) {
    return dal.create(customerId, text(data.name, "name"), text(data.region, "region", 50));
}
async function remove(customerId, id) {
    assertId(id, "resource group ID");
    return db.withTransaction(async (connection) => {
        if (!(await dal.lock(connection, customerId, id))) fail(404, "Resource group not found.");
        if (await dal.inUse(connection, id))
            fail(409, "Remove dependent resources and networks first.");
        await dal.remove(connection, id);
        return { groupId: id, deleted: true };
    });
}
module.exports = { list, get, create, remove };
