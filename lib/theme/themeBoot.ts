/** Server-safe theme constants (no "use client"), shared by the root layout and ThemeProvider. */

/** The theme actually painted. */
export type Theme = "light" | "dark";

export const STORAGE_KEY = "click-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Browser chrome color: matches `--bg` in each theme. */
export const THEME_COLOR: Record<Theme, string> = { light: "#f6f6f8", dark: "#0b0b0d" };

/**
 * Runs before paint: no stored choice means System. Keep in sync with
 * readStoredPreference / applyThemeToDocument in ThemeProvider.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light";}var d=document.documentElement;d.classList.toggle("dark",t==="dark");d.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)});}catch(e){}})();`;
