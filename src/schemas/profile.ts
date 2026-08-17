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
      .trim()
      .min(1)
      .max(2048)
      .refine(
        (value) =>
          /^https?:\/\//i.test(value) ||
          value.startsWith("/uploads/"),
        {
          message:
            "Avatar URL must be an http(s) URL or a local /uploads/ path",
        },
      )
      .nullable()
      .optional(),

    bioTag: z
      .string()
      .trim()
      .max(255)
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
