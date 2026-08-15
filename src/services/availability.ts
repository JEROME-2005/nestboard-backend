import { BookingStatus } from "../generated/enums.js";
import type { Prisma } from "../generated/client.js";

export const TEN_MIN_MS = 10 * 60 * 1000;

export function leaseRange(
  startMonth: string,
  durationMonths: number,
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) {
    throw new Error(
      "Invalid startMonth format, expected YYYY-MM",
    );
  }

  if (
    !Number.isInteger(durationMonths) ||
    durationMonths < 1
  ) {
    throw new Error(
      "durationMonths must be a positive integer",
    );
  }

  const [yearString, monthString] =
    startMonth.split("-");

  const year = Number(yearString);
  const month = Number(monthString);

  const start = new Date(
    Date.UTC(year, month - 1, 1),
  );

  const endExclusive = new Date(
    Date.UTC(
      year,
      month - 1 + durationMonths,
      1,
    ),
  );

  const end = new Date(
    endExclusive.getTime() -
      24 * 60 * 60 * 1000,
  );

  return {
    start,
    end,
  };
}

/**
 * A booking blocks a seat when:
 *
 * 1. It is CONFIRMED
 * OR
 * 2. It is PENDING and still inside
 *    the 10-minute payment window.
 */
export function blockingStatusWhere(
  now: Date = new Date(),
): Prisma.BookingWhereInput {
  const pendingCutoff = new Date(
    now.getTime() - TEN_MIN_MS,
  );

  return {
    OR: [
      {
        bookingStatus:
          BookingStatus.CONFIRMED,
      },
      {
        bookingStatus:
          BookingStatus.PENDING,
        createdAt: {
          gt: pendingCutoff,
        },
      },
    ],
  };
}

/**
 * Returns bookings that block a seat
 * for the requested lease window.
 *
 * Lease overlap:
 *
 * existing.start <= requested.end
 * AND
 * existing.end >= requested.start
 */
export function activeBookingWhere(
  start: Date,
  end: Date,
  now: Date = new Date(),
): Prisma.BookingWhereInput {
  return {
    leaseStart: {
      lte: end,
    },

    leaseEnd: {
      gte: start,
    },

    ...blockingStatusWhere(now),
  };
}