"use client";

import { usePathname } from "next/navigation";

/** The app is a 460px phone column everywhere except admin, which is a desktop dashboard. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = pathname?.startsWith("/admin");
  return <div className={`mx-auto w-full px-5 pb-28 pt-4 min-h-screen ${wide ? "max-w-[1240px]" : "max-w-[460px]"}`}>{children}</div>;
}
