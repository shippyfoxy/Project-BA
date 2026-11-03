import { describe, expect, it } from "vitest";
import { isAnnounced, tagsOf } from "@/lib/trends/updates";

describe("announced updates", () => {
  it("reads tags without emoji or spacing differences", () => {
    expect(tagsOf("[☀️UPD 21🏖️] Anime Adventures")).toEqual(["UPD 21"]);
    expect(tagsOf("[ UPD 21 ] Anime Adventures")).toEqual(["UPD 21"]);
    expect(tagsOf("[🎃] Adopt Me!")).toEqual(["EMOJI"]);
  });

  it("counts a new tag as an announced update", () => {
    expect(isAnnounced("[UPD 20] Anime Adventures", "[UPD 21] Anime Adventures")).toBe(true);
    expect(isAnnounced("Driving Empire [RP SERVERS]", "Driving Empire [2 NEW LIMITED]")).toBe(true);
    expect(isAnnounced("Steal An Egg", "[🎃 HALLOWEEN] Steal An Egg")).toBe(true);
  });

  it("ignores countdowns, removed tags and unchanged tags", () => {
    expect(isAnnounced("[🎃] Adopt Me!", "[8H⏳] Adopt Me!")).toBe(false);
    expect(isAnnounced("NFL Universe", "[1DAY] NFL Universe")).toBe(false);
    expect(isAnnounced("[UPD 21] Game", "Game")).toBe(false);
    expect(isAnnounced("[UPD 21] Game", "[ UPD 21 ] Game!")).toBe(false);
  });
});
