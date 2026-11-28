const dal = require("../../DAL/instances/lifecycle");
const { fail, withLockedInstance } = require("./instanceUtils");

async function startInstance(vmId, actor) {
    return withLockedInstance(vmId, actor, async (connection, instance) => {
        if (
            instance.vm_status !== "stopped" ||
            !["created", "stopped"].includes(instance.resource_status)
        )
            fail(409, "Only a stopped instance can be started.");

        if (await dal.openUsageCount(connection, instance.resource_id))
            fail(409, "An active usage period already exists.");

        await dal.setInstanceStatus(connection, instance, "running", "active");

        await dal.startUsage(connection, instance);

        return { vmId, status: "running" };
    });
}

async function stopInstance(vmId, actor) {
    return withLockedInstance(vmId, actor, async (connection, instance) => {
        if (instance.vm_status !== "running" || instance.resource_status !== "active")
            fail(409, "Only a running instance can be stopped.");

        if ((await dal.openUsageCount(connection, instance.resource_id)) !== 2)
            fail(409, "VM usage tracking is inconsistent.");

        await dal.stopUsage(connection, instance.resource_id);

        await dal.setInstanceStatus(connection, instance, "stopped", "stopped");

        return { vmId, status: "stopped" };
    });
}

module.exports = {
    startInstance,
    stopInstance
};
