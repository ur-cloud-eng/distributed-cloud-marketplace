const express = require("express");
const { authenticate, requireRole, handle } = require("../../middleware/access");
const { positiveInteger } = require("../../../utils/util");
const { bad } = require("../../../utils/helpers");
const instances = require("../../../BLL/instances/instanceService");

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
    router.delete(
        "/:id",
        handle(async (req, res) => {
            res.json(await instances.deleteInstance(instanceId(req), req.user));
        }, "Could not cancel instance.")
    );
    return router;
};
