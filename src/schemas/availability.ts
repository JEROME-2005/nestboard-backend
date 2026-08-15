import { z } from "zod";

export const availabilityQuerySchema = z
  .object({
    startMonth: z
      .string()
      .regex(
        /^\d{4}-(0[1-9]|1[0-2])$/,
        "startMonth must use YYYY-MM format",
      )
      .optional(),

    durationMonths: z.coerce
      .number()
      .int()
      .min(1)
      .max(24)
      .optional(),
  })
  .strict();

export type AvailabilityQuery =
  z.infer<typeof availabilityQuerySchema>;