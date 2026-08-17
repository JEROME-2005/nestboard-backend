import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  toMapListDTO,
  toPropertyDetailDTO,
  toPropertyDTO,
  toRoomTypeDTO,
} from "../lib/dto.js";
import { validateBody } from "../middleware/validate.js";
import {
  createPropertySchema,
  updatePropertySchema,
} from "../schemas/property.js";
import { Errors } from "../lib/errors.js";
import {
  optionalAuth,
  requireRole,
  verifyJwt,
} from "../middleware/auth.js";
import { Role } from "../generated/enums.js";
import type {
  Prisma,
  PropertyType,
} from "../generated/client.js";
import {
  activeBookingWhere,
  leaseRange,
} from "../services/availability.js";
import {
  createRoomSchema,
  createRoomTypeSchema,
  updateRoomSchema,
  updateRoomTypeSchema,
} from "../schemas/room.js";
import {
  requireOwnedProperty,
  requireOwnedRoom,
  requireOwnedRoomType,
} from "../services/property-ownership.js";
import {
  availabilityQuerySchema,
} from "../schemas/availability.js";

export const propertiesRouter: Router = Router();

/* ============================================================
   HELPERS
============================================================ */

function parsePositiveInt(
  value: unknown,
  fallback: number,
): number {
  if (typeof value !== "string") return fallback;

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function getPagination(query: Record<string, unknown>) {
  const page = parsePositiveInt(query.page, 1);
  const rawLimit = parsePositiveInt(query.limit, 10);
  const limit = Math.min(rawLimit, 50);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    take: limit,
  };
}

/* ============================================================
   AVAILABILITY WINDOW
============================================================ */

// Defaults to current time.
// Pass ?startMonth=YYYY-MM&durationMonths=N
// to check availability for a lease window.
function availabilityWindow(
  query: Record<string, unknown>,
) {
  const parsed =
    availabilityQuerySchema.parse(query);

  if (!parsed.startMonth) {
    const now = new Date();

    return {
      start: now,
      end: now,
    };
  }

  const duration =
    parsed.durationMonths ?? 1;

  return leaseRange(
    parsed.startMonth,
    duration,
  );
}

async function bookedSeatsByRoom(
  roomIds: string[],
  window: {
    start: Date;
    end: Date;
  },
): Promise<Map<string, number>> {
  if (roomIds.length === 0) {
    return new Map();
  }

  const grouped = await prisma.booking.groupBy({
    by: ["roomId"],

    where: {
      roomId: {
        in: roomIds,
      },

      ...activeBookingWhere(
        window.start,
        window.end,
      ),
    },

    _count: {
      _all: true,
    },
  });

  return new Map(
    grouped.map((group) => [
      group.roomId,
      group._count._all,
    ]),
  );
}

async function favoritePropertyIds(
  userId: string | undefined,
  propertyIds: string[],
): Promise<Set<string>> {
  if (!userId || propertyIds.length === 0) {
    return new Set();
  }

  const favorites = await prisma.favorite.findMany({
    where: {
      userId,
      propertyId: {
        in: propertyIds,
      },
    },

    select: {
      propertyId: true,
    },
  });

  return new Set(
    favorites.map(
      (favorite) => favorite.propertyId,
    ),
  );
}

/* ============================================================
   PROPERTY FILTERS
============================================================ */

const PROPERTY_TYPES = [
  "HOUSE",
  "VILLA",
  "APARTMENT",
  "HOTEL",
] as const;

function parseDecimal(
  value: unknown,
): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : undefined;
}

// Supported query params:
//
// ?search=
// ?type=
// ?city=
// ?minPrice=
// ?maxPrice=
// ?minRating=

function propertyFilters(
  query: Record<string, unknown>,
): Prisma.PropertyWhereInput {
  const where: Prisma.PropertyWhereInput = {
    isActive: true,
  };

  /* ----------------------------------------------------------
     SEARCH
  ---------------------------------------------------------- */

  if (
    typeof query.search === "string" &&
    query.search.trim()
  ) {
    const search = query.search.trim();

    where.OR = [
      {
        title: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        address: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        city: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  /* ----------------------------------------------------------
     PROPERTY TYPE
  ---------------------------------------------------------- */

  if (typeof query.type === "string") {
    const type = query.type.toUpperCase();

    if (
      (PROPERTY_TYPES as readonly string[]).includes(
        type,
      )
    ) {
      where.type = type as PropertyType;
    }
  }

  /* ----------------------------------------------------------
     CITY
  ---------------------------------------------------------- */

  const rawCity = Array.isArray(query.city)
    ? query.city.join(",")
    : query.city;

  if (
    typeof rawCity === "string" &&
    rawCity.trim()
  ) {
    const cities = rawCity
      .split(",")
      .map((city) => city.trim())
      .filter(Boolean);

    if (cities.length === 1) {
      where.city = {
        equals: cities[0]!,
        mode: "insensitive",
      };
    } else if (cities.length > 1) {
      where.AND = [
        {
          OR: cities.map((city) => ({
            city: {
              equals: city,
              mode: "insensitive" as const,
            },
          })),
        },
      ];
    }
  }

  /* ----------------------------------------------------------
     PRICE RANGE
  ---------------------------------------------------------- */

  const minPrice = parseDecimal(
    query.minPrice,
  );

  const maxPrice = parseDecimal(
    query.maxPrice,
  );

  if (
    minPrice !== undefined ||
    maxPrice !== undefined
  ) {
    const priceClause: Prisma.PropertyWhereInput = {
      OR: [
        {
          roomTypes: {
            some: {
              pricePerMonth: {
                ...(minPrice !== undefined
                  ? {
                      gte: minPrice,
                    }
                  : {}),

                ...(maxPrice !== undefined
                  ? {
                      lte: maxPrice,
                    }
                  : {}),
              },
            },
          },
        },

        {
          roomTypes: {
            none: {},
          },
        },
      ],
    };

    where.AND = [
      ...(Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : []),

      priceClause,
    ];
  }

  /* ----------------------------------------------------------
     MINIMUM RATING
  ---------------------------------------------------------- */

  const minRating = parseDecimal(
    query.minRating,
  );

  if (minRating !== undefined) {
    where.rating = {
      gte: minRating,
    };
  }

  return where;
}

type PropertySort = "recency" | "price_asc" | "price_desc" | "rating_desc"

function propertyOrderBy(
  query: Record<string, unknown>,
): Prisma.PropertyOrderByWithRelationInput[] {
  const sort =
    typeof query.sort === "string"
      ? query.sort
      : "recency"

  switch (sort as PropertySort) {
    case "price_asc":
      return [
        {
          roomTypes: {
            _count: "asc",
          },
        },
        {
          createdAt: "desc",
        },
      ]

    case "price_desc":
      return [
        {
          roomTypes: {
            _count: "desc",
          },
        },
        {
          createdAt: "desc",
        },
      ]

    case "rating_desc":
      return [
        {
          rating: "desc",
        },
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ]

    case "recency":
    default:
      return [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ]
  }
}

/* ============================================================
   PUBLIC PROPERTY LIST
============================================================ */

propertiesRouter.get(
  "/",
  optionalAuth,
  async (req, res, next) => {
    try {
      const {
        page,
        limit,
        skip,
        take,
      } = getPagination(req.query);

      const where = propertyFilters(
        req.query,
      );

      const [
        total,
        properties,
      ] = await prisma.$transaction([
        prisma.property.count({
          where,
        }),

        prisma.property.findMany({
          where,

          orderBy: [
            {
              createdAt: "desc",
            },
            {
              id: "desc",
            },
          ],

          skip,
          take,

          include: {
            roomTypes: true,
          },
        }),
      ]);

      const favorites =
        await favoritePropertyIds(
          req.user?.id,
          properties.map(
            (property) => property.id,
          ),
        );

      const totalPages = Math.ceil(
        total / limit,
      );

      res.json({
        data: properties.map(
          (property) =>
            toPropertyDTO(
              property,
              favorites.has(property.id),
            ),
        ),

        meta: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage:
            page < totalPages,
          hasPreviousPage:
            page > 1,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ADMIN OWN PROPERTIES
============================================================ */

propertiesRouter.get(
  "/mine",
  verifyJwt,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id

      if (!vendorId) {
        throw Errors.unauthenticated()
      }

      const properties =
        await prisma.property.findMany({
          where: {
            vendorId,
          },

          orderBy: {
            createdAt: "desc",
          },

          include: {
            roomTypes: {
              include: {
                rooms: true,
              },
            },
          },
        })

      // IMPORTANT:
      // Do NOT use toPropertyDTO() here.
      //
      // AdminDashboard needs the complete property object:
      // address, city, amenities, latitude, longitude,
      // imageUrl, minStay, isActive and roomTypes.

      res.json(properties)
    } catch (err) {
      next(err)
    }
  },
)

/* ============================================================
   CITIES
============================================================ */

propertiesRouter.get(
  "/cities",
  async (_req, res, next) => {
    try {
      const cities =
        await prisma.property.findMany({
          where: {
            isActive: true,
          },

          select: {
            city: true,
          },

          distinct: [
            "city",
          ],

          orderBy: {
            city: "asc",
          },
        });

      res.json(
        cities.map(
          (city) => city.city,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   MAP HELPERS
============================================================ */

function parseCoord(
  value: unknown,
): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed =
    Number.parseFloat(value);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const dLat =
    toRad(lat2 - lat1);

  const dLng =
    toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return (
    6371 *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    )
  );
}

/* ============================================================
   MAP LIST
============================================================ */

propertiesRouter.get(
  "/map-list",
  async (req, res, next) => {
    try {
      const where: Prisma.PropertyWhereInput =
        {
          isActive: true,
        };

      const minLat = parseCoord(
        req.query.minLat,
      );

      const maxLat = parseCoord(
        req.query.maxLat,
      );

      const minLng = parseCoord(
        req.query.minLng,
      );

      const maxLng = parseCoord(
        req.query.maxLng,
      );

      if (
        minLat !== undefined &&
        maxLat !== undefined
      ) {
        where.latitude = {
          gte: minLat,
          lte: maxLat,
        };
      }

      if (
        minLng !== undefined &&
        maxLng !== undefined
      ) {
        where.longitude = {
          gte: minLng,
          lte: maxLng,
        };
      }

      const properties =
        await prisma.property.findMany({
          where,

          orderBy: [
            {
              createdAt: "desc",
            },
            {
              id: "desc",
            },
          ],

          include: {
            roomTypes: true,
          },
        });

      const lat = parseCoord(
        req.query.lat,
      );

      const lng = parseCoord(
        req.query.lng,
      );

      const radiusKm = parseCoord(
        req.query.radiusKm,
      );

      if (
        lat !== undefined &&
        lng !== undefined &&
        radiusKm !== undefined
      ) {
        const nearby = properties
          .map((property) => ({
            property,

            distanceKm: haversineKm(
              lat,
              lng,
              property.latitude,
              property.longitude,
            ),
          }))
          .filter(
            (entry) =>
              entry.distanceKm <=
              radiusKm,
          )
          .sort(
            (a, b) =>
              a.distanceKm -
              b.distanceKm,
          );

        res.json(
          nearby.map((entry) => ({
            ...toMapListDTO(
              entry.property,
            ),

            distanceKm:
              Math.round(
                entry.distanceKm * 10,
              ) / 10,
          })),
        );

        return;
      }

      res.json(
        properties.map(
          toMapListDTO,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   FAVORITES
============================================================ */

propertiesRouter.get(
  [
    "/my-favourites",
    "/my-favorites",
  ],
  verifyJwt,
  requireRole(Role.USER),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw Errors.unauthenticated();
      }

      const favorites =
        await prisma.favorite.findMany({
          where: {
            userId,
          },

          orderBy: {
            createdAt: "desc",
          },

          include: {
            property: {
              include: {
                roomTypes: true,
              },
            },
          },
        });

      res.json(
        favorites
          .filter(
            (favorite) =>
              favorite.property.isActive,
          )
          .map((favorite) =>
            toPropertyDTO(
              favorite.property,
              true,
            ),
          ),
      );
    } catch (err) {
      next(err);
    }
  },
);

propertiesRouter.patch(
  "/:id/toggle-favorite",
  verifyJwt,
  requireRole(Role.USER),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw Errors.unauthenticated();
      }

      const requestedPropertyId =
        String(req.params.id);

      const property =
        await prisma.property.findFirst({
          where: {
            id: requestedPropertyId,
            isActive: true,
          },

          select: {
            id: true,
          },
        });

      if (!property) {
        throw Errors.notFound(
          "Property",
        );
      }

      const propertyId =
        property.id;

      const key = {
        userId_propertyId: {
          userId,
          propertyId,
        },
      };

      const existing =
        await prisma.favorite.findUnique({
          where: key,
        });

      if (existing) {
        await prisma.favorite.delete({
          where: key,
        });

        res.json({
          propertyId,
          isFavorite: false,
        });

        return;
      }

      await prisma.favorite.create({
        data: {
          userId,
          propertyId,
        },
      });

      res.json({
        propertyId,
        isFavorite: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   PUBLIC PROPERTY DETAIL
============================================================ */

propertiesRouter.get(
  "/:id",
  optionalAuth,
  async (req, res, next) => {
    try {
      const property =
        await prisma.property.findUnique({
          where: {
            id: String(req.params.id),
          },

          include: {
            roomTypes: {
              include: {
                rooms: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        });

      if (
  !property ||
  !property.isActive
) {
  throw Errors.notFound(
    "Property",
  );
}

      const roomIds =
        property.roomTypes.flatMap(
          (roomType) =>
            roomType.rooms.map(
              (room) => room.id,
            ),
        );

      const window =
        availabilityWindow(
          req.query,
        );

      const booked =
        await bookedSeatsByRoom(
          roomIds,
          window,
        );

      const totalSeats =
        property.roomTypes.reduce(
          (sum, roomType) =>
            sum +
            roomType.seatCapacity *
              roomType.rooms.length,
          0,
        );

      const bookedSeats = [
        ...booked.values(),
      ].reduce(
        (a, b) => a + b,
        0,
      );

      const favorites =
        await favoritePropertyIds(
          req.user?.id,
          [property.id],
        );

      res.json(
        toPropertyDetailDTO(
          property,
          Math.max(
            totalSeats - bookedSeats,
            0,
          ),
          favorites.has(property.id),
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ADMIN PROPERTY CREATE
============================================================ */

propertiesRouter.post(
  "/",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(
    createPropertySchema,
  ),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;

      if (!vendorId) {
        throw Errors.unauthenticated();
      }

      const property =
        await prisma.property.create({
          data: {
            ...req.body,
            vendorId,
          },
        });

      res
        .status(201)
        .location(
          `${req.baseUrl}/${property.id}`,
        )
        .json(property);
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ADMIN PROPERTY UPDATE
============================================================ */

propertiesRouter.patch(
  "/:id",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(
    updatePropertySchema,
  ),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;

      if (!vendorId) {
        throw Errors.unauthenticated();
      }

      const propertyId =
        String(req.params.id);

      await requireOwnedProperty(
        propertyId,
        vendorId,
      );

      const property =
        await prisma.property.update({
          where: {
            id: propertyId,
          },

          data: req.body,
        });

      res.json(property);
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ADMIN PROPERTY DELETE
============================================================ */

propertiesRouter.delete(
  "/:id",
  verifyJwt,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;

      if (!vendorId) {
        throw Errors.unauthenticated();
      }

      const propertyId =
        String(req.params.id);

      await requireOwnedProperty(
        propertyId,
        vendorId,
      );

      await prisma.property.delete({
        where: {
          id: propertyId,
        },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ROOM TYPE CREATE
============================================================ */

propertiesRouter.post(
  "/:id/room-types",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(
    createRoomTypeSchema,
  ),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;

      if (!vendorId) {
        throw Errors.unauthenticated();
      }

      const propertyId =
        String(req.params.id);

      await requireOwnedProperty(
        propertyId,
        vendorId,
      );

      const roomType =
        await prisma.roomType.create({
          data: {
            ...req.body,
            propertyId,
          },
        });

      res
        .status(201)
        .location(
          `${req.baseUrl}/${propertyId}/room-types/${roomType.id}`,
        )
        .json(roomType);
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ROOM TYPE UPDATE
============================================================ */

propertiesRouter.patch(
  "/:id/room-types/:roomTypeId",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(
    updateRoomTypeSchema,
  ),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;

      if (!vendorId) {
        throw Errors.unauthenticated();
      }

      const propertyId =
        String(req.params.id);

      const roomTypeId =
        String(req.params.roomTypeId);

      await requireOwnedRoomType(
        propertyId,
        roomTypeId,
        vendorId,
      );

      const roomType =
        await prisma.roomType.update({
          where: {
            id: roomTypeId,
          },

          data: req.body,
        });

      res.json(roomType);
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ROOM TYPE DELETE
============================================================ */

propertiesRouter.delete(
  "/:id/room-types/:roomTypeId",
  verifyJwt,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;

      if (!vendorId) {
        throw Errors.unauthenticated();
      }

      const propertyId =
        String(req.params.id);

      const roomTypeId =
        String(req.params.roomTypeId);

      await requireOwnedRoomType(
        propertyId,
        roomTypeId,
        vendorId,
      );

      const bookingCount =
        await prisma.booking.count({
          where: {
            room: {
              roomTypeId,
            },
          },
        });

      if (bookingCount > 0) {
        throw Errors.conflict(
          "Cannot delete a room type that has booking history",
        );
      }

      await prisma.roomType.delete({
        where: {
          id: roomTypeId,
        },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ROOM TYPE LIST
============================================================ */

propertiesRouter.get(
  "/:id/room-types",
  async (req, res, next) => {
    try {
      const property =
        await prisma.property.findUnique({
          where: {
            id: String(req.params.id),
          },

          include: {
            roomTypes: {
              orderBy: [
                {
                  createdAt: "asc",
                },
                {
                  id: "asc",
                },
              ],

              include: {
                rooms: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        });

      if (!property) {
        throw Errors.notFound(
          "Property",
        );
      }

      const roomIds =
        property.roomTypes.flatMap(
          (roomType) =>
            roomType.rooms.map(
              (room) => room.id,
            ),
        );

      const window =
        availabilityWindow(
          req.query,
        );

      const booked =
        await bookedSeatsByRoom(
          roomIds,
          window,
        );

      res.json(
        property.roomTypes.map(
          (roomType) => {
            const bookedSeats =
              roomType.rooms.reduce(
                (sum, room) =>
                  sum +
                  (booked.get(room.id) ??
                    0),
                0,
              );

            return toRoomTypeDTO(
              roomType,
              roomType.rooms.length,
              bookedSeats,
            );
          },
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ROOM TYPE DETAIL
============================================================ */

propertiesRouter.get(
  "/:id/room-types/:roomTypeId",
  async (req, res, next) => {
    try {
      const window =
        availabilityWindow(
          req.query,
        );

      const roomType =
        await prisma.roomType.findFirst({
          where: {
            id: String(
              req.params.roomTypeId,
            ),

            propertyId: String(
              req.params.id,
            ),
          },

          include: {
            rooms: {
              orderBy: {
                roomLabel: "asc",
              },

              include: {
                bookings: {
                  where: activeBookingWhere(
                    window.start,
                    window.end,
                  ),

                  include: {
                    tenant: {
                      select: {
                        displayName: true,
                        bioTag: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

      if (!roomType) {
        throw Errors.notFound(
          "Room type",
        );
      }

      const rooms =
        roomType.rooms.map(
          (room) => {
            const tenantBySeat =
              new Map(
                room.bookings.map(
                  (booking) => [
                    booking.seatNumber,
                    booking.tenant,
                  ],
                ),
              );

            return {
              roomId: room.id,

              roomName:
                room.roomLabel,

              booking: Array.from(
                {
                  length:
                    roomType.seatCapacity,
                },
                (_, index) => {
                  const tenant =
                    tenantBySeat.get(
                      index + 1,
                    );

                  return {
                    seatIndex:
                      index + 1,

                    tenant:
                      tenant?.displayName ??
                      "",

                    tenantBio:
                      tenant?.bioTag ??
                      "",
                  };
                },
              ),
            };
          },
        );

      res.json({
        id: roomType.id,
        name: roomType.name,
        pricePerMonth:
          roomType.pricePerMonth.toString(),
        maxSeatsCount:
          roomType.seatCapacity,
        roomsCount:
          rooms.length,
        hasAC:
          roomType.hasAC,
        rooms,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ROOM CREATE
============================================================ */

propertiesRouter.post(
  "/:id/room-types/:roomTypeId/rooms",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(
    createRoomSchema,
  ),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;

      if (!vendorId) {
        throw Errors.unauthenticated();
      }

      const propertyId =
        String(req.params.id);

      const roomTypeId =
        String(req.params.roomTypeId);

      await requireOwnedRoomType(
        propertyId,
        roomTypeId,
        vendorId,
      );

      const room =
        await prisma.room.create({
          data: {
            ...req.body,
            roomTypeId,
          },
        });

      res
        .status(201)
        .location(
          `${req.baseUrl}/${propertyId}/room-types/${roomTypeId}/rooms/${room.id}`,
        )
        .json(room);
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ROOM UPDATE
============================================================ */

propertiesRouter.patch(
  "/:id/room-types/:roomTypeId/rooms/:roomId",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(
    updateRoomSchema,
  ),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;

      if (!vendorId) {
        throw Errors.unauthenticated();
      }

      const propertyId =
        String(req.params.id);

      const roomTypeId =
        String(req.params.roomTypeId);

      const roomId =
        String(req.params.roomId);

      await requireOwnedRoom(
        propertyId,
        roomTypeId,
        roomId,
        vendorId,
      );

      const room =
        await prisma.room.update({
          where: {
            id: roomId,
          },

          data: req.body,
        });

      res.json(room);
    } catch (err) {
      next(err);
    }
  },
);

/* ============================================================
   ROOM DELETE
============================================================ */

propertiesRouter.delete(
  "/:id/room-types/:roomTypeId/rooms/:roomId",
  verifyJwt,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;

      if (!vendorId) {
        throw Errors.unauthenticated();
      }

      const propertyId =
        String(req.params.id);

      const roomTypeId =
        String(req.params.roomTypeId);

      const roomId =
        String(req.params.roomId);

      await requireOwnedRoom(
        propertyId,
        roomTypeId,
        roomId,
        vendorId,
      );

      const bookingCount =
        await prisma.booking.count({
          where: {
            roomId,
          },
        });

      if (bookingCount > 0) {
        throw Errors.conflict(
          "Cannot delete a room that has booking history",
        );
      }

      await prisma.room.delete({
        where: {
          id: roomId,
        },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);