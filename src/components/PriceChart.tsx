"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, AreaSeries, ColorType, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { usd } from "@/lib/format";

const RANGES = ["1H", "4H", "1D", "7D", "ALL"] as const;
type Range = (typeof RANGES)[number];
type Point = { time: number; value: number };

export function PriceChart({ combo, marketCapUsd, priceUsd }: { combo: string; marketCapUsd: number; priceUsd: number }) {
  const [range, setRange] = useState<Range>("1D");
  const [points, setPoints] = useState<Point[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    let alive = true;
    setPoints(null);
    fetch(`/api/mojis/${encodeURIComponent(combo)}/chart?range=${range}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { points: Point[] }) => alive && setPoints(j.points ?? []))
      .catch(() => alive && setPoints([]));
    return () => {
      alive = false;
    };
  }, [combo, range]);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const chart = createChart(el, {
      height: 180,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#5A8AA6", fontFamily: "var(--font-fredoka), Fredoka, sans-serif", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { horzLine: { visible: false }, vertLine: { color: "#9BD2F4", width: 1, style: 2 } },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#5FD3AE",
      lineWidth: 3,
      topColor: "rgba(95, 211, 174, 0.45)",
      bottomColor: "rgba(95, 211, 174, 0.02)",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: "#ffffff",
      crosshairMarkerBackgroundColor: "#5FD3AE",
      priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
    });
    chartRef.current = chart;

    const data = (points && points.length > 0 ? points : flat(priceUsd)).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    series.setData(data);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [points, priceUsd]);

  const empty = points !== null && points.length === 0;

  return (
    <div>
      <div className="mb-1 flex items-end justify-between">
        <div>
          <div className="heading text-[12px] uppercase tracking-[0.12em] text-ink-soft">market cap</div>
          <div className="num text-[36px] leading-none text-ink">{usd(marketCapUsd)}</div>
        </div>
        <div className="heading text-right text-[13px] text-ink-soft">
          price
          <div className="num text-[16px] text-ink">{usd(priceUsd, { compact: false })}</div>
        </div>
      </div>
      <div className="relative -mx-2 mt-2 overflow-hidden" style={{ borderRadius: "var(--r-sm)" }}>
        <div ref={ref} className="w-full" />
        {points === null && <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-soft">loading…</div>}
        {empty && (
          <div className="absolute inset-x-0 top-2 text-center text-[12px] text-ink-soft">no trades in this window yet</div>
        )}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            data-pressed={range === r ? "true" : undefined}
            className={`press clay-pill heading px-3.5 py-1.5 text-[13px] ${range === r ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"}`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

function flat(price: number): Point[] {
  const now = Math.floor(Date.now() / 1000);
  const v = price || 0;
  return Array.from({ length: 24 }, (_, i) => ({ time: now - (23 - i) * 3600, value: v }));
}
