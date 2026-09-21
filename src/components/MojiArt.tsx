import type { CSSProperties } from "react";
import type { MojiRow } from "@/lib/supabase";
import { MemeFace } from "./MemeFace";

type Art = Pick<MojiRow, "display"> & { meme_url?: string | null };

/**
 * The picture of a moji: the creator's meme when there is one, else the emoji on the sky gradient.
 * Server-safe, no hooks. `size` makes a fixed square; without it the art fills its container as a square.
 * A meme that fails to load falls back to the emoji (MemeFace), so nothing ever shows as a broken box.
 */
export function MojiArt({
  m,
  size,
  radius = 20,
  emojiSize,
  badge = true,
  eager = false,
  className = "",
}: {
  m: Art;
  size?: number;
  radius?: number | string;
  /** emoji font size for the fallback; defaults to half of `size` */
  emojiSize?: number;
  /** show the emoji combo as a chip over a meme, so the claim stays visible */
  badge?: boolean;
  /** above the fold: load the picture right away instead of lazily */
  eager?: boolean;
  className?: string;
}) {
  const box: CSSProperties = size ? { width: size, height: size, borderRadius: radius } : { borderRadius: radius };
  const fluid = size ? "shrink-0" : "aspect-square w-full";
  const font = emojiSize ?? (size ? Math.round(size * 0.52) : 64);
  const fallback = (
    <span
      className={`flex items-center justify-center overflow-hidden ${fluid} ${className}`}
      style={{ ...box, background: "linear-gradient(145deg, var(--sky-50) 0%, var(--sky-200) 55%, var(--sky-300) 100%)", fontSize: font, lineHeight: 1 }}
    >
      {m.display}
    </span>
  );
  if (!m.meme_url) return fallback;
  const chip = size ? Math.max(12, Math.round(size * 0.34)) : 28;
  return (
    <MemeFace src={m.meme_url} fallback={fallback} eager={eager} className={`relative block overflow-hidden bg-sky-100 ${fluid} ${className}`} style={box}>
      {badge && (size === undefined || size >= 56) && (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 leading-none shadow-sm" style={{ fontSize: chip }} aria-hidden>
          {m.display}
        </span>
      )}
    </MemeFace>
  );
}
