import { isAdmin, ADMIN_ENABLED } from "@/lib/admin";
import { AdminGate, AdminDashboard } from "@/components/Admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "moji admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const ok = await isAdmin();
  return (
    <main className="flex flex-col gap-4">
      <h1 className="pop text-center text-[30px] text-sky-600">admin</h1>
      {!ADMIN_ENABLED ? <p className="text-center text-[14px] text-coral">ADMIN_PASSWORD is not set.</p> : ok ? <AdminDashboard /> : <AdminGate />}
    </main>
  );
}
