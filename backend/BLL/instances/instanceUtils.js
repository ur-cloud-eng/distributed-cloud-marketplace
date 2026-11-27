const dal = require("../../DAL/instances/instance");
const db = require("../../DAL/dbconn");
const { HttpError } = require("../../utils/util");

function fail(status, message) {
    throw new HttpError(status, { error: message });
}

function validId(id) {
    return Number.isSafeInteger(id) && id > 0;
}

function assertId(id, label = "instance ID") {
    if (!validId(id)) fail(400, `Invalid ${label}.`);
}

function actorData(actor) {
    const customerId = actor?.id;

    assertId(customerId, "user ID");

    if (!["Customer", "Admin"].includes(actor.role)) fail(403, "Access denied.");

    return {
        customerId,
        isAdmin: actor.role === "Admin"
    };
}

async function withLockedInstance(vmId, actor, action) {
    assertId(vmId);

    const { customerId, isAdmin } = actorData(actor);

    return db.withTransaction(async (connection) => {
        const instance = await dal.getInstanceForUpdate(connection, vmId, customerId, isAdmin);

        if (!instance || ["cancelled", "deleted"].includes(instance.resource_status))
            fail(404, "Instance not found.");

        return action(connection, instance);
    });
}

module.exports = {
    fail,
    validId,
    assertId,
    actorData,
    withLockedInstance
};
