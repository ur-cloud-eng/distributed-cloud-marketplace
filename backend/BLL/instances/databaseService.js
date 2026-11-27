const dal = require("../../DAL/instances/database");
const common = require("./allocatedResourceService");
const { fail, assertId } = require("./instanceUtils");
async function create(customerId, groupId, data) {
    if (!["SQL_SERVER", "POSTGRESQL", "MYSQL"].includes(data.engine))
        fail(400, "Invalid database engine.");
    return common.create(customerId, groupId, dal, {
        ...common.specification({ ...data, diskGb: data.sizeGb }, false),
        type: data.engine
    });
}
const list = (c, g) => common.list(c, g, dal);
const get = (c, g, id) => common.get(c, g, dal, id);
const remove = (c, g, id) => common.remove(c, g, dal, id);
module.exports = { create, list, get, remove };
