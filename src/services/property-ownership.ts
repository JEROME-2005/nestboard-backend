import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";

export async function requireOwnedProperty(
  propertyId: string,
  vendorId: string,
) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      vendorId,
    },
  });

  if (!property) {
    throw Errors.notFound("Property");
  }

  return property;
}

export async function requireOwnedRoomType(
  propertyId: string,
  roomTypeId: string,
  vendorId: string,
) {
  const roomType = await prisma.roomType.findFirst({
    where: {
      id: roomTypeId,
      propertyId,
      property: {
        vendorId,
      },
    },
  });

  if (!roomType) {
    throw Errors.notFound("Room type");
  }

  return roomType;
}

export async function requireOwnedRoom(
  propertyId: string,
  roomTypeId: string,
  roomId: string,
  vendorId: string,
) {
  const room = await prisma.room.findFirst({
    where: {
      id: roomId,
      roomTypeId,
      roomType: {
        propertyId,
        property: {
          vendorId,
        },
      },
    },
  });

  if (!room) {
    throw Errors.notFound("Room");
  }

  return room;
}