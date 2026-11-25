const db = require("../db");

async function getAvailableProviderCapacity() {
  const sql = `
        SELECT
            c.host_id,
            c.region,
            c.hosting_class,
            c.free_cpu,
            c.free_ram_gb,
            c.free_disk_gb
        FROM vw_ProviderCapacity c
        JOIN ProviderHosts h
        ON c.host_id = h.host_id
        JOIN Users u
        ON h.provider_user_id = u.user_id
        WHERE h.status = 'available'
        AND u.role = 'provider'
        AND u.email_verified_at IS NOT NULL
        AND c.free_cpu > 0
        AND c.free_ram_gb > 0
        AND c.free_disk_gb > 0
        ORDER BY c.region, c.hosting_class
    `;

  const [rows] = await db.execute(sql);

  return rows.map((row) => ({
    host_id: row.host_id,
    region: row.region,
    hosting_class: row.hosting_class,
    free_cpu: Number(row.free_cpu),
    free_ram_gb: Number(row.free_ram_gb),
    free_disk_gb: Number(row.free_disk_gb),
  }));
}

module.exports = { getAvailableProviderCapacity };
