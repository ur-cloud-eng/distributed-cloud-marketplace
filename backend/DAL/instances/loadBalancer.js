async function insert(connection, groupId, data) {
    const [result] = await connection.execute(
        `INSERT INTO LoadBalancers (vnet_id,name,algorithm,status)
        VALUES (?,?,?,'active')`,
        [data.vnetId, data.name, data.algorithm]
    );
    return result.insertId;
}
module.exports = {
    table: "LoadBalancers",
    column: "lb_id",
    insert
};
