const dal = require("../../DAL/instances/webApp");
const common = require("./allocatedResourceService");
const { fail, assertId } = require("./instanceUtils");
const allocation = require("../../DAL/instances/resourceAllocation");
async function create(customerId, groupId, data) {
    const databaseId = data.databaseId ?? null;
    if (databaseId !== null) assertId(databaseId, "database ID");
    return common.create(
        customerId,
        groupId,
        dal,
        { ...common.specification(data, false), type: "WEB_APP", databaseId },
        async (connection) => {
            if (
                databaseId !== null &&
                !(await allocation.lockDatabase(
                    connection,
                    customerId,
                    groupId,
                    databaseId
                ))
            )
                fail(404, "Database not found in this resource group.");
        }
    );
}
const list = (c, g) => common.list(c, g, dal);
const get = (c, g, id) => common.get(c, g, dal, id);
const remove = (c, g, id) => common.remove(c, g, dal, id);
module.exports = { create, list, get, remove };
