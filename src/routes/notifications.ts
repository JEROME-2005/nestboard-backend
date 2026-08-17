import { Router } from "express";
import { z } from "zod";
import {
  verifyJwt,
} from "../middleware/auth.js";
import {
  validateParams,
} from "../middleware/validate.js";
import * as ctrl from "../controllers/notification-controller.js";

export const notificationsRouter =
  Router();

notificationsRouter.use(verifyJwt);

const idParam = z.object({
  id: z.uuid(),
});

notificationsRouter.get(
  "/",
  ctrl.list,
);

notificationsRouter.patch(
  "/:id/read",
  validateParams(idParam),
  ctrl.markRead,
);

notificationsRouter.patch(
  "/read-all",
  ctrl.markAllRead,
);
