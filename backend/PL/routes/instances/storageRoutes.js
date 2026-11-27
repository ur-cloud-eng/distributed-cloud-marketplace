const express = require("express");
const { authenticate, requireRole, handle } = require("../../middleware/access");
const { requiredId } = require("../../../utils/helpers");
const service = require("../../../BLL/instances/storageService");
const router = express.Router({ mergeParams: true });
router.use(authenticate, requireRole("Customer"));
router.get(
    "/",
    handle(async (req, res) =>
        res.json(await service.list(req.user.id, requiredId(req.params.groupId), req.params.type))
    )
);
router.post(
    "/",
    handle(async (req, res) =>
        res
            .status(201)
            .json(
                await service.create(req.user.id, requiredId(req.params.groupId), req.params.type, req.body)
            )
    )
);
router.get(
    "/:id",
    handle(async (req, res) =>
        res.json(
            await service.get(
                req.user.id,
                requiredId(req.params.groupId),
                req.params.type,
                requiredId(req.params.id)
            )
        )
    )
);
router.delete(
    "/:id",
    handle(async (req, res) =>
        res.json(
            await service.remove(
                req.user.id,
                requiredId(req.params.groupId),
                req.params.type,
                requiredId(req.params.id)
            )
        )
    )
);
module.exports = router;
