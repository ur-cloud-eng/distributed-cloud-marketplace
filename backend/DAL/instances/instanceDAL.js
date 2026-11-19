
const db = require("../db");

async function getCustomerInstances(customerId) {
    const sql = `
        SELECT
            vm.vm_id,
            vm.name,
            vm.vcpu,
            vm.ram_gb,
            vm.disk_gb,
            vm.status
        FROM VirtualMachines vm
        JOIN ResourceRegistry r ON r.vm_id = vm.vm_id
        WHERE r.customer_user_id = ?
          AND r.resource_type = 'VIRTUAL_MACHINE'
          AND r.status NOT IN ('cancelled', 'deleted')
        ORDER BY vm.created_at DESC
    `;

    const [rows] = await db.execute(sql, [customerId]);

    return rows;
}

async function createInstance(data) {
    const connection = await db.getConnection();

    try {
        await connection.query(
            `CALL sp_CreateVmWithAllocation(
                ?, ?, ?, ?, ?, ?, ?, ?, ?, @new_vm_id
            )`,
            [
                data.customerId,
                data.subnetId,
                data.hostId,
                data.name,
                data.hostingClass,
                data.vcpu,
                data.ramGb,
                data.diskGb,
                data.hourlyPrice
            ]
        );

        const [[result]] = await connection.query(
            "SELECT @new_vm_id AS vmId"
        );

        if (!result || !Number.isSafeInteger(result.vmId)) {
            throw new Error("Instance creation returned no valid ID");
        }

        return result.vmId;

    } finally {
        connection.release();
    }
}

async function getInstanceById(vmId, customerId) {
    const sql = `
        SELECT
            vm.vm_id,
            vm.name,
            vm.hosting_class,
            vm.vcpu,
            vm.ram_gb,
            vm.disk_gb,
            vm.status,
            vm.hourly_price,
            vm.created_at,
            vm.subnet_id,
            vm.host_id,
            r.resource_id,
            r.group_id
        FROM VirtualMachines vm
        JOIN ResourceRegistry r ON r.vm_id = vm.vm_id
        WHERE vm.vm_id = ?
          AND r.customer_user_id = ?
          AND r.resource_type = 'VIRTUAL_MACHINE'
          AND r.status NOT IN ('cancelled', 'deleted')
    `;

    const [rows] = await db.execute(sql, [vmId, customerId]);

    return rows[0] || null;
}

async function getInstanceForUpdate(connection, vmId, customerId) {
    const sql = `
        SELECT
            vm.vm_id,
            vm.status AS vm_status,
            r.resource_id,
            r.status AS resource_status
        FROM ResourceRegistry r
        JOIN VirtualMachines vm ON vm.vm_id = r.vm_id
        WHERE vm.vm_id = ?
          AND r.customer_user_id = ?
          AND r.resource_type = 'VIRTUAL_MACHINE'
        FOR UPDATE
    `;

    const [rows] = await connection.execute(sql, [vmId, customerId]);

    return rows[0] || null;
}

async function setInstanceRunning(connection, vmId, resourceId) {
    const [vmResult] = await connection.execute(
        `UPDATE VirtualMachines
         SET status = 'running'
         WHERE vm_id = ? AND status = 'stopped'`,
        [vmId]
    );

    if (vmResult.affectedRows !== 1) {
        throw new Error("Instance is not stopped");
    }

    const [resourceResult] = await connection.execute(
        `UPDATE ResourceRegistry
         SET status = 'active',
             activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP)
         WHERE resource_id = ?
           AND vm_id = ?
           AND status = 'stopped'`,
        [resourceId, vmId]
    );

    if (resourceResult.affectedRows !== 1) {
        throw new Error("Instance resource is not stopped");
    }
}

async function recordInstanceStart(connection, resourceId) {
    await connection.execute(
        `INSERT INTO ResourceUsagePeriods (resource_id, started_at)
         VALUES (?, CURRENT_TIMESTAMP)`,
        [resourceId]
    );
}

async function recordInstanceActivity(connection, vmId, resourceId, customerId) {
    const sql = `
        INSERT INTO ResourceActivityLogs (
            actor_user_id,
            resource_id,
            entity_type,
            entity_pk,
            action,
            old_status,
            new_status
        )
        VALUES (?, ?, 'VIRTUAL_MACHINE', ?, 'started', 'stopped', 'active')
    `;

    await connection.execute(sql, [
        customerId,
        resourceId,
        vmId
    ]);
}

module.exports = {
    getCustomerInstances,
    createInstance,
    getInstanceById,
    getInstanceForUpdate,
    setInstanceRunning,
    recordInstanceStart,
    recordInstanceActivity
};
