const dal = require("../../DAL/instances/instance");
const { fail, withLockedInstance } = require("./instanceUtils");

async function startInstance(vmId, actor) {
    return withLockedInstance(vmId, actor, async (connection, instance) => {
        if (
            instance.vm_status !== "stopped" ||
            !["created", "stopped"].includes(instance.resource_status)
        )
            fail(409, "Only a stopped instance can be started.");

        if (await dal.openUsageCount(connection, vmId))
            fail(409, "An active usage period already exists.");

        await dal.setInstanceStatus(connection, instance, "running", "active");

        await dal.startUsage(connection, instance);

        await dal.recordActivity(
            connection,
            instance,
            actor.id,
            "started",
            instance.resource_status,
            "active"
        );

        return { vmId, status: "running" };
    });
}

async function stopInstance(vmId, actor) {
    return withLockedInstance(vmId, actor, async (connection, instance) => {
        if (instance.vm_status !== "running" || instance.resource_status !== "active")
            fail(409, "Only a running instance can be stopped.");

        if ((await dal.openUsageCount(connection, vmId)) !== 1)
            fail(409, "VM usage tracking is inconsistent.");

        await dal.stopUsage(connection, vmId);

        await dal.setInstanceStatus(connection, instance, "stopped", "stopped");

        await dal.recordActivity(connection, instance, actor.id, "stopped", "active", "stopped");

        return { vmId, status: "stopped" };
    });
}

async function restartInstance(vmId, actor) {
    return withLockedInstance(vmId, actor, async (connection, instance) => {
        if (instance.vm_status !== "running" || instance.resource_status !== "active")
            fail(409, "Only a running instance can be restarted.");

        if ((await dal.openUsageCount(connection, vmId)) !== 1)
            fail(409, "VM usage tracking is inconsistent.");

        await dal.recordActivity(connection, instance, actor.id, "restarted", "active", "active");

        return { vmId, status: "running", simulated: true };
    });
}

module.exports = {
    startInstance,
    stopInstance,
    restartInstance
};
