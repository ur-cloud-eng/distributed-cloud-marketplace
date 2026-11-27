async function insert(connection, groupId, data) {
    const [result] = await connection.execute(
        `INSERT INTO ManagedDatabases (group_id,name,engine,size_gb,status)
        VALUES (?,?,?,?,'running')`,
        [groupId, data.name, data.type, data.diskGb]
    );
    return result.insertId;
}
module.exports = { table: "ManagedDatabases", column: "database_id", insert };
