import z from "zod";

export const registerSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8).max(200),
    displayName: z.string().min(2).max(80).optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;

export const googleAuthSchema = z
  .object({
    idToken: z.string().min(20),
  })
  .strict();

export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const loginSchema = z
  .object({
    email: z.email(),
    password: z.string(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
