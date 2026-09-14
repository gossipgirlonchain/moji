import { isAdmin, ADMIN_ENABLED } from "@/lib/admin";
import { AdminGate } from "@/components/Admin";
import { CreatorsBoard } from "@/components/Creators";

export const dynamic = "force-dynamic";
export const metadata = { title: "moji creators", robots: { index: false, follow: false } };

/** Creator outreach pipeline. Gated by the same admin cookie as /admin and /design. */
export default async function CreatorsPage() {
  const ok = await isAdmin();
  return (
    <main className="flex flex-col gap-4">
      <h1 className="pop text-center text-[30px] text-sky-600">creators</h1>
      {!ADMIN_ENABLED ? <p className="text-center text-[14px] text-coral">ADMIN_PASSWORD is not set.</p> : ok ? <CreatorsBoard /> : <AdminGate />}
    </main>
  );
}
