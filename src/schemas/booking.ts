import { z } from "zod";

const monthIso = z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM");

export const createBookingSchema = z
  .object({
    roomId: z.uuid(),
    seatNumber: z.number().int().min(1).max(20),
    startMonth: monthIso,
    durationMonths: z.number().int().min(1).max(12),
  })
  .strict();

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function toStartMonth(value: string): string | null {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const match = value
    .trim()
    .toLowerCase()
    .match(/^([a-z]{3,9})\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTH_INDEX[match[1]!.slice(0, 3)];
  if (!month) return null;
  return `${match[2]}-${String(month).padStart(2, "0")}`;
}

// PUT /bookings body. Accepts seatIndex/date/period aliases and normalizes to
// CreateBookingInput. total is ignored; the server computes the price.
export const confirmBookingSchema = z
  .object({
    roomId: z.uuid(),
    seatIndex: z.number().int().min(1).max(20).optional(),
    seatNumber: z.number().int().min(1).max(20).optional(),
    date: z.string().optional(),
    startMonth: monthIso.optional(),
    period: z.number().int().min(1).max(12).optional(),
    durationMonths: z.number().int().min(1).max(12).optional(),
    total: z.number().optional(),
  })
  .strict()
  .transform((body, ctx): CreateBookingInput => {
    const seatNumber = body.seatNumber ?? body.seatIndex;
    if (seatNumber === undefined) {
      ctx.addIssue({ code: "custom", message: "seatIndex is required" });
      return z.NEVER;
    }
    const rawMonth = body.startMonth ?? body.date;
    const startMonth = rawMonth === undefined ? null : toStartMonth(rawMonth);
    if (!startMonth) {
      ctx.addIssue({
        code: "custom",
        message: 'date is required ("Jan 2026" or "2026-01")',
      });
      return z.NEVER;
    }
    const durationMonths = body.durationMonths ?? body.period;
    if (durationMonths === undefined) {
      ctx.addIssue({ code: "custom", message: "period is required" });
      return z.NEVER;
    }
    return { roomId: body.roomId, seatNumber, startMonth, durationMonths };
  });
