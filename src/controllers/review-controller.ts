import type { RequestHandler } from "express";
import * as reviewService from "../services/review-service.js";

export const create: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const review =
      await reviewService.createReview(
        req.user!.id,
        String(req.params.propertyId),
        req.body,
      );

    res.status(201).json(review);
  } catch (err) {
    next(err);
  }
};

export const list: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const reviews =
      await reviewService.listPropertyReviews(
        String(req.params.propertyId),
      );

    res.json(reviews);
  } catch (err) {
    next(err);
  }
};

export const mine: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const review =
      await reviewService.getMyPropertyReview(
        req.user!.id,
        String(req.params.propertyId),
      );

    res.json(review);
  } catch (err) {
    next(err);
  }
};

export const eligibility: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const result =
      await reviewService.canReviewProperty(
        req.user!.id,
        String(req.params.propertyId),
      );

    res.json(result);
  } catch (err) {
    next(err);
  }
};