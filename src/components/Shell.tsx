"use client";

import { usePathname } from "next/navigation";

/**
 * The app is a 460px phone column everywhere except admin, design and creators (desktop dashboards)
 * and the home page, /explore, the moji pages and /agents, which widen to a desktop layout on large screens
 * and stay the phone column below.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const dashboard = pathname?.startsWith("/admin") || pathname?.startsWith("/design") || pathname?.startsWith("/creators");
  const home =
    pathname === "/" || pathname === "/explore" || pathname === "/agents" || pathname === "/agents/skill" || pathname === "/docs" || Boolean(pathname?.startsWith("/docs/")) || Boolean(pathname?.startsWith("/m/"));
  return <div className={`shell-safe mx-auto w-full px-5 min-h-screen ${dashboard ? "max-w-[1240px]" : home ? "shell-home" : "max-w-[460px]"}`}>{children}</div>;
}
