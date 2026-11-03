// Light or dark, remembered per browser. Without a saved choice the site
// follows the device setting. The layout runs this inline before the first
// paint, so pages never flash the wrong theme.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}`;
