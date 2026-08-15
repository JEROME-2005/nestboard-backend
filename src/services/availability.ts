import { BookingStatus } from "../generated/enums.js";
import type { Prisma } from "../generated/client.js";

export const TEN_MIN_MS = 10 * 60 * 1000;

export function leaseRange(startMonth: string, durationMonths: number) {
  const [y, m] = startMonth.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error("Invalid startMonth format, expected YYYY-MM");
  }
  const start = new Date(Date.UTC(y, m - 1, 1));
  // end date with the extra day
  const endExclusive = new Date(Date.UTC(y, m - 1 + durationMonths, 1));
  // removing the last day
  const end = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

// A booking blocks a seat while CONFIRMED, or while PENDING and younger
// than the 10-minute payment window.
export function blockingStatusWhere(
  now: Date = new Date(),
): Prisma.BookingWhereInput {
  return {
    OR: [
      { bookingStatus: BookingStatus.CONFIRMED },
      {
        bookingStatus: BookingStatus.PENDING,
        createdAt: { gt: new Date(now.getTime() - TEN_MIN_MS) },
      },
    ],
  };
}

// Bookings whose lease overlaps [start, end] and still block their seat.
export function activeBookingWhere(
  start: Date,
  end: Date,
  now: Date = new Date(),
): Prisma.BookingWhereInput {
  return {
    leaseStart: { lte: end },
    leaseEnd: { gte: start },
    ...blockingStatusWhere(now),
  };
}
