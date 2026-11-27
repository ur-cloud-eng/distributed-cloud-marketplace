const db = require("../dbconn");
const hosts = require("./host");

async function lockHosts(connection, region, hostingClass) {
    const [rows] = await connection.execute(
        `SELECT h.* FROM ProviderHosts h
        JOIN Users u ON u.user_id=h.provider_user_id
        WHERE h.region=? AND h.hosting_class=? AND h.status='available'
        AND u.role='provider' AND u.email_verified_at IS NOT NULL
        ORDER BY h.host_id FOR UPDATE`,
        [region, hostingClass]
    );
    return rows;
}

async function reserve(connection, resourceId, host, data) {
    await connection.execute(
        `INSERT INTO HostCapacityAllocations
        (resource_id,host_id,allocated_cpu,allocated_ram_gb,allocated_disk_gb)
        VALUES (?,?,?,?,?)`,
        [resourceId, host.host_id, data.vcpu, data.ramGb, data.diskGb]
    );
    for (const [type, quantity] of [
        ["CPU", data.vcpu],
        ["RAM", data.ramGb],
        ["Storage", data.diskGb]
    ]) {
        if (!quantity) continue;
        await connection.execute(
            `INSERT INTO ResourceUsagePeriods
            (resource_id,customer_id,provider_id,resource_type,cloud_class,quantity,started_at)
            VALUES (?,?,?,?,?,?,UTC_TIMESTAMP())`,
            [resourceId, data.customerId, host.provider_user_id, type, data.hostingClass, quantity]
        );
    }
}

async function register(connection, groupId, customerId, type, column, entityId) {
    const [result] = await connection.execute(
        `INSERT INTO ResourceRegistry
        (group_id,customer_user_id,resource_type,${column},status,activated_at)
        VALUES (?,?,?,?,'active',UTC_TIMESTAMP())`,
        [groupId, customerId, type, entityId]
    );
    await connection.execute(
        `INSERT INTO ResourceActivityLogs
        (actor_user_id,resource_id,entity_type,entity_pk,action,new_status)
        VALUES (?,?,?,?,'created','active')`,
        [customerId, result.insertId, type, entityId]
    );
    return result.insertId;
}

async function list(customerId, groupId, model, entityId = null) {
    const [rows] = await db.execute(
        `SELECT e.*, r.resource_id,r.resource_type,r.status AS resource_status,
        a.host_id,a.allocated_cpu,a.allocated_ram_gb,a.allocated_disk_gb,h.hosting_class
        FROM ${model.table} e JOIN ResourceRegistry r ON r.${model.column}=e.${model.column}
        JOIN ResourceGroups g ON g.group_id=r.group_id
        LEFT JOIN HostCapacityAllocations a ON a.resource_id=r.resource_id AND a.released_at IS NULL
        LEFT JOIN ProviderHosts h ON h.host_id=a.host_id
        WHERE r.customer_user_id=? AND r.group_id=? AND g.status='active'
        AND r.status NOT IN ('cancelled','deleted') AND (? IS NULL OR e.${model.column}=?)
        ORDER BY e.${model.column}`,
        [customerId, groupId, entityId, entityId]
    );
    return rows;
}

async function lockResource(connection, customerId, groupId, column, entityId) {
    const [rows] = await connection.execute(
        `SELECT * FROM ResourceRegistry
        WHERE customer_user_id=? AND group_id=? AND ${column}=?
        AND status NOT IN ('cancelled','deleted') FOR UPDATE`,
        [customerId, groupId, entityId]
    );
    return rows[0];
}

async function cancel(resourceId, customerId) {
    await db.query("CALL sp_CancelResource(?,?)", [resourceId, customerId]);
}

module.exports = { lockHosts, usage: hosts.usage, reserve, register, list, lockResource, cancel };
