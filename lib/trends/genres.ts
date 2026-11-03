// Genre accent colours, grouped into families so related genres look related:
// conflict (reds to gold), social and media (greens), casual (teals to cyan) and
// story and progression (violets to rose). Picked in OKLCH within the dark-mode
// lightness band and kept clear of the rising blue and falling orange. Fourteen
// colours cannot all be told apart, so a colour always sits next to its genre's
// name and genres are never drawn as several lines on one chart. Labels are
// Roblox's own genre names, exactly as the API and CSV exports give them.
const GENRE_COLORS: Record<string, string> = {
  Shooter: "#DE667A",
  Action: "#CC3F2F",
  Survival: "#A76C00",
  Strategy: "#AA9117",

  Social: "#5CA83F",
  Entertainment: "#1D7D3E",

  "Party & Casual": "#099A72",
  "Sports & Racing": "#1FAAA4",
  Puzzle: "#0C7D88",
  "Obby & Platformer": "#019BC2",

  Adventure: "#695DCF",
  RPG: "#A17DD4",
  Simulation: "#B350AC",
  "Roleplay & Avatar Sim": "#B64071",
};

// Shopping, Education, Utility & Other and Roblox's catch-all "All" hold a few
// dozen games between them and share the neutral grey.
const OTHER = "#6b7484";

export const genreColor = (genre: string): string => GENRE_COLORS[genre] ?? OTHER;
