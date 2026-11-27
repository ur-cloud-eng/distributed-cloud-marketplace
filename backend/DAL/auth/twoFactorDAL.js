const transaction = require("../transaction");

async function lockUserForEnrollment(connection, parameters) {
    return connection.execute(
        `SELECT email, email_verified_at
         FROM Users
         WHERE user_id = ? FOR UPDATE`,
        parameters
    );
}

async function lockEnrollmentStatus(connection, parameters) {
    return connection.execute(
        `SELECT enabled_at FROM UserTwoFactor WHERE user_id = ? FOR UPDATE`,
        parameters
    );
}

async function saveEnrollment(connection, [encryptedSecret, userId]) {
    return connection.execute(
        `INSERT INTO UserTwoFactor (user_id, encrypted_secret, created_at)
         VALUES (?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE encrypted_secret = ?, last_used_step = NULL`,
        [userId, encryptedSecret, encryptedSecret]
    );
}

async function lockEnrollment(connection, parameters) {
    return connection.execute(
        `SELECT encrypted_secret, enabled_at, last_used_step
         FROM UserTwoFactor WHERE user_id = ? FOR UPDATE`,
        parameters
    );
}

async function enableEnrollment(connection, parameters) {
    return connection.execute(
        `UPDATE UserTwoFactor
         SET enabled_at = UTC_TIMESTAMP(), last_used_step = ?
         WHERE user_id = ?`,
        parameters
    );
}

async function consumeTimeStep(connection, parameters) {
    return connection.execute(
        `UPDATE UserTwoFactor
         SET last_used_step = ?
         WHERE user_id = ? AND (last_used_step IS NULL OR last_used_step < ?)`,
        parameters
    );
}

module.exports = {
    ...transaction,
    lockUserForEnrollment,
    lockEnrollmentStatus,
    saveEnrollment,
    lockEnrollmentForConfirmation: lockEnrollment,
    enableEnrollment,
    lockEnrollmentForLogin: lockEnrollment,
    consumeTimeStep
};
