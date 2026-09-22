import type { CSSProperties } from "react";
import type { MojiRow } from "@/lib/supabase";

type Art = Pick<MojiRow, "display"> & { meme_url?: string | null; kind?: string | null };

/**
 * The picture of a moji: the creator's meme when there is one, else the emoji on the sky gradient.
 * Server-safe, no hooks. `size` makes a fixed square; without it the art fills its container as a square.
 */
export function MojiArt({
  m,
  size,
  radius = 20,
  emojiSize,
  badge = true,
  className = "",
}: {
  m: Art;
  size?: number;
  radius?: number | string;
  /** emoji font size for the fallback; defaults to half of `size` */
  emojiSize?: number;
  /** show the emoji combo as a chip over a meme, so the claim stays visible */
  badge?: boolean;
  className?: string;
}) {
  const box: CSSProperties = size ? { width: size, height: size, borderRadius: radius } : { borderRadius: radius };
  const fluid = size ? "shrink-0" : "aspect-square w-full";
  if (m.meme_url) {
    const chip = size ? Math.max(12, Math.round(size * 0.34)) : 28;
    return (
      <span className={`relative block overflow-hidden bg-sky-100 ${fluid} ${className}`} style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.meme_url} alt="" loading="lazy" decoding="async" className="block h-full w-full object-cover" />
        {badge && (size === undefined || size >= 56) && (
          <span
            className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 leading-none shadow-sm"
            style={{ fontSize: chip }}
            aria-hidden
          >
            {m.display}
          </span>
        )}
      </span>
    );
  }
  if (m.kind === "meme") {
    // A MEME launch with no picture yet: its ticker on the sky tile, in the heading face.
    const font = size ? Math.max(10, Math.round(size * 0.26)) : 28;
    return (
      <span
        className={`heading flex items-center justify-center overflow-hidden px-1 text-ink ${fluid} ${className}`}
        style={{ ...box, background: "linear-gradient(145deg, var(--sky-50) 0%, var(--sky-200) 55%, var(--sky-300) 100%)", fontSize: font, lineHeight: 1 }}
      >
        <span className="max-w-full truncate">{m.display}</span>
      </span>
    );
  }
  const font = emojiSize ?? (size ? Math.round(size * 0.52) : 64);
  return (
    <span
      className={`flex items-center justify-center overflow-hidden ${fluid} ${className}`}
      style={{ ...box, background: "linear-gradient(145deg, var(--sky-50) 0%, var(--sky-200) 55%, var(--sky-300) 100%)", fontSize: font, lineHeight: 1 }}
    >
      {m.display}
    </span>
  );
}
