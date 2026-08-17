import {
  BookingStatus,
} from "../generated/enums.js"

import type {
  Prisma,
} from "../generated/client.js"

/*
 * NestBoard pending booking/payment hold:
 * exactly 1 minute.
 */
export const BOOKING_HOLD_MS =
  60 * 1000

/*
 * Backward-compatible name used by
 * booking-service.ts.
 */
export const TEN_MIN_MS =
  BOOKING_HOLD_MS

export function leaseRange(
  startMonth: string,
  durationMonths: number,
) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(
      startMonth
    )
  ) {
    throw new Error(
      "Invalid startMonth format, expected YYYY-MM"
    )
  }

  if (
    !Number.isInteger(
      durationMonths
    ) ||
    durationMonths < 1
  ) {
    throw new Error(
      "durationMonths must be a positive integer"
    )
  }

  const [
    yearString,
    monthString,
  ] =
    startMonth.split("-")

  const year =
    Number(yearString)

  const month =
    Number(monthString)

  const start =
    new Date(
      Date.UTC(
        year,
        month - 1,
        1
      )
    )

  const endExclusive =
    new Date(
      Date.UTC(
        year,
        month - 1 +
          durationMonths,
        1
      )
    )

  const end =
    new Date(
      endExclusive.getTime() -
        24 *
          60 *
          60 *
          1000
    )

  return {
    start,
    end,
  }
}

/*
 * A booking blocks a seat when:
 *
 * 1. CONFIRMED
 * OR
 * 2. PENDING and inside the
 *    1-minute payment window.
 */
export function blockingStatusWhere(
  now: Date = new Date()
): Prisma.BookingWhereInput {
  const pendingCutoff =
    new Date(
      now.getTime() -
        BOOKING_HOLD_MS
    )

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
  }
}

export function activeBookingWhere(
  start: Date,
  end: Date,
  now: Date = new Date()
): Prisma.BookingWhereInput {
  return {
    leaseStart: {
      lte: end,
    },

    leaseEnd: {
      gte: start,
    },

    ...blockingStatusWhere(
      now
    ),
  }
}