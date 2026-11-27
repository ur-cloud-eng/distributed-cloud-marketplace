const db = require("../dbconn");

const {
    setInstanceStatus,
    openUsageCount,
    startUsage,
    stopUsage,
    recordActivity,
    getActivityHistory
} = require("./lifecycle");

const { getAssignedIP, lockFreeIP, assignIP, releaseIP } = require("./ip");

async function getCustomerInstances(customerId) {
    const [rows] = await db.execute(
        `
        SELECT vm.vm_id, vm.name, vm.hosting_class, vm.vcpu, vm.ram_gb,
               vm.disk_gb, vm.status, vm.hourly_price, vm.created_at,
               vm.subnet_id, vm.host_id, r.resource_id, r.status AS resource_status
        FROM VirtualMachines vm
        JOIN ResourceRegistry r ON r.vm_id = vm.vm_id
        WHERE r.customer_user_id = ?
          AND r.resource_type = 'VIRTUAL_MACHINE'
          AND r.status NOT IN ('cancelled', 'deleted')
        ORDER BY vm.created_at DESC, vm.vm_id DESC`,
        [customerId]
    );

    return rows;
}

async function findSubnet(customerId, subnetId) {
    const [rows] = await db.execute(
        `SELECT g.region FROM Subnets s JOIN VirtualNetworks n ON n.vnet_id=s.vnet_id
        JOIN ResourceGroups g ON g.group_id=n.group_id WHERE s.subnet_id=? AND g.customer_user_id=?
        AND s.status='active' AND n.status='active' AND g.status='active'`,
        [subnetId, customerId]
    );
    return rows[0];
}
async function findCompatibleHosts(region, data) {
    const [rows] = await db.execute(
        `SELECT h.host_id FROM ProviderHosts h JOIN Users u ON u.user_id=h.provider_user_id
        JOIN vw_ProviderCapacity c ON c.host_id=h.host_id WHERE h.region=? AND h.hosting_class=? AND h.status='available'
        AND u.role='provider' AND u.email_verified_at IS NOT NULL AND c.free_cpu>=? AND c.free_ram_gb>=? AND c.free_disk_gb>=?
        ORDER BY c.free_cpu DESC,h.host_id`,
        [region, data.hostingClass, data.vcpu, data.ramGb, data.diskGb]
    );
    return rows;
}

async function createInstance(data) {
    const connection = await db.getConnection();

    try {
        await connection.query(
            `
            CALL sp_CreateVmWithAllocation(
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

        const [[result]] = await connection.query("SELECT @new_vm_id AS vmId");

        if (!result || !Number.isSafeInteger(result.vmId) || result.vmId <= 0)
            throw new Error("Instance creation returned no valid ID");

        return result.vmId;
    } finally {
        connection.release();
    }
}

async function getInstanceById(vmId, customerId, isAdmin = false) {
    const [rows] = await db.execute(
        `
        SELECT vm.vm_id, vm.name, vm.hosting_class, vm.vcpu, vm.ram_gb,
               vm.disk_gb, vm.status, vm.hourly_price, vm.created_at,
               vm.subnet_id, vm.host_id, r.resource_id, r.group_id,
               r.customer_user_id, r.status AS resource_status
        FROM VirtualMachines vm
        JOIN ResourceRegistry r ON r.vm_id = vm.vm_id
        WHERE vm.vm_id = ?
          AND (? = 1 OR r.customer_user_id = ?)
          AND r.resource_type = 'VIRTUAL_MACHINE'
          AND r.status NOT IN ('cancelled', 'deleted')`,
        [vmId, isAdmin ? 1 : 0, customerId]
    );

    return rows[0] || null;
}

async function getInstanceForUpdate(connection, vmId, customerId, isAdmin = false) {
    const [rows] = await connection.execute(
        `
        SELECT vm.vm_id, vm.status AS vm_status, vm.hosting_class,
               vm.vcpu, vm.ram_gb, vm.disk_gb, vm.host_id,
               r.resource_id, r.customer_user_id,
               r.status AS resource_status,
               h.provider_user_id AS provider_id
        FROM ResourceRegistry r
        JOIN VirtualMachines vm ON vm.vm_id = r.vm_id
        JOIN ProviderHosts h ON h.host_id = vm.host_id
        WHERE vm.vm_id = ?
          AND (? = 1 OR r.customer_user_id = ?)
          AND r.resource_type = 'VIRTUAL_MACHINE'
        FOR UPDATE`,
        [vmId, isAdmin ? 1 : 0, customerId]
    );

    return rows[0] || null;
}

module.exports = {
    findSubnet,
    findCompatibleHosts,
    getCustomerInstances,
    createInstance,
    getInstanceById,
    getInstanceForUpdate,
    setInstanceStatus,
    openUsageCount,
    startUsage,
    stopUsage,
    recordActivity,
    getActivityHistory,
    getAssignedIP,
    lockFreeIP,
    assignIP,
    releaseIP
};
