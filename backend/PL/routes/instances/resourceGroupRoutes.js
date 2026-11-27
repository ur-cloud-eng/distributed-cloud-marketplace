const express = require("express");
const { authenticate, requireRole, handle } = require("../../middleware/access");
const { requiredId } = require("../../../utils/helpers");
const service = require("../../../BLL/instances/resourceGroupService");
const router = express.Router({ mergeParams: true });
router.use(authenticate, requireRole("Customer"));
router.get(
    "/",
    handle(async (req, res) => {
        res.json({ resourceGroups: await service.list(req.user.id) });
    })
);
router.post(
    "/",
    handle(async (req, res) => {
        res.status(201).json({ groupId: await service.create(req.user.id, req.body) });
    })
);

router.get(
    "/:id",
    handle(async (req, res) => res.json(await service.get(req.user.id, requiredId(req.params.id))))
);
router.delete(
    "/:id",
    handle(async (req, res) => {
        res.json(await service.remove(req.user.id, requiredId(req.params.id)));
    })
);
module.exports = router;
