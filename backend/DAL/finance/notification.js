const db = require("../dbconn");

async function insertNotification(connection, { to, id, title, message, paymentId = null }) {
    const [result] = await connection.execute(
        `
        INSERT INTO Notifications (user_id, category, title, message, payment_id)
        SELECT user_id, 'billing', ?, ?, ? FROM Users WHERE user_id = ? AND role = ?
        `,
        [title, message, paymentId, id, to.toLowerCase()]
    );

    if (result.affectedRows !== 1)
        throw new Error("Notification recipient not found or has a different role");
}

async function listNotifications({ recipientType, recipientId, unreadOnly = false }) {
    const [rows] = await db.execute(
        `
        SELECT n.notification_id AS id, ? AS recipient_type, n.user_id AS recipient_id,
               n.category, n.title, n.message, n.payment_id,
               (n.read_at IS NOT NULL) AS is_read, n.created_at
        FROM Notifications n JOIN Users u ON u.user_id = n.user_id
        WHERE n.user_id = ? AND u.role = ? AND n.category = 'billing'
          ${unreadOnly ? "AND n.read_at IS NULL" : ""}
        ORDER BY n.created_at DESC, n.notification_id DESC
        `,
        [recipientType, recipientId, recipientType.toLowerCase()]
    );
    return rows;
}

async function markNotificationRead(id, recipient) {
    const [result] = await db.execute(
        `
        UPDATE Notifications n JOIN Users u ON u.user_id = n.user_id
        SET n.read_at = COALESCE(n.read_at, CURRENT_TIMESTAMP)
        WHERE n.notification_id = ? AND n.user_id = ? AND u.role = ? AND n.category = 'billing'
        `,
        [id, recipient.id, recipient.type.toLowerCase()]
    );
    return result.affectedRows > 0;
}

module.exports = { listNotifications, markNotificationRead, insertNotification };
