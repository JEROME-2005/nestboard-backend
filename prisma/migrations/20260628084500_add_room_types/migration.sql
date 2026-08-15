-- Reconstructed to match the schema already applied in the shared Neon databases
-- (dev + prod both record this migration as applied on 2026-06-28).

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_per_month" DECIMAL(10,2) NOT NULL,
    "seat_capacity" INTEGER NOT NULL,
    "has_ac" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- AlterTable: rooms become physical rooms under a room type
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_property_id_fkey";
DROP INDEX "rooms_property_id_idx";
ALTER TABLE "rooms"
    DROP COLUMN "property_id",
    DROP COLUMN "name",
    DROP COLUMN "price_per_month",
    DROP COLUMN "seat_capacity",
    DROP COLUMN "has_ac",
    ADD COLUMN "room_type_id" UUID NOT NULL,
    ADD COLUMN "room_label" TEXT NOT NULL,
    ADD COLUMN "is_available" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "room_types_property_id_idx" ON "room_types"("property_id");
CREATE INDEX "rooms_room_type_id_idx" ON "rooms"("room_type_id");

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
