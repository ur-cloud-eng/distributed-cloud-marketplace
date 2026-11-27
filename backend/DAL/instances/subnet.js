const db = require("../dbconn");
async function list(customerId, groupId, vnetId, id = null) {
    const [rows] = await db.execute(
        `SELECT s.* FROM Subnets s JOIN VirtualNetworks n ON n.vnet_id=s.vnet_id
        JOIN ResourceGroups g ON g.group_id=n.group_id WHERE g.customer_user_id=? AND g.group_id=? AND n.vnet_id=?
        AND g.status='active' AND n.status='active' AND s.status='active' AND (? IS NULL OR s.subnet_id=?) ORDER BY s.subnet_id`,
        [customerId, groupId, vnetId, id, id]
    );
    return rows;
}
async function ranges(connection, vnetId) {
    const [rows] = await connection.execute(
        "SELECT cidr_block FROM Subnets WHERE vnet_id=? AND status='active'",
        [vnetId]
    );
    return rows;
}
async function create(connection, vnetId, name, cidr) {
    const [result] = await connection.execute(
        "INSERT INTO Subnets (vnet_id,name,cidr_block) VALUES (?,?,?)",
        [vnetId, name, cidr]
    );
    return result.insertId;
}
async function lock(connection, vnetId, id) {
    const [rows] = await connection.execute(
        "SELECT * FROM Subnets WHERE subnet_id=? AND vnet_id=? AND status='active' FOR UPDATE",
        [id, vnetId]
    );
    return rows[0];
}
async function inUse(connection, id) {
    const [[row]] = await connection.execute(
        `SELECT EXISTS(SELECT 1 FROM VirtualMachines v JOIN ResourceRegistry r ON r.vm_id=v.vm_id
        WHERE v.subnet_id=? AND r.status NOT IN ('cancelled','deleted')) AS used`,
        [id]
    );
    return Boolean(Number(row.used));
}
async function remove(connection, id) {
    await connection.execute(
        "UPDATE Subnets SET status='deleted',deleted_at=UTC_TIMESTAMP() WHERE subnet_id=?",
        [id]
    );
}
module.exports = { list, ranges, create, lock, inUse, remove };
