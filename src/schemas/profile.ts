import { z } from "zod";

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .optional(),

    avatarUrl: z
      .string()
      .url()
      .max(2048)
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      Object.keys(data).length > 0,
    {
      message:
        "At least one profile field must be provided",
    },
  );

export type UpdateProfileInput =
  z.infer<
    typeof updateProfileSchema
  >;