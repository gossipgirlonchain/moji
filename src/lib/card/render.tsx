import "server-only";
import { ImageResponse } from "next/og";
import { isEmoji } from "@/lib/emoji";
import { cardFonts } from "./fonts";
import { resolveSprites } from "./emoji";
import { loadClay } from "./clay";
import { wordmarkDataUrl } from "@/lib/render";
import { ARTBOARD_INSET, scatter } from "./scatter";
import { CARD_BG, Frame, emojiNeeded, makeCtx, renderTemplate } from "./templates";
import type { CardSpec } from "./params";

/**
 * The one renderer behind /api/card. Same approach as the token PNG and OG routes (next/og, satori, resvg),
 * plus self hosted fonts and Noto emoji as images so a card is pixel identical wherever it is rendered.
 */
export async function renderCard(spec: CardSpec): Promise<ImageResponse> {
  const placements = scatter(spec.seed, spec.w, spec.h, spec.mix ?? spec.seed);
  const needed = emojiNeeded(spec);
  const [sprites, fonts, clay, wordmark] = await Promise.all([
    resolveSprites(needed.plain.filter(isEmoji), [...placements.map((p) => p.emoji), ...needed.shadowed.filter(isEmoji)]),
    cardFonts(),
    loadClay(spec.w - 2 * ARTBOARD_INSET, spec.h - 2 * ARTBOARD_INSET, CARD_BG[spec.template]),
    wordmarkDataUrl(),
  ]);
  const ctx = makeCtx(spec.w, spec.h, sprites, clay, wordmark);
  return new ImageResponse(
    (
      <Frame ctx={ctx} placements={placements}>
        {renderTemplate(spec, ctx)}
      </Frame>
    ),
    { width: spec.w, height: spec.h, fonts },
  );
}
