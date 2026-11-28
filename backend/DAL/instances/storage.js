function model(type) {
    if (type !== "blob" && type !== "file") return null;
    return {
        table: "StorageVolumes",
        column: "storage_id",
        legacyId: type === "blob" ? "blob_id" : "file_id",
        type: type === "blob" ? "BLOB_STORAGE" : "FILE_STORAGE",
        insert
    };
}

async function insert(connection, groupId, data) {
    const [result] = await connection.execute(
        "INSERT INTO StorageVolumes (group_id,storage_type,name,size_gb) VALUES (?,?,?,?)",
        [groupId, data.type, data.name, data.diskGb]
    );
    return result.insertId;
}

module.exports = { model };
