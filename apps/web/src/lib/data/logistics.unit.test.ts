/**
 * Run: npx tsx src/lib/data/logistics.unit.test.ts
 * (from apps/web)
 */

import {
  dayOrdinal,
  formatCollectionDateHero,
  isEarlyCollectionSlot,
  parseTimeToMinutes,
} from "./logistics"

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(dayOrdinal(1) === "1st", "1st")
assert(dayOrdinal(2) === "2nd", "2nd")
assert(dayOrdinal(3) === "3rd", "3rd")
assert(dayOrdinal(4) === "4th", "4th")
assert(dayOrdinal(11) === "11th", "11th")
assert(dayOrdinal(12) === "12th", "12th")
assert(dayOrdinal(13) === "13th", "13th")
assert(dayOrdinal(21) === "21st", "21st")
assert(dayOrdinal(22) === "22nd", "22nd")

const hero = formatCollectionDateHero("2026-08-02")
assert(hero != null, "hero parses")
assert(hero!.dayOrdinal === "2nd", "2nd August")
assert(hero!.weekday === "Sunday", "Sunday 2 Aug 2026")
assert(hero!.month === "August", "August")
assert(hero!.full.includes("2nd"), "full has ordinal")
assert(hero!.short.includes("2nd"), "short has ordinal")

assert(formatCollectionDateHero("not-a-date") === null, "invalid date")
assert(parseTimeToMinutes("09:30") === 9 * 60 + 30, "parse 09:30")
assert(isEarlyCollectionSlot("09:00") === true, "9am early")
assert(isEarlyCollectionSlot("10:00") === true, "10am is morning slot")
assert(isEarlyCollectionSlot("10:30") === true, "10:30 is morning slot")
assert(isEarlyCollectionSlot("11:00") === false, "11am not early")
assert(isEarlyCollectionSlot("12:00") === false, "noon not early")
assert(isEarlyCollectionSlot("09:00 – 09:30") === true, "range label early")
assert(isEarlyCollectionSlot("10:00 – 10:30") === true, "range 10-10:30 early")

console.log("logistics.unit.test.ts: all passed")
