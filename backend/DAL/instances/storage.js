function model(type) {
    if (type === "blob")
        return {
            table: "BlobStorage",
            column: "blob_id",
            type: "BLOB_STORAGE",
            insert: insertBlob
        };
    if (type === "file")
        return {
            table: "FileStorage",
            column: "file_id",
            type: "FILE_STORAGE",
            insert: insertFile
        };
    return null;
}
async function insertBlob(connection, groupId, data) {
    const [result] = await connection.execute(
        "INSERT INTO BlobStorage (group_id,name,size_gb) VALUES (?,?,?)",
        [groupId, data.name, data.diskGb]
    );
    return result.insertId;
}
async function insertFile(connection, groupId, data) {
    const [result] = await connection.execute(
        "INSERT INTO FileStorage (group_id,name,size_gb) VALUES (?,?,?)",
        [groupId, data.name, data.diskGb]
    );
    return result.insertId;
}
module.exports = { model };
