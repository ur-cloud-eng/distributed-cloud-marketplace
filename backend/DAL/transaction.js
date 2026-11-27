const db = require("./dbconn");
module.exports = {
    getConnection: () => db.getConnection(),
    beginTransaction: (connection) => connection.beginTransaction(),
    commit: (connection) => connection.commit(),
    rollback: (connection) => connection.rollback(),
    release: (connection) => connection.release()
};
