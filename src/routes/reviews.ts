import { Router } from "express";
import { z } from "zod";
import { Role } from "../generated/enums.js";
import {
  requireRole,
  verifyJwt,
} from "../middleware/auth.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validate.js";
import {
  createReviewSchema,
} from "../schemas/review.js";
import * as ctrl from "../controllers/review-controller.js";

export const reviewsRouter =
  Router();

const propertyParam = z.object({
  propertyId: z.uuid(),
});

reviewsRouter.get(
  "/properties/:propertyId/reviews",
  validateParams(propertyParam),
  ctrl.list,
);

reviewsRouter.post(
  "/properties/:propertyId/reviews",
  verifyJwt,
  requireRole(Role.USER),
  validateParams(propertyParam),
  validateBody(createReviewSchema),
  ctrl.create,
);

reviewsRouter.get(
  "/properties/:propertyId/reviews/me",
  verifyJwt,
  requireRole(Role.USER),
  validateParams(propertyParam),
  ctrl.mine,
);

reviewsRouter.get(
  "/properties/:propertyId/reviews/eligibility",
  verifyJwt,
  requireRole(Role.USER),
  validateParams(propertyParam),
  ctrl.eligibility,
);