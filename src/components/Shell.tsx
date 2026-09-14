"use client";

import { usePathname } from "next/navigation";

/** The app is a 460px phone column everywhere except admin and design, which are desktop dashboards. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = pathname?.startsWith("/admin") || pathname?.startsWith("/design");
  return <div className={`mx-auto w-full px-5 pb-28 pt-4 min-h-screen ${wide ? "max-w-[1240px]" : "max-w-[460px]"}`}>{children}</div>;
}
