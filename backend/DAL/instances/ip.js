async function getAssignedIP(connection, vmId) {
    const [rows] = await connection.execute(
        `
        SELECT ip_address
        FROM InstanceIPPool
        WHERE vm_id = ?
        FOR UPDATE`,
        [vmId]
    );

    return rows[0]?.ip_address || null;
}

async function lockFreeIP(connection) {
    const [rows] = await connection.execute(`
        SELECT ip_address
        FROM InstanceIPPool
        WHERE vm_id IS NULL
        ORDER BY ip_address
        LIMIT 1
        FOR UPDATE`);

    return rows[0]?.ip_address || null;
}

async function assignIP(connection, vmId, address) {
    const [result] = await connection.execute(
        `
        UPDATE InstanceIPPool
        SET vm_id = ?, allocated_at = UTC_TIMESTAMP()
        WHERE ip_address = ? AND vm_id IS NULL`,
        [vmId, address]
    );

    if (result.affectedRows !== 1) throw new Error("IP allocation race detected");
}

async function releaseIP(connection, vmId) {
    await connection.execute(
        `
        UPDATE InstanceIPPool
        SET vm_id = NULL, allocated_at = NULL
        WHERE vm_id = ?`,
        [vmId]
    );
}

module.exports = {
    getAssignedIP,
    lockFreeIP,
    assignIP,
    releaseIP
};
