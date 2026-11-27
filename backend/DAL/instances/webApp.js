async function insert(connection, groupId, data) {
    const [result] = await connection.execute(
        `INSERT INTO WebApps (group_id,database_id,name,status)
        VALUES (?,?,?,'running')`,
        [groupId, data.databaseId, data.name]
    );
    return result.insertId;
}
module.exports = { table: "WebApps", column: "webapp_id", insert };
