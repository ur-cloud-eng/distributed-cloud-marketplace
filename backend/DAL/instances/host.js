const db = require("../dbconn");
async function list(providerId, id = null) {
    const [rows] = await db.execute(
        `SELECT h.*, c.used_cpu, c.used_ram_gb, c.used_disk_gb,
        c.free_cpu, c.free_ram_gb, c.free_disk_gb FROM ProviderHosts h
        JOIN vw_ProviderCapacity c ON c.host_id=h.host_id WHERE h.provider_user_id=? AND (? IS NULL OR h.host_id=?) ORDER BY h.host_id`,
        [providerId, id, id]
    );
    return rows;
}
async function create(providerId, data) {
    const [result] = await db.execute(
        `INSERT INTO ProviderHosts
        (provider_user_id,name,region,hosting_class,total_cpu,total_ram_gb,total_disk_gb)
        VALUES (?,?,?,?,?,?,?)`,
        [
            providerId,
            data.name,
            data.region,
            data.hostingClass,
            data.totalCpu,
            data.totalRamGb,
            data.totalDiskGb
        ]
    );
    return result.insertId;
}
async function lock(connection, providerId, id) {
    const [rows] = await connection.execute(
        "SELECT * FROM ProviderHosts WHERE host_id=? AND provider_user_id=? FOR UPDATE",
        [id, providerId]
    );
    return rows[0];
}
async function usage(connection, id) {
    const [[row]] = await connection.execute(
        `SELECT COUNT(*) AS total, COALESCE(SUM(allocated_cpu),0) AS cpu,
        COALESCE(SUM(allocated_ram_gb),0) AS ram, COALESCE(SUM(allocated_disk_gb),0) AS disk
        FROM HostCapacityAllocations WHERE host_id=? AND released_at IS NULL`,
        [id]
    );
    return row;
}
async function update(connection, id, data) {
    await connection.execute(
        `UPDATE ProviderHosts SET name=?,total_cpu=?,total_ram_gb=?,total_disk_gb=?,status=? WHERE host_id=?`,
        [data.name, data.totalCpu, data.totalRamGb, data.totalDiskGb, data.status, id]
    );
}
module.exports = { list, create, lock, usage, update };
