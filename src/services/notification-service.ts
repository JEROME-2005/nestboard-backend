import {
  NotificationType,
} from "../generated/enums.js";

import {
  prisma as defaultPrisma,
} from "../lib/prisma.js";

import { Errors } from "../lib/errors.js";

import type {
  Prisma,
  PrismaClient,
} from "../generated/client.js";

/**
 * Prisma client type that works with both:
 *
 * 1. normal PrismaClient
 * 2. Prisma interactive transaction client
 */
type DbClient =
  | PrismaClient
  | Prisma.TransactionClient;

type CreateNotificationInput = {
  userId: string;

  type: NotificationType;

  message: string;

  bookingId?: string;

  propertyId?: string;
};

export async function createNotification(
  input: CreateNotificationInput,
  db: DbClient = defaultPrisma,
) {
  return db.notification.create({
    data: {
      userId: input.userId,

      type: input.type,

      message: input.message,

      bookingId:
        input.bookingId ?? null,

      propertyId:
        input.propertyId ?? null,
    },
  });
}

export async function listMyNotifications(
  userId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.notification.findMany({
    where: {
      userId,
    },

    orderBy: {
      createdAt: "desc",
    },

    include: {
      booking: {
        select: {
          id: true,

          bookingStatus: true,

          paymentStatus: true,

          leaseStart: true,

          leaseEnd: true,
        },
      },

      property: {
        select: {
          id: true,

          title: true,

          imageUrl: true,
        },
      },
    },
  });
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
  db: PrismaClient = defaultPrisma,
) {
  const notification =
    await db.notification.findFirst({
      where: {
        id: notificationId,

        userId,
      },
    });

  if (!notification) {
    throw Errors.notFound(
      "Notification",
    );
  }

  return db.notification.update({
    where: {
      id: notificationId,
    },

    data: {
      isRead: true,
    },
  });
}

export async function markAllNotificationsRead(
  userId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.notification.updateMany({
    where: {
      userId,

      isRead: false,
    },

    data: {
      isRead: true,
    },
  });
}