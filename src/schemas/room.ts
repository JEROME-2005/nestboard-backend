import { z } from "zod";

export const createRoomTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(120),

    pricePerMonth: z.number().finite().positive().max(10_000_000),

    seatCapacity: z
      .number()
      .int()
      .min(1)
      .max(100),

    hasAC: z.boolean().default(false),

    isAvailable: z.boolean().default(true),
  })
  .strict();

export const updateRoomTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),

    pricePerMonth: z
      .number()
      .finite()
      .positive()
      .max(10_000_000)
      .optional(),

    seatCapacity: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional(),

    hasAC: z.boolean().optional(),

    isAvailable: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const createRoomSchema = z
  .object({
    roomLabel: z.string().trim().min(1).max(100),

    isAvailable: z.boolean().default(true),
  })
  .strict();

export const updateRoomSchema = z
  .object({
    roomLabel: z.string().trim().min(1).max(100).optional(),

    isAvailable: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateRoomTypeInput = z.infer<
  typeof createRoomTypeSchema
>;

export type UpdateRoomTypeInput = z.infer<
  typeof updateRoomTypeSchema
>;

export type CreateRoomInput = z.infer<
  typeof createRoomSchema
>;

export type UpdateRoomInput = z.infer<
  typeof updateRoomSchema
>;