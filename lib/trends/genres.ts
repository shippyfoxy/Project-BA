// Genre accent colours from the V2 design. Each always sits next to its
// written label, so colour never carries meaning on its own.
const GENRES: Record<string, { color: string; short: string }> = {
  Simulation: { color: "#199e70", short: "Simulation" },
  Survival: { color: "#c98500", short: "Survival" },
  "Roleplay & Avatar Sim": { color: "#d55181", short: "Roleplay" },
  Action: { color: "#e66767", short: "Action" },
  Shooter: { color: "#9085e9", short: "Shooter" },
  RPG: { color: "#8fa3bf", short: "RPG" },
};

const OTHER = "#6b7484";

export function genreStyle(genre: string): { color: string; short: string } {
  return GENRES[genre] ?? { color: OTHER, short: genre };
}
