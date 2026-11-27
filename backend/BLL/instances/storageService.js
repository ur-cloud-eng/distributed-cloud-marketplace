const dal = require("../../DAL/instances/storage");
const common = require("./allocatedResourceService");
const { fail } = require("./instanceUtils");
function model(type) {
    const result = dal.model(type);
    if (!result) fail(400, "Invalid storage type.");
    return result;
}
async function create(customerId, groupId, type, data) {
    const m = model(type);
    return common.create(customerId, groupId, m, {
        ...common.specification({ ...data, diskGb: data.sizeGb }, true),
        type: m.type
    });
}
const list = (c, g, t) => common.list(c, g, model(t));
const get = (c, g, t, id) => common.get(c, g, model(t), id);
const remove = (c, g, t, id) => common.remove(c, g, model(t), id);
module.exports = { create, list, get, remove };
