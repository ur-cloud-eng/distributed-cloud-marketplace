const express = require("express");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const {
  getCustomerInstances,
  createInstance,
  getInstanceById,
} = require("../../BLL/instances/instanceService");

const router = express.Router();

router.get("/", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const customerId = req.session.user.userId;

    const instances = await getCustomerInstances(customerId);

    return res.status(200).json({
      success: true,
      instances: instances,
    });
  } catch (error) {
    console.error("Get instances error:", error);

    return res.status(500).json({
      message: "Unable to retrieve instances",
    });
  }
});

router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const customerId = req.session.user.userId;

    const vmId = await createInstance(customerId, req.body);

    return res.status(201).json({
      success: true,
      message: "Instance created successfully",
      vmId: vmId,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Insufficient provider capacity") {
      return res.status(409).json({
        success: false,
        message: "Insufficient provider capacity",
      });
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An instance with conflicting details already exists",
      });
    }

    console.error("Create instance error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create instance",
    });
  }
});

router.get("/:id", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const vmId = Number(req.params.id);

    if (!Number.isSafeInteger(vmId) || vmId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid instance ID",
      });
    }

    const customerId = req.session.user.userId;

    const instance = await getInstanceById(vmId, customerId);

    if (!instance) {
      return res.status(404).json({
        success: false,
        message: "Instance not found",
      });
    }

    return res.status(200).json({
      success: true,
      instance: instance,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Get instance error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve instance",
    });
  }
});

module.exports = router;
