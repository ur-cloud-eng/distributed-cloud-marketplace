const db = require("../dbconn");
async function list(customerId, id = null) {
    const [rows] = await db.execute(
        "SELECT * FROM ResourceGroups WHERE customer_user_id=? AND status='active' AND (? IS NULL OR group_id=?) ORDER BY group_id",
        [customerId, id, id]
    );
    return rows;
}
async function create(customerId, name, region) {
    const [result] = await db.execute(
        "INSERT INTO ResourceGroups (customer_user_id,name,region) VALUES (?,?,?)",
        [customerId, name, region]
    );
    return result.insertId;
}
async function lock(connection, customerId, id) {
    const [rows] = await connection.execute(
        "SELECT * FROM ResourceGroups WHERE group_id=? AND customer_user_id=? AND status='active' FOR UPDATE",
        [id, customerId]
    );
    return rows[0];
}
async function inUse(connection, id) {
    const [[row]] = await connection.execute(
        `SELECT (EXISTS(SELECT 1 FROM VirtualNetworks WHERE group_id=? AND status='active')
        OR EXISTS(SELECT 1 FROM ResourceRegistry WHERE group_id=? AND status NOT IN ('cancelled','deleted'))) AS used`,
        [id, id]
    );
    return Boolean(Number(row.used));
}
async function remove(connection, id) {
    await connection.execute(
        "UPDATE ResourceGroups SET status='deleted',deleted_at=UTC_TIMESTAMP() WHERE group_id=?",
        [id]
    );
}
module.exports = { list, create, lock, inUse, remove };
