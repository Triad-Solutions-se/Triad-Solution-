import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import palette from "tailwindcss/colors";

// The portal was designed dark-first, so `white` means "foreground" and `black`
// means "recessed" throughout (text-white, bg-white/5, border-white/10, bg-black/30
// input wells). Both point at CSS variables (see globals.css) so the light theme
// can flip them. Use `fixed-white` / `fixed-black` where a colour must stay put,
// e.g. text on a solid teal button.
const themed = (channel: string) => `rgb(var(${channel}) / <alpha-value>)`;

// Text accents are tuned for a dark background (text-emerald-300 etc.) and wash out
// on white, so text colours read from per-theme variables. Backgrounds and borders
// keep the stock palette.
const ACCENT_HUES = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan",
  "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
] as const;
const NEUTRAL_HUES = ["slate", "gray", "zinc", "neutral", "stone"] as const;
const LIGHT_ACCENT_SHADE = { 100: 900, 200: 800, 300: 700, 400: 700, 500: 700 } as const;
const LIGHT_NEUTRAL_SHADE = { 100: 900, 200: 800, 300: 700, 400: 600, 500: 500 } as const;

const textHues = [
  ...ACCENT_HUES.map((hue) => ({ hue, shades: LIGHT_ACCENT_SHADE })),
  ...NEUTRAL_HUES.map((hue) => ({ hue, shades: LIGHT_NEUTRAL_SHADE })),
];

const channels = (hex: string) =>
  hex.replace("#", "").match(/../g)!.map((h) => parseInt(h, 16)).join(" ");

const textColor = Object.fromEntries(
  textHues.map(({ hue, shades }) => [
    hue,
    Object.fromEntries(Object.keys(shades).map((s) => [s, themed(`--text-${hue}-${s}`)])),
  ]),
);

const themedTextVars = plugin(({ addBase }) => {
  const dark: Record<string, string> = {};
  const light: Record<string, string> = {};
  for (const { hue, shades } of textHues) {
    const scale: Record<string, string> = palette[hue];
    for (const [shade, lightShade] of Object.entries(shades)) {
      dark[`--text-${hue}-${shade}`] = channels(scale[shade]);
      light[`--text-${hue}-${shade}`] = channels(scale[lightShade]);
    }
  }
  addBase({ ':root, [data-theme="dark"]': dark, '[data-theme="light"]': light });
});

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: themed("--fg-rgb"),
        black: themed("--recess-rgb"),
        fixed: { white: "#ffffff", black: "#000000" },
        triad: {
          teal: "#00b4a8",
          navy: "#0a2540",
          antracit: "#2b2d2f",
        },
      },
      textColor,
      fontFamily: {
        sans: ["Roboto", "system-ui", "sans-serif"],
        heading: ["Montserrat", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        btn: "8px",
        card: "12px",
        modal: "16px",
      },
      boxShadow: {
        subtle: "0 1px 3px rgba(0,0,0,0.08)",
        card: "0 4px 12px rgba(0,0,0,0.10)",
        modal: "0 16px 40px rgba(0,0,0,0.16)",
      },
    },
  },
  plugins: [themedTextVars],
};
export default config;
