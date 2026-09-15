/**
 * Mojis whose drops surfaces (creator page, public card, APIs) are open to everyone while the feature
 * is in testing. Everything else stays behind the admin password. Combos are matched on the normalized
 * form (variation selectors stripped), so "🍎" covers every pair the combo is launched on.
 * `NEXT_PUBLIC_DROPS_ALLOWLIST` (comma-separated combos) extends the list without a deploy of code.
 */
export const DROPS_ALLOWLIST: string[] = ["🍎", ...(process.env.NEXT_PUBLIC_DROPS_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
