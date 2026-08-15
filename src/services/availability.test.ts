import test from "node:test";
import assert from "node:assert/strict";

import {
  activeBookingWhere,
  blockingStatusWhere,
  leaseRange,
  TEN_MIN_MS,
} from "./availability.js";

import {
  BookingStatus,
} from "../generated/enums.js";

test("leaseRange calculates a 3 month lease correctly", () => {
  const result = leaseRange(
    "2026-01",
    3,
  );

  assert.equal(
    result.start.toISOString(),
    "2026-01-01T00:00:00.000Z",
  );

  assert.equal(
    result.end.toISOString(),
    "2026-03-31T00:00:00.000Z",
  );
});

test("leaseRange calculates a 6 month lease correctly", () => {
  const result = leaseRange(
    "2026-09",
    6,
  );

  assert.equal(
    result.start.toISOString(),
    "2026-09-01T00:00:00.000Z",
  );

  assert.equal(
    result.end.toISOString(),
    "2027-02-28T00:00:00.000Z",
  );
});

test("leaseRange rejects invalid month", () => {
  assert.throws(() => {
    leaseRange(
      "2026-13",
      3,
    );
  });
});

test("leaseRange rejects zero duration", () => {
  assert.throws(() => {
    leaseRange(
      "2026-01",
      0,
    );
  });
});

test("confirmed bookings always block seats", () => {
  const now = new Date(
    "2026-08-15T12:00:00.000Z",
  );

  const result =
    blockingStatusWhere(now);

  assert.ok(result.OR);

  assert.deepEqual(
    result.OR?.[0],
    {
      bookingStatus:
        BookingStatus.CONFIRMED,
    },
  );
});

test("fresh pending booking blocks a seat", () => {
  const now = new Date(
    "2026-08-15T12:00:00.000Z",
  );

  const result = blockingStatusWhere(now);

  const pending = result.OR?.[1];

  assert.ok(pending);

  assert.equal(
    pending.bookingStatus,
    BookingStatus.PENDING,
  );

  assert.ok(pending.createdAt);

  if (
    typeof pending.createdAt === "object" &&
    "gt" in pending.createdAt
  ) {
    assert.deepEqual(
      pending.createdAt.gt,
      new Date(
        now.getTime() - TEN_MIN_MS,
      ),
    );
  } else {
    assert.fail(
      "Expected createdAt to contain a gt filter",
    );
  }
});

test("activeBookingWhere contains lease overlap conditions", () => {
  const start = new Date(
    "2026-09-01T00:00:00.000Z",
  );

  const end = new Date(
    "2026-11-30T00:00:00.000Z",
  );

  const result =
    activeBookingWhere(
      start,
      end,
    );

  assert.deepEqual(
    result.leaseStart,
    {
      lte: end,
    },
  );

  assert.deepEqual(
    result.leaseEnd,
    {
      gte: start,
    },
  );

  assert.ok(result.OR);
});