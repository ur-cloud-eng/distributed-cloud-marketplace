const billingCap = (connection, end) =>
    connection.execute(
        "SELECT DATE_FORMAT(LEAST(CAST(? AS DATETIME), UTC_TIMESTAMP()), '%Y-%m-%d %H:%i:%s') AS cap",
        [end]
    );

async function loadUsage(connection, customerId, start, cap) {
    const [rows] = await connection.execute(
        `SELECT provider_id, resource_type, cloud_class, quantity, started_at, ended_at
         FROM ResourceUsagePeriods
         WHERE customer_id=? AND started_at < CAST(? AS DATETIME)
           AND (ended_at IS NULL OR ended_at > CAST(? AS DATETIME))`,
        [customerId, cap, start]
    );
    return rows;
}

async function runningVmsWithoutOpenUsage(connection, customerId, cap) {
    const [rows] = await connection.execute(
        `
        SELECT vm.vm_id FROM VirtualMachines vm
        JOIN ResourceRegistry r ON r.vm_id = vm.vm_id
        WHERE r.customer_user_id = ? AND vm.status = 'running' AND vm.created_at < ?
          AND (SELECT COUNT(*) FROM ResourceUsagePeriods u
               WHERE u.resource_id=r.resource_id AND u.resource_type IN ('CPU','RAM')
                 AND u.ended_at IS NULL) <> 2
        LIMIT 10
    `,
        [customerId, cap]
    );
    return rows.map((row) => row.vm_id);
}

module.exports = { loadUsage, billingCap, runningVmsWithoutOpenUsage };
