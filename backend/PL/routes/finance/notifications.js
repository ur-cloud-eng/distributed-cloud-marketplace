const { handle } = require("../../middleware/access");
const express = require("express");
const { positiveInteger } = require("../../../utils/util");
const { bad, notFound } = require("../../../utils/helpers");
const notifications = require("../../../BLL/finance/notificationService");

const router = express.Router();
const RECIPIENTS = ["Customer", "Provider", "Admin"];

// Admins may explicitly select a recipient. The default is their own inbox.
function scope(req) {
    const { recipient_type: type, recipient_id: rawId } = req.query;
    if (req.user.role !== "Admin" || (type === undefined && rawId === undefined))
        return { type: req.user.role, id: req.user.id };

    const id = positiveInteger(rawId);
    if (!RECIPIENTS.includes(type) || !id) throw bad("Invalid recipient type or ID.");
    return { type, id };
}

router.get(
    "/",
    handle(async (req, res) => {
        const { type, id } = scope(req);

        const { unread_only: unreadOnly } = req.query;
        if (unreadOnly !== undefined && !["true", "false"].includes(unreadOnly))
            throw bad("unread_only must be true or false.");

        res.json(
            await notifications.listNotifications({
                recipientType: type,
                recipientId: id,
                unreadOnly: unreadOnly === "true"
            })
        );
    }, "Could not load notifications.")
);

router.patch(
    "/:id/read",
    handle(async (req, res) => {
        const id = positiveInteger(req.params.id);
        if (!id) throw bad("Invalid notification ID.");

        const { type, id: recipientId } = scope(req);
        if (!(await notifications.markNotificationRead(id, { type, id: recipientId })))
            throw notFound("Notification not found.");

        res.json({ message: "Notification marked as read.", id, is_read: true });
    }, "Could not update notification.")
);

module.exports = router;
