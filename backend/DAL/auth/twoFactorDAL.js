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
        `SELECT totp_enabled_at AS enabled_at
             FROM Users
             WHERE user_id = ? AND totp_encrypted_secret IS NOT NULL FOR UPDATE`,
        parameters
    );
}

async function saveEnrollment(connection, parameters) {
    return connection.execute(
        `UPDATE Users
                 SET totp_encrypted_secret = ?,
                     totp_enabled_at = NULL,
                     totp_last_used_step = NULL,
                     totp_created_at = COALESCE(totp_created_at, UTC_TIMESTAMP())
                 WHERE user_id = ?`,
        parameters
    );
}

async function lockEnrollmentForConfirmation(connection, parameters) {
    return connection.execute(
        `SELECT totp_encrypted_secret AS encrypted_secret,
                    totp_enabled_at AS enabled_at, totp_last_used_step AS last_used_step
             FROM Users
             WHERE user_id = ? AND totp_encrypted_secret IS NOT NULL FOR UPDATE`,
        parameters
    );
}

async function enableEnrollment(connection, parameters) {
    return connection.execute(
        `UPDATE Users
             SET totp_enabled_at = UTC_TIMESTAMP(),
                 totp_last_used_step = ?
             WHERE user_id = ?`,
        parameters
    );
}

async function lockEnrollmentForLogin(connection, parameters) {
    return connection.execute(
        `SELECT totp_encrypted_secret AS encrypted_secret,
                    totp_enabled_at AS enabled_at, totp_last_used_step AS last_used_step
             FROM Users
             WHERE user_id = ? AND totp_encrypted_secret IS NOT NULL FOR UPDATE`,
        parameters
    );
}

async function consumeTimeStep(connection, parameters) {
    return connection.execute(
        `UPDATE Users
             SET totp_last_used_step = ?
             WHERE user_id = ?
               AND (totp_last_used_step IS NULL OR totp_last_used_step < ?)`,
        parameters
    );
}

module.exports = {
    ...transaction,
    lockUserForEnrollment,
    lockEnrollmentStatus,
    saveEnrollment,
    lockEnrollmentForConfirmation,
    enableEnrollment,
    lockEnrollmentForLogin,
    consumeTimeStep
};
