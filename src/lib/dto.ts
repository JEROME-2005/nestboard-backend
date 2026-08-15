import type {
  Property as PrismaProperty,
  RoomType as PrismaRoomType,
} from "../generated/client.js";
import type { PropertyType } from "../generated/client.js";

export type PropertyDTO = {
  id: string;
  title: string;
  description: string;
  location: string;
  type: "House" | "Villa" | "Apartment" | "Hotel";
  price: string;
  rating: number;
  isFavorite: boolean;
  image: string;
};

const TYPE_LABEL: Record<PropertyType, PropertyDTO["type"]> = {
  HOUSE: "House",
  VILLA: "Villa",
  APARTMENT: "Apartment",
  HOTEL: "Hotel",
};

function compactKilo(n: number): string {
  if (n < 1000) return Math.round(n).toString();
  const k = n / 1000;
  return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
}

export function minMonthlyPrice(
  roomTypes: Pick<PrismaRoomType, "pricePerMonth">[],
): number | null {
  const prices = roomTypes
    .map((rt) => Number(rt.pricePerMonth.toString()))
    .filter((n) => n > 0);
  return prices.length ? Math.min(...prices) : null;
}

export function toPropertyDTO(
  p: PrismaProperty & { roomTypes?: PrismaRoomType[] },
  isFavorite = false,
): PropertyDTO {
  const minPrice = minMonthlyPrice(p.roomTypes ?? []);

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    location: `${p.address}, ${p.city}`,
    type: TYPE_LABEL[p.type],
    price: minPrice !== null ? compactKilo(minPrice) : "-",
    rating: Number(p.rating.toString()),
    isFavorite,
    image: p.imageUrl,
  };
}

export type PropertyDetailDTO = {
  id: string;
  vendorId: string;
  title: string;
  description: string;
  address: string;
  city: string;
  type: PropertyType;
  rating: string;
  isFavorite: boolean;
  amenities: string[];
  latitude: number;
  longitude: number;
  imageUrl: string;
  minStay: string;
  cost: string;
  available_seats: number;
};

export function toPropertyDetailDTO(
  p: PrismaProperty & { roomTypes: PrismaRoomType[] },
  availableSeats: number,
  isFavorite = false,
): PropertyDetailDTO {
  const minPrice = minMonthlyPrice(p.roomTypes);

  return {
    id: p.id,
    vendorId: p.vendorId,
    title: p.title,
    description: p.description,
    address: p.address,
    city: p.city,
    type: p.type,
    rating: p.rating.toString(),
    isFavorite,
    amenities: p.amenities,
    latitude: p.latitude,
    longitude: p.longitude,
    imageUrl: p.imageUrl,
    minStay: p.minStay,
    cost: minPrice !== null ? `LKR ${compactKilo(minPrice)}` : "-",
    available_seats: availableSeats,
  };
}

export type RoomTypeDTO = {
  id: string;
  name: string;
  pricePerMonth: string;
  freeSeats: number;
  // maxSeatsCount is per room; seatCapacity is the total across rooms
  maxSeatsCount: number;
  roomsCount: number;
  seatCapacity: number;
  hasAC: boolean;
};

export function toRoomTypeDTO(
  roomType: PrismaRoomType,
  roomsCount: number,
  bookedSeats: number,
): RoomTypeDTO {
  const totalSeats = roomType.seatCapacity * roomsCount;
  return {
    id: roomType.id,
    name: roomType.name,
    pricePerMonth: roomType.pricePerMonth.toString(),
    freeSeats: Math.max(totalSeats - bookedSeats, 0),
    maxSeatsCount: roomType.seatCapacity,
    roomsCount,
    seatCapacity: totalSeats,
    hasAC: roomType.hasAC,
  };
}

export type SeatDTO = {
  seatIndex: number;
  tenant: string;
};

export type RoomSeatMapDTO = {
  roomId: string;
  roomName: string;
  booking: SeatDTO[];
};

export function toMapListDTO(
  p: PrismaProperty & { roomTypes: PrismaRoomType[] },
) {
  const minPrice = minMonthlyPrice(p.roomTypes);
  return {
    id: p.id,
    name: p.title,
    lat: p.latitude,
    lng: p.longitude,
    cost: minPrice !== null ? `LKR ${compactKilo(minPrice)}` : "-",
    address: `${p.address}, ${p.city}`,
    ratings: Number(p.rating.toString()),
    image: p.imageUrl,
  };
}
