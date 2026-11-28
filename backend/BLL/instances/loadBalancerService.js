const dal = require("../../DAL/instances/loadBalancer");
const common = require("./allocatedResourceService");
const { fail, assertId } = require("./instanceUtils");
const networks = require("../../DAL/instances/virtualNetwork");
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
const list = (c, g) => common.list(c, g, dal);
const get = (c, g, id) => common.get(c, g, dal, id);
const remove = (c, g, id) => common.remove(c, g, dal, id);
module.exports = { create, list, get, remove };
