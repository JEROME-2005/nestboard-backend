import { z } from "zod";

const propertyTypeSchema = z.enum([
  "HOUSE",
  "VILLA",
  "APARTMENT",
  "HOTEL",
]);

const imageUrlSchema = z
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
        "Image URL must be an http(s) URL or a local /uploads/ path",
    },
  );

const propertyFields = {
  title: z.string().trim().min(3).max(120),

  description: z
    .string()
    .trim()
    .min(3)
    .max(5000),

  address: z
    .string()
    .trim()
    .min(3)
    .max(255),

  city: z
    .string()
    .trim()
    .min(2)
    .max(120),

  type: propertyTypeSchema,

  rating: z
    .number()
    .min(0)
    .max(5)
    .optional(),

  amenities: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(100),
    )
    .max(50)
    .default([]),

  latitude: z
    .number()
    .finite()
    .min(-90)
    .max(90),

  longitude: z
    .number()
    .finite()
    .min(-180)
    .max(180),

  imageUrl: imageUrlSchema,

  minStay: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .default("1 month"),

  isActive: z
    .boolean()
    .optional(),
};

export const createPropertySchema =
  z
    .object(propertyFields)
    .strict();

export const updatePropertySchema =
  z
    .object({
      title:
        propertyFields.title.optional(),

      description:
        propertyFields.description.optional(),

      address:
        propertyFields.address.optional(),

      city:
        propertyFields.city.optional(),

      type:
        propertyFields.type.optional(),

      amenities:
        propertyFields.amenities.optional(),

      latitude:
        propertyFields.latitude.optional(),

      longitude:
        propertyFields.longitude.optional(),

      imageUrl:
        propertyFields.imageUrl.optional(),

      minStay:
        propertyFields.minStay.optional(),

      isActive:
        propertyFields.isActive,
    })
    .strict()
    .refine(
      (data) =>
        Object.keys(data).length > 0,
      {
        message:
          "At least one field must be provided",
      },
    );

export type CreatePropertyInput =
  z.infer<
    typeof createPropertySchema
  >;

export type UpdatePropertyInput =
  z.infer<
    typeof updatePropertySchema
  >;