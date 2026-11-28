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

async function openUsageCount(connection, resourceId) {
    const [[row]] = await connection.execute(
        `SELECT COUNT(*) AS total FROM ResourceUsagePeriods
         WHERE resource_id=? AND resource_type IN ('CPU','RAM','GPU') AND ended_at IS NULL`,
        [resourceId]
    );
    return Number(row.total);
}

async function startUsage(connection, instance) {
    const identity = [instance.resource_id, instance.customer_user_id, instance.provider_id];
    await connection.execute(
        `INSERT INTO ResourceUsagePeriods
         (resource_id,customer_id,provider_id,resource_type,cloud_class,quantity,started_at)
         VALUES (?,?,?,'CPU',?,?,UTC_TIMESTAMP(6)), (?,?,?,'RAM',?,?,UTC_TIMESTAMP(6))`,
        [...identity, instance.hosting_class, instance.vcpu, ...identity, instance.hosting_class, instance.ram_gb]
    );
}

async function stopUsage(connection, resourceId) {
    const [result] = await connection.execute(
        `UPDATE ResourceUsagePeriods SET ended_at=UTC_TIMESTAMP(6)
         WHERE resource_id=? AND resource_type IN ('CPU','RAM','GPU') AND ended_at IS NULL`,
        [resourceId]
    );
    if (result.affectedRows !== 2) throw new Error("Expected open CPU and RAM usage");
}

module.exports = { setInstanceStatus, openUsageCount, startUsage, stopUsage };
