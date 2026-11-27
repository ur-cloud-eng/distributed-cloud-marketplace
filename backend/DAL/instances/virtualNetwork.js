const db = require("../dbconn");
async function list(customerId, groupId, id = null) {
    const [rows] = await db.execute(
        `SELECT n.* FROM VirtualNetworks n JOIN ResourceGroups g ON g.group_id=n.group_id
        WHERE g.customer_user_id=? AND g.group_id=? AND g.status='active' AND n.status='active' AND (? IS NULL OR n.vnet_id=?) ORDER BY n.vnet_id`,
        [customerId, groupId, id, id]
    );
    return rows;
}
async function create(connection, groupId, name, cidr) {
    const [result] = await connection.execute(
        "INSERT INTO VirtualNetworks (group_id,name,cidr_block) VALUES (?,?,?)",
        [groupId, name, cidr]
    );
    return result.insertId;
}
async function lock(connection, groupId, id) {
    const [rows] = await connection.execute(
        "SELECT * FROM VirtualNetworks WHERE vnet_id=? AND group_id=? AND status='active' FOR UPDATE",
        [id, groupId]
    );
    return rows[0];
}
async function inUse(connection, id) {
    const [[row]] = await connection.execute(
        `SELECT (EXISTS(SELECT 1 FROM Subnets WHERE vnet_id=? AND status='active')
        OR EXISTS(SELECT 1 FROM LoadBalancers l JOIN ResourceRegistry r ON r.lb_id=l.lb_id WHERE l.vnet_id=? AND r.status NOT IN ('cancelled','deleted'))) AS used`,
        [id, id]
    );
    return Boolean(Number(row.used));
}
async function remove(connection, id) {
    await connection.execute(
        "UPDATE VirtualNetworks SET status='deleted',deleted_at=UTC_TIMESTAMP() WHERE vnet_id=?",
        [id]
    );
}
module.exports = { list, create, lock, inUse, remove };
