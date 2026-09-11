import Link from "next/link";
import { Card } from "@/components/ui";
import { ClaimsCounter } from "@/components/ClaimsCounter";
import { listClaims } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export const revalidate = 30;
export const metadata = { title: "claimed combos" };

export default async function ClaimedPage() {
  const claims = await listClaims();
  return (
    <main className="flex flex-col gap-4">
      <div className="pop text-center">
        <h1 className="text-[30px] text-sky-600">claimed</h1>
        <p className="mt-1">
          <ClaimsCounter initial={claims.length} />
        </p>
        <p className="text-[13px] text-ink-soft">once it&apos;s gone, it&apos;s gone. across every chain.</p>
      </div>
      <Card pop={1}>
        <div className="flex flex-col gap-1">
          {claims.length === 0 && <p className="py-4 text-center text-[14px] text-ink-soft">Nothing claimed yet.</p>}
          {claims.map((c) => (
            <Link
              key={c.combo}
              href={`/m/${encodeURIComponent(c.display)}`}
              className="press flex items-center justify-between px-3 py-2"
              style={{ borderRadius: "var(--r-sm)" }}
            >
              <span className="text-[28px] leading-none">{c.display}</span>
              <span className="heading text-[12px] uppercase tracking-[0.1em] text-coral">claimed · {timeAgo(c.created_at)}</span>
            </Link>
          ))}
        </div>
      </Card>
      <Link href="/launch" className="press clay heading block bg-sky-500 px-6 py-4 text-center text-[18px] text-white">
        claim yours
      </Link>
    </main>
  );
}
