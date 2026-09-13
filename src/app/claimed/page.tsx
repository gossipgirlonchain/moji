import Link from "next/link";
import { Card } from "@/components/ui";
import { listClaims } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { findNumeraire } from "@/lib/numeraire";
import { chainById } from "@/config/chains";

export const revalidate = 30;
export const metadata = { title: "claimed combos" };

export default async function ClaimedPage() {
  const claims = await listClaims();
  return (
    <main className="flex flex-col gap-4">
      <div className="pop text-center">
        <h1 className="text-[30px] text-sky-600">claimed</h1>
        <p className="heading mt-1 text-[18px] text-ink">{claims.length.toLocaleString()} combos claimed</p>
        <p className="text-[13px] text-ink-soft">one moji per pair, per chain.</p>
      </div>
      <Card pop={1}>
        <div className="flex flex-col gap-1">
          {claims.length === 0 && <p className="py-4 text-center text-[14px] text-ink-soft">Nothing claimed yet.</p>}
          {claims.map((c) => {
            const ticker = findNumeraire(c.chain_id, c.stock_address)?.ticker ?? "";
            const href = ticker ? `/m/${encodeURIComponent(c.display)}/${encodeURIComponent(ticker)}/${c.chain_id}` : `/m/${encodeURIComponent(c.display)}`;
            return (
              <Link
                key={`${c.combo}-${c.chain_id}-${c.stock_address}`}
                href={href}
                className="press flex items-center justify-between px-3 py-2"
                style={{ borderRadius: "var(--r-sm)" }}
              >
                <span className="flex items-center gap-3">
                  <span className="text-[28px] leading-none">{c.display}</span>
                  <span className="heading text-[14px] text-ink">
                    {ticker && `/ ${ticker}`}
                    <span className="text-ink-soft"> · {chainById(c.chain_id)?.short ?? c.chain_id}</span>
                  </span>
                </span>
                <span className="heading text-[12px] uppercase tracking-[0.1em] text-coral">{timeAgo(c.created_at)}</span>
              </Link>
            );
          })}
        </div>
      </Card>
      <Link href="/launch" className="press clay heading block bg-sky-500 px-6 py-4 text-center text-[18px] text-white">
        claim yours
      </Link>
    </main>
  );
}
