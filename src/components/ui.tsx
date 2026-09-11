"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tone = "white" | "sky" | "primary" | "outline" | "mint" | "coral";

const bg: Record<Tone, string> = {
  white: "bg-white text-ink",
  sky: "bg-sky-50 text-ink",
  primary: "bg-sky-500 text-white",
  outline: "bg-sky-50 text-sky-600",
  mint: "bg-mint text-white",
  coral: "bg-coral text-white",
};

export function Card({
  children,
  tone = "white",
  className = "",
  pop,
}: {
  children: ReactNode;
  tone?: "white" | "sky";
  className?: string;
  pop?: number;
}) {
  return (
    <section className={`clay ${bg[tone]} p-5 ${pop !== undefined ? `pop pop-${pop}` : ""} ${className}`}>
      {children}
    </section>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`heading text-[13px] uppercase tracking-[0.12em] text-ink-soft ${className}`}>{children}</div>
  );
}

export function Button({
  tone = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ComponentProps<"button"> & { tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "px-4 py-2 text-[14px]",
    md: "px-6 py-3.5 text-[17px]",
    lg: "px-7 py-5 text-[22px]",
  }[size];
  return (
    <button
      className={`press clay heading w-full ${bg[tone]} ${sizes} disabled:opacity-60 ${className}`}
      style={{ borderRadius: "var(--r)" }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  tone = "primary",
  size = "md",
  className = "",
  children,
  external,
}: {
  href: string;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
  external?: boolean;
}) {
  const sizes = {
    sm: "px-4 py-2 text-[14px]",
    md: "px-6 py-3.5 text-[17px]",
    lg: "px-7 py-5 text-[22px]",
  }[size];
  const cls = `press clay heading block w-full text-center ${bg[tone]} ${sizes} ${className}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Pill({
  active,
  disabled,
  children,
  className = "",
  ...rest
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      className={`press clay-pill heading shrink-0 px-4 py-2 text-[14px] ${
        active ? "bg-sky-500 text-white" : "bg-sky-50 text-ink"
      } ${className}`}
      data-pressed={active ? "true" : undefined}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = "sky", children }: { tone?: "sky" | "mint" | "coral"; children: ReactNode }) {
  const t = { sky: "bg-sky-100 text-sky-600", mint: "bg-mint text-white", coral: "bg-coral text-white" }[tone];
  return (
    <span className={`clay-pill heading inline-block px-3 py-1 text-[12px] uppercase tracking-[0.1em] ${t}`}>
      {children}
    </span>
  );
}

export function Circle({ children, size = 44, className = "" }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <span
      className={`clay-sm inline-flex items-center justify-center bg-sky-50 ${className}`}
      style={{ width: size, height: size, borderRadius: 999 }}
    >
      {children}
    </span>
  );
}
