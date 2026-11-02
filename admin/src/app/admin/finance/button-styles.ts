// Stilar för "Ny …"-knapparna på Ekonomi-sidan: i sidhuvudet (primary,
// secondary) och i sektionernas rubrikrad (small).
export const NEW_BUTTON_CLS = {
  primary:
    "rounded-btn bg-teal-500 hover:bg-teal-400 text-fixed-white px-3 py-2 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20",
  secondary:
    "rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2",
  small:
    "rounded-btn border border-white/10 hover:bg-white/10 px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap",
};

export type NewButtonVariant = keyof typeof NEW_BUTTON_CLS;
