async function insert(connection, groupId, data) {
    const [result] = await connection.execute(
        `INSERT INTO LoadBalancers (vnet_id,name,algorithm,status)
        VALUES (?,?,?,'active')`,
        [data.vnetId, data.name, data.algorithm]
    );
    return result.insertId;
}
async function sameNetwork(connection, lbId, vmId) {
    const [rows] = await connection.execute(
        `SELECT v.vm_id FROM VirtualMachines v
        JOIN Subnets s ON s.subnet_id=v.subnet_id JOIN LoadBalancers l ON l.vnet_id=s.vnet_id
        WHERE l.lb_id=? AND v.vm_id=? FOR UPDATE`,
        [lbId, vmId]
    );
    return !!rows.length;
}
async function addTarget(connection, lbId, vmId) {
    await connection.execute("CALL sp_AddLoadBalancerTarget(?,?)", [lbId, vmId]);
}
async function removeTarget(connection, lbId, vmId) {
    await connection.execute("DELETE FROM LoadBalancerTargets WHERE lb_id=? AND vm_id=?", [
        lbId,
        vmId
    ]);
}
async function targets(connection, lbId) {
    const [rows] = await connection.execute(
        "SELECT vm_id FROM LoadBalancerTargets WHERE lb_id=? ORDER BY vm_id",
        [lbId]
    );
    return rows;
}
module.exports = {
    table: "LoadBalancers",
    column: "lb_id",
    insert,
    sameNetwork,
    addTarget,
    removeTarget,
    targets
};
