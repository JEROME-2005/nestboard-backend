import { Prisma, type PrismaClient } from "../generated/client.js";
import {
  BookingStatus,
  PaymentStatus,
  NotificationType,
} from "../generated/enums.js";

import { prisma as defaultPrisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import type { CreateBookingInput } from "../schemas/booking.js";
import { leaseRange, TEN_MIN_MS } from "./availability.js";
import { createNotification } from "./notification-service.js";

async function createBooking(
  tenantId: string,
  input: CreateBookingInput,
  statuses: {
    bookingStatus: BookingStatus;
    paymentStatus: PaymentStatus;
  },
  db: PrismaClient,
) {
  const { start, end } = leaseRange(
    input.startMonth,
    input.durationMonths,
  );

  return db.$transaction(
    async (tx) => {
      const room = await tx.room.findUnique({
        where: {
          id: input.roomId,
        },
        include: {
          roomType: {
            include: {
              property: true,
            },
          },
        },
      });

      if (!room) {
        throw Errors.notFound("Room");
      }

      if (
        !room.isAvailable ||
        !room.roomType.isAvailable
      ) {
        throw Errors.conflict(
          "Room is not available",
        );
      }

      if (
        input.seatNumber >
        room.roomType.seatCapacity
      ) {
        throw Errors.validation(
          `Seat ${input.seatNumber} exceeds capacity ${room.roomType.seatCapacity}`,
        );
      }

      const conflict =
        await tx.booking.findFirst({
          where: {
            roomId: input.roomId,
            seatNumber: input.seatNumber,

            bookingStatus: {
              in: [
                BookingStatus.CONFIRMED,
                BookingStatus.PENDING,
              ],
            },

            leaseStart: {
              lt: end,
            },

            leaseEnd: {
              gt: start,
            },
          },

          include: {
            room: {
              include: {
                roomType: {
                  include: {
                    property: true,
                  },
                },
              },
            },
          },
        });

      if (conflict) {
        const isStale =
          conflict.bookingStatus ===
            BookingStatus.PENDING &&
          Date.now() -
            conflict.createdAt.getTime() >
            TEN_MIN_MS;

        if (isStale) {
          await tx.booking.update({
            where: {
              id: conflict.id,
            },

            data: {
              bookingStatus:
                BookingStatus.EXPIRED,

              paymentStatus:
                PaymentStatus.FAILED,
            },
          });

          await createNotification(
            {
              userId:
                conflict.tenantId,

              type:
                NotificationType.BOOKING_EXPIRED,

              message:
                `Your booking at ${conflict.room.roomType.property.title} expired because the payment window ended.`,

              bookingId:
                conflict.id,

              propertyId:
                conflict.room.roomType.property.id,
            },
            tx,
          );
        } else {
          throw Errors.conflict(
            "Seat unavailable for this period",
          );
        }
      }

      const totalAmount =
        room.roomType.pricePerMonth.mul(
          input.durationMonths,
        );

      return tx.booking.create({
        data: {
          tenantId,

          roomId:
            input.roomId,

          seatNumber:
            input.seatNumber,

          leaseStart:
            start,

          leaseEnd:
            end,

          durationMonths:
            input.durationMonths,

          totalAmount,

          paymentStatus:
            statuses.paymentStatus,

          bookingStatus:
            statuses.bookingStatus,
        },
      });
    },

    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function createBookingPending(
  tenantId: string,
  input: CreateBookingInput,
  db: PrismaClient = defaultPrisma,
) {
  return createBooking(
    tenantId,
    input,

    {
      bookingStatus:
        BookingStatus.PENDING,

      paymentStatus:
        PaymentStatus.PENDING,
    },

    db,
  );
}

// Books and confirms in a single transaction.
export async function createBookingConfirmed(
  tenantId: string,
  input: CreateBookingInput,
  db: PrismaClient = defaultPrisma,
) {
  const booking = await createBooking(
    tenantId,
    input,

    {
      bookingStatus:
        BookingStatus.CONFIRMED,

      paymentStatus:
        PaymentStatus.PAID,
    },

    db,
  );

  /*
   * This endpoint creates a confirmed booking
   * immediately, so create the notification
   * after the booking transaction succeeds.
   */
  await createNotification(
    {
      userId: tenantId,

      type:
        NotificationType.BOOKING_CONFIRMED,

      message:
        "Your booking has been confirmed.",

      bookingId:
        booking.id,

      propertyId:
        await getBookingPropertyId(
          booking.id,
          db,
        ),
    },
    db,
  );

  return booking;
}

export async function confirmBooking(
  bookingId: string,
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.$transaction(
    async (tx) => {
      const booking =
        await tx.booking.findUnique({
          where: {
            id: bookingId,
          },

          include: {
            room: {
              include: {
                roomType: {
                  include: {
                    property: true,
                  },
                },
              },
            },
          },
        });

      if (!booking) {
        throw Errors.notFound("Booking");
      }

      if (
        booking.tenantId !== tenantId
      ) {
        throw Errors.forbidden();
      }

      if (
        booking.bookingStatus !==
        BookingStatus.PENDING
      ) {
        throw Errors.conflict(
          `Booking is already ${booking.bookingStatus}`,
        );
      }

      /*
       * Payment window expired.
       */
      if (
        Date.now() -
          booking.createdAt.getTime() >
        TEN_MIN_MS
      ) {
        await tx.booking.update({
          where: {
            id: booking.id,
          },

          data: {
            bookingStatus:
              BookingStatus.EXPIRED,

            paymentStatus:
              PaymentStatus.FAILED,
          },
        });

        await createNotification(
          {
            userId:
              booking.tenantId,

            type:
              NotificationType.BOOKING_EXPIRED,

            message:
              `Your booking at ${booking.room.roomType.property.title} expired because the payment window ended.`,

            bookingId:
              booking.id,

            propertyId:
              booking.room.roomType.property.id,
          },
          tx,
        );

        throw Errors.conflict(
          "Booking expired before payment",
        );
      }

      /*
       * Confirm the booking.
       */
      const confirmed =
        await tx.booking.update({
          where: {
            id: bookingId,
          },

          data: {
            paymentStatus:
              PaymentStatus.PAID,

            bookingStatus:
              BookingStatus.CONFIRMED,
          },
        });

      /*
       * Create the notification inside
       * the same transaction.
       */
      await createNotification(
        {
          userId:
            confirmed.tenantId,

          type:
            NotificationType.BOOKING_CONFIRMED,

          message:
            `Your booking at ${booking.room.roomType.property.title} has been confirmed.`,

          bookingId:
            confirmed.id,

          propertyId:
            booking.room.roomType.property.id,
        },
        tx,
      );

      return confirmed;
    },

    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function cancelBooking(
  bookingId: string,
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.$transaction(
    async (tx) => {
      const booking =
        await tx.booking.findUnique({
          where: {
            id: bookingId,
          },

          include: {
            room: {
              include: {
                roomType: {
                  include: {
                    property: true,
                  },
                },
              },
            },
          },
        });

      if (!booking) {
        throw Errors.notFound("Booking");
      }

      /*
       * Users can only cancel their own bookings.
       */
      if (
        booking.tenantId !== tenantId
      ) {
        throw Errors.forbidden();
      }

      /*
       * Only active bookings can be cancelled.
       */
      if (
        booking.bookingStatus !==
          BookingStatus.PENDING &&
        booking.bookingStatus !==
          BookingStatus.CONFIRMED
      ) {
        throw Errors.conflict(
          `Booking is already ${booking.bookingStatus}`,
        );
      }

      const cancelled =
        await tx.booking.update({
          where: {
            id: bookingId,
          },

          data: {
            bookingStatus:
              BookingStatus.CANCELLED,
          },
        });

      /*
       * Notify the tenant.
       *
       * We deliberately do not change paymentStatus
       * here because this MVP does not have a real
       * payment gateway.
       */
      await createNotification(
        {
          userId:
            booking.tenantId,

          type:
            NotificationType.BOOKING_CANCELLED,

          message:
            `Your booking at ${booking.room.roomType.property.title} has been cancelled.`,

          bookingId:
            booking.id,

          propertyId:
            booking.room.roomType.property.id,
        },
        tx,
      );

      return cancelled;
    },

    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function listMyBookings(
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.booking.findMany({
    where: {
      tenantId,
    },

    orderBy: {
      createdAt: "desc",
    },

    include: {
      room: {
        include: {
          roomType: {
            include: {
              property: true,
            },
          },
        },
      },
    },
  });
}

export async function listAdminBookings(
  vendorId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.booking.findMany({
    where: {
      room: {
        roomType: {
          property: {
            vendorId,
          },
        },
      },
    },

    orderBy: {
      createdAt: "desc",
    },

    include: {
      tenant: {
        select: {
          id: true,
          displayName: true,
          email: true,
          avatarUrl: true,
        },
      },

      room: {
        include: {
          roomType: {
            include: {
              property: {
                select: {
                  id: true,
                  title: true,
                  city: true,
                  address: true,
                  imageUrl: true,
                  vendorId: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Used by createBookingConfirmed().
 *
 * The booking returned by createBooking()
 * does not include the room/property relation,
 * so we fetch the property ID before creating
 * the notification.
 */
async function getBookingPropertyId(
  bookingId: string,
  db: PrismaClient,
) {
  const booking =
    await db.booking.findUnique({
      where: {
        id: bookingId,
      },

      select: {
        room: {
          select: {
            roomType: {
              select: {
                propertyId: true,
              },
            },
          },
        },
      },
    });

  if (!booking) {
    throw Errors.notFound("Booking");
  }

  return booking.room.roomType.propertyId;
}