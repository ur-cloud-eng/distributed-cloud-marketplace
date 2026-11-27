const express = require("express");
const { authenticate, requireRole, handle } = require("../../middleware/access");
const { requiredId } = require("../../../utils/helpers");
const service = require("../../../BLL/instances/loadBalancerService");
const router = express.Router({ mergeParams: true });
router.use(authenticate, requireRole("Customer"));
router.get(
    "/",
    handle(async (req, res) => res.json(await service.list(req.user.id, requiredId(req.params.groupId))))
);
router.post(
    "/",
    handle(async (req, res) =>
        res.status(201).json(await service.create(req.user.id, requiredId(req.params.groupId), req.body))
    )
);
router.get(
    "/:id",
    handle(async (req, res) =>
        res.json(await service.get(req.user.id, requiredId(req.params.groupId), requiredId(req.params.id)))
    )
);
router.delete(
    "/:id",
    handle(async (req, res) =>
        res.json(await service.remove(req.user.id, requiredId(req.params.groupId), requiredId(req.params.id)))
    )
);
router.get(
    "/:id/targets",
    handle(async (req, res) =>
        res.json(await service.targets(req.user.id, requiredId(req.params.groupId), requiredId(req.params.id)))
    )
);
router.post(
    "/:id/targets",
    handle(async (req, res) =>
        res
            .status(201)
            .json(
                await service.addTarget(
                    req.user.id,
                    requiredId(req.params.groupId),
                    requiredId(req.params.id),
                    requiredId(req.body.vmId)
                )
            )
    )
);
router.delete(
    "/:id/targets/:vmId",
    handle(async (req, res) =>
        res.json(
            await service.removeTarget(
                req.user.id,
                requiredId(req.params.groupId),
                requiredId(req.params.id),
                requiredId(req.params.vmId)
            )
        )
    )
);
module.exports = router;
