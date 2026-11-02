export type Theme = "dark" | "light";

export const THEME_KEY = "triad-theme";

// Runs inline in <head> before first paint so a light-theme user never sees a
// dark flash. Kept tiny and dependency-free; dark is the default.
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}
