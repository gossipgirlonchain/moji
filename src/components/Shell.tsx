"use client";

import { usePathname } from "next/navigation";

/**
 * The app is a 460px phone column everywhere except admin, design and creators (desktop dashboards)
 * and the home page and /agents, which widen to a desktop layout on large screens and stay the phone column below.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const dashboard = pathname?.startsWith("/admin") || pathname?.startsWith("/design") || pathname?.startsWith("/creators");
  const home = pathname === "/" || pathname === "/agents" || pathname === "/agents/skill";
  return <div className={`mx-auto w-full px-5 pb-28 pt-4 min-h-screen ${dashboard ? "max-w-[1240px]" : home ? "shell-home" : "max-w-[460px]"}`}>{children}</div>;
}
