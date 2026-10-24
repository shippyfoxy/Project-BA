// Roblox titles carry promotional tags and emoji ("[🎃] RIVALS",
// "Brookhaven 🏡RP"). For display we drop bracketed tags that contain emoji,
// any leading bracketed tag ("[UPDATE 2.5]"), and loose emoji. Trailing tags
// without emoji ("[COOP]") are kept because they are often part of the name.
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;
const TAG_WITH_EMOJI = /[[(][^\])]*\p{Extended_Pictographic}[^\])]*[\])]/gu;
const LEADING_TAG = /^\s*[[(][^\])]*[\])]\s*/u;

export function displayName(raw: string): string {
  let name = raw.replace(TAG_WITH_EMOJI, " ");
  while (LEADING_TAG.test(name)) name = name.replace(LEADING_TAG, "");
  name = name.replace(EMOJI, " ").replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : raw;
}
