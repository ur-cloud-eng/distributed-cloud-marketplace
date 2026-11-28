const { listNotifications, markNotificationRead, insertNotification } =
    require("../../DAL/finance/notification");

module.exports = { listNotifications, markNotificationRead, notify: insertNotification };
