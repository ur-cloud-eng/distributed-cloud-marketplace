const dal = require("../../DAL/instances/instance");
const { fail, withLockedInstance } = require("./instanceUtils");

async function assignIP(vmId, actor) {
    return withLockedInstance(vmId, actor, async (connection, instance) => {
        const existing = await dal.getAssignedIP(connection, vmId);

        if (existing)
            return {
                vmId,
                ip_address: existing,
                already_assigned: true
            };

        const address = await dal.lockFreeIP(connection);

        if (!address) fail(409, "No free IP addresses. Populate InstanceIPPool first.");

        await dal.assignIP(connection, vmId, address);

        await dal.recordActivity(
            connection,
            instance,
            actor.id,
            "ip_assigned",
            instance.resource_status,
            instance.resource_status
        );

        return { vmId, ip_address: address };
    });
}

async function releaseIP(vmId, actor) {
    return withLockedInstance(vmId, actor, async (connection, instance) => {
        if (instance.vm_status === "running") fail(409, "Stop the VM before releasing its IP.");

        const address = await dal.getAssignedIP(connection, vmId);

        if (!address) return { vmId, released: false };

        await dal.releaseIP(connection, vmId);

        await dal.recordActivity(
            connection,
            instance,
            actor.id,
            "ip_released",
            instance.resource_status,
            instance.resource_status
        );

        return { vmId, released: true };
    });
}

module.exports = {
    assignIP,
    releaseIP
};
