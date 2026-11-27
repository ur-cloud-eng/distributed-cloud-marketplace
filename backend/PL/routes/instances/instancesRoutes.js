const express = require("express");
const { authenticate, requireRole, handle } = require("../../middleware/access");
const { positiveInteger } = require("../../../utils/util");
const { bad } = require("../../../utils/helpers");
const instances = require("../../../BLL/instances/instanceService");

// Developer 1 VM creation and customer listing + D2's supplementary lifecycle.
// Uses the existing verified express-session auth; there is no second login.
module.exports = function createRouter() {
    const router = express.Router();
    router.use(authenticate, requireRole("Customer", "Admin"));
    const instanceId = (req) => {
        const id = positiveInteger(req.params.id);
        if (!id) throw bad("Invalid VM ID.");
        return id;
    };
    router.get(
        "/",
        handle(async (req, res) => {
            if (req.user.role !== "Customer")
                return res.status(403).json({ error: "Customers only." });
            res.json({
                success: true,
                instances: await instances.getCustomerInstances(req.user.id)
            });
        }, "Could not load instances.")
    );
    router.post(
        "/",
        handle(async (req, res) => {
            if (req.user.role !== "Customer")
                return res.status(403).json({ error: "Customers only." });
            const vmId = await instances.createInstance(req.user.id, req.body);
            res.status(201).json({ success: true, message: "Instance created successfully", vmId });
        }, "Could not create instance.")
    );
    router.get(
        "/:id",
        handle(async (req, res) => {
            res.json({
                success: true,
                instance: await instances.getInstanceById(instanceId(req), req.user)
            });
        }, "Could not load instance.")
    );
    router.post(
        "/:id/start",
        handle(async (req, res) => {
            res.json(await instances.startInstance(instanceId(req), req.user));
        }, "Could not start instance.")
    );
    router.post(
        "/:id/stop",
        handle(async (req, res) => {
            res.json(await instances.stopInstance(instanceId(req), req.user));
        }, "Could not stop instance.")
    );
    router.post(
        "/:id/restart",
        handle(async (req, res) => {
            res.json(await instances.restartInstance(instanceId(req), req.user));
        }, "Could not restart instance.")
    );
    router.get(
        "/:id/activity",
        handle(async (req, res) => {
            res.json({ activities: await instances.getActivityHistory(instanceId(req), req.user) });
        }, "Could not load instance activity.")
    );
    router.post(
        "/:id/ip",
        handle(async (req, res) => {
            res.json(await instances.assignIP(instanceId(req), req.user));
        }, "Could not assign IP.")
    );
    router.delete(
        "/:id/ip",
        handle(async (req, res) => {
            res.json(await instances.releaseIP(instanceId(req), req.user));
        }, "Could not release IP.")
    );
    router.delete(
        "/:id",
        handle(async (req, res) => {
            res.json(await instances.deleteInstance(instanceId(req), req.user));
        }, "Could not cancel instance.")
    );
    return router;
};
