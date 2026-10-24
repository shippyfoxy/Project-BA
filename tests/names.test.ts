import { describe, expect, it } from "vitest";
import { displayName } from "@/lib/trends/names";
import { parseSearch } from "@/lib/trends/search";

describe("displayName", () => {
  it.each([
    ["[🎃] RIVALS", "RIVALS"],
    ["Brookhaven 🏡RP", "Brookhaven RP"],
    ["[☄️] Ride a Dino", "Ride a Dino"],
    ["(🦑) Drill for Eggs", "Drill for Eggs"],
    ["[CH2] 🪵 Chop A Forest", "Chop A Forest"],
    ["🎃 Sell Fries! [Anomaly] 🍟", "Sell Fries! [Anomaly]"],
    ["Facecard: Makeup Showdown [⭐UPD]", "Facecard: Makeup Showdown"],
    ["[UPDATE 2.5] Anime Legacy Simulator", "Anime Legacy Simulator"],
    ["Dress Designer [COOP]", "Dress Designer [COOP]"],
    ["Steal An Egg", "Steal An Egg"],
    ["صيد الضبّان", "صيد الضبّان"],
  ])("%s -> %s", (raw, clean) => {
    expect(displayName(raw)).toBe(clean);
  });

  it("falls back to the raw name if cleaning would leave nothing", () => {
    expect(displayName("[🎃]")).toBe("[🎃]");
    expect(displayName("🐾🐾")).toBe("🐾🐾");
  });
});

describe("parseSearch", () => {
  it("reads a pasted Roblox link as a place ID", () => {
    expect(parseSearch("https://www.roblox.com/games/107778070777162/Steal-An-Egg")).toEqual({ kind: "place", placeId: "107778070777162" });
    expect(parseSearch("roblox.com/de/games/920587237")).toEqual({ kind: "place", placeId: "920587237" });
  });
  it("reads a bare number as an ID and anything else as text", () => {
    expect(parseSearch(" 10563114921 ")).toEqual({ kind: "id", id: "10563114921" });
    expect(parseSearch("Steal An Egg")).toEqual({ kind: "text", text: "Steal An Egg" });
    expect(parseSearch("   ")).toBeNull();
  });
});
