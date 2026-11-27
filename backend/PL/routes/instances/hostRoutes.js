const express = require("express");
const { authenticate, requireRole, handle } = require("../../middleware/access");
const { positiveInteger, HttpError } = require("../../../utils/util");
const service = require("../../../BLL/instances/hostService");
const router = express.Router({ mergeParams: true });
router.use(authenticate, requireRole("Provider"));
function id(value) {
    const result = positiveInteger(value);
    if (!result) throw new HttpError(400, "Invalid ID.");
    return result;
}
router.get(
    "/",
    handle(async (req, res) => {
        res.json({ hosts: await service.list(req.user.id) });
    })
);
router.post(
    "/",
    handle(async (req, res) => {
        res.status(201).json({ hostId: await service.create(req.user.id, req.body) });
    })
);
router.patch(
    "/:id",
    handle(async (req, res) => {
        res.json(await service.update(req.user.id, id(req.params.id), req.body));
    })
);
router.get(
    "/:id",
    handle(async (req, res) => res.json(await service.get(req.user.id, id(req.params.id))))
);
router.delete(
    "/:id",
    handle(async (req, res) => {
        res.json(await service.remove(req.user.id, id(req.params.id)));
    })
);
module.exports = router;
