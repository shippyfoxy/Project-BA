// Genre accent colours from the V2 design. Labels are always Roblox's own
// genre names, exactly as the API and CSV exports give them, and each colour
// sits next to that label so colour never carries meaning on its own.
const GENRE_COLORS: Record<string, string> = {
  Simulation: "#199e70",
  Survival: "#c98500",
  "Roleplay & Avatar Sim": "#d55181",
  Action: "#e66767",
  Shooter: "#9085e9",
  RPG: "#8fa3bf",
};

const OTHER = "#6b7484";

export const genreColor = (genre: string): string => GENRE_COLORS[genre] ?? OTHER;
