/**
 * Design tokens for server-side renderers (satori cannot read CSS variables).
 * These mirror `:root` in src/app/globals.css, which stays the source for the browser.
 * Do not add colors here that are not in globals.css; `npm run check:tokens` verifies the two agree.
 */
export const SKY = {
  50: "#F2FAFF",
  100: "#DCEEFB",
  200: "#C3E3F8",
  300: "#9BD2F4",
  400: "#6FBDEE",
  500: "#4AA8E6",
  600: "#2E8BC9",
} as const;

export const INK = "#12405C";
export const INK_SOFT = "#5A8AA6";
export const MINT = "#5FD3AE";
export const CORAL = "#FF9E9E";

export const RADIUS = { clay: 32, sm: 20, pill: 999 } as const;

export const CLAY = "8px 8px 24px rgba(18,64,92,0.15), inset -8px -8px 16px rgba(18,64,92,0.10), inset 8px 8px 16px rgba(255,255,255,0.45)";
export const CLAY_SM = "4px 4px 14px rgba(18,64,92,0.13), inset -4px -4px 10px rgba(18,64,92,0.09), inset 4px 4px 10px rgba(255,255,255,0.50)";

/** Font families as used in globals.css (--font-heading / --font-body). */
export const FONT = { heading: "Fredoka", body: "Nunito" } as const;

/** Map of CSS variable name to the value above, used by the parity check. */
export const CSS_VARS: Record<string, string> = {
  "--sky-50": SKY[50],
  "--sky-100": SKY[100],
  "--sky-200": SKY[200],
  "--sky-300": SKY[300],
  "--sky-400": SKY[400],
  "--sky-500": SKY[500],
  "--sky-600": SKY[600],
  "--ink": INK,
  "--ink-soft": INK_SOFT,
  "--mint": MINT,
  "--coral": CORAL,
  "--r": `${RADIUS.clay}px`,
  "--r-sm": `${RADIUS.sm}px`,
  "--r-pill": `${RADIUS.pill}px`,
  "--clay": CLAY,
  "--clay-sm": CLAY_SM,
};
