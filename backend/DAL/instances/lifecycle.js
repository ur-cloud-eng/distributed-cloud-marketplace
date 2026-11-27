const db = require("../dbconn");

async function setInstanceStatus(connection, instance, vmStatus, resourceStatus) {
    const [vmResult] = await connection.execute(
        `
        UPDATE VirtualMachines
        SET status = ?
        WHERE vm_id = ? AND status = ?`,
        [vmStatus, instance.vm_id, instance.vm_status]
    );

    if (vmResult.affectedRows !== 1) throw new Error("VM status changed concurrently");

    const [registryResult] = await connection.execute(
        `
        UPDATE ResourceRegistry
        SET status = ?,
            activated_at = CASE
                WHEN ? = 'active'
                THEN COALESCE(activated_at, UTC_TIMESTAMP())
                ELSE activated_at
            END
        WHERE resource_id = ? AND status = ?`,
        [resourceStatus, resourceStatus, instance.resource_id, instance.resource_status]
    );

    if (registryResult.affectedRows !== 1) throw new Error("Resource status changed concurrently");
}

async function openUsageCount(connection, vmId) {
    const [[row]] = await connection.execute(
        `
        SELECT COUNT(*) AS total
        FROM VmUsage
        WHERE vm_id = ? AND stopped_at IS NULL`,
        [vmId]
    );

    return Number(row.total);
}

async function startUsage(connection, instance) {
    await connection.execute(
        `
        INSERT INTO VmUsage (
            vm_id, customer_id, provider_id, cloud_class,
            cpu_cores, ram_gb, gpu_units, started_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, UTC_TIMESTAMP())`,
        [
            instance.vm_id,
            instance.customer_user_id,
            instance.provider_id,
            instance.hosting_class,
            instance.vcpu,
            instance.ram_gb
        ]
    );
}

async function stopUsage(connection, vmId) {
    const [result] = await connection.execute(
        `
        UPDATE VmUsage
        SET stopped_at = UTC_TIMESTAMP()
        WHERE vm_id = ? AND stopped_at IS NULL`,
        [vmId]
    );

    if (result.affectedRows !== 1) throw new Error("Expected one running usage period");
}

async function recordActivity(connection, instance, actorId, action, oldStatus, newStatus) {
    await connection.execute(
        `
        INSERT INTO ResourceActivityLogs (
            actor_user_id, resource_id, entity_type,
            entity_pk, action, old_status, new_status
        )
        VALUES (?, ?, 'VIRTUAL_MACHINE', ?, ?, ?, ?)`,
        [actorId, instance.resource_id, instance.vm_id, action, oldStatus, newStatus]
    );
}

async function getActivityHistory(vmId, customerId, isAdmin = false) {
    const [rows] = await db.execute(
        `
        SELECT l.log_id, l.actor_user_id, l.action,
               l.old_status, l.new_status, l.details, l.occurred_at
        FROM ResourceActivityLogs l
        JOIN ResourceRegistry r ON r.resource_id = l.resource_id
        WHERE r.vm_id = ?
          AND (? = 1 OR r.customer_user_id = ?)
          AND r.resource_type = 'VIRTUAL_MACHINE'
        ORDER BY l.log_id DESC
        LIMIT 100`,
        [vmId, isAdmin ? 1 : 0, customerId]
    );

    return rows;
}

module.exports = {
    setInstanceStatus,
    openUsageCount,
    startUsage,
    stopUsage,
    recordActivity,
    getActivityHistory
};
