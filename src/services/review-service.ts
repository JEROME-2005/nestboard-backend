import { prisma as defaultPrisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import type { PrismaClient } from "../generated/client.js";
import type { CreateReviewInput } from "../schemas/review.js";

export async function createReview(
  userId: string,
  propertyId: string,
  input: CreateReviewInput,
  db: PrismaClient = defaultPrisma,
) {
  const booking = await db.booking.findFirst({
    where: {
      id: input.bookingId,
      tenantId: userId,
      bookingStatus: "CONFIRMED",

      room: {
        roomType: {
          propertyId,
        },
      },
    },
    include: {
      room: {
        include: {
          roomType: true,
        },
      },
    },
  });

  if (!booking) {
    throw Errors.forbidden(
      "You are not eligible to review this property",
    );
  }

  if (booking.leaseEnd > new Date()) {
    throw Errors.forbidden(
      "You can review the property after your stay has ended",
    );
  }

  const existing = await db.review.findUnique({
    where: {
      userId_propertyId: {
        userId,
        propertyId,
      },
    },
  });

  if (existing) {
    throw Errors.conflict(
      "You have already reviewed this property",
    );
  }

  const review = await db.review.create({
    data: {
      userId,
      propertyId,
      bookingId: input.bookingId,
      rating: input.rating,
      comment: input.comment ?? null,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  await updatePropertyRating(propertyId, db);

  return review;
}

export async function listPropertyReviews(
  propertyId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.review.findMany({
    where: {
      propertyId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });
}

export async function getMyPropertyReview(
  userId: string,
  propertyId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.review.findUnique({
    where: {
      userId_propertyId: {
        userId,
        propertyId,
      },
    },
    include: {
      booking: {
        select: {
          id: true,
          leaseStart: true,
          leaseEnd: true,
        },
      },
    },
  });
}

export async function canReviewProperty(
  userId: string,
  propertyId: string,
  db: PrismaClient = defaultPrisma,
) {
  const existingReview =
    await getMyPropertyReview(
      userId,
      propertyId,
      db,
    );

  if (existingReview) {
    return {
      eligible: false,
      reason: "ALREADY_REVIEWED",
    };
  }

  const qualifyingBooking =
    await db.booking.findFirst({
      where: {
        tenantId: userId,
        bookingStatus: "CONFIRMED",
        leaseEnd: {
          lte: new Date(),
        },
        room: {
          roomType: {
            propertyId,
          },
        },
      },
      select: {
        id: true,
        leaseStart: true,
        leaseEnd: true,
      },
      orderBy: {
        leaseEnd: "desc",
      },
    });

  if (!qualifyingBooking) {
    return {
      eligible: false,
      reason: "NO_QUALIFYING_BOOKING",
    };
  }

  return {
    eligible: true,
    reason: null,
    booking: qualifyingBooking,
  };
}

async function updatePropertyRating(
  propertyId: string,
  db: PrismaClient,
) {
  const aggregate =
    await db.review.aggregate({
      where: {
        propertyId,
      },
      _avg: {
        rating: true,
      },
    });

  const average =
    aggregate._avg.rating ?? 0;

  await db.property.update({
    where: {
      id: propertyId,
    },
    data: {
      rating: average,
    },
  });
}