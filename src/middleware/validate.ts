import type { RequestHandler } from "express";
import type { z } from "zod";

export function validateBody<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateParams<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, _res, next) => {
    req.params = schema.parse(req.params) as never;
    next();
  };
}
