import Image from "next/image";

const CLUSTER = [
  { e: "🍏", x: "6%", y: "8%", rot: "-12deg", d: "0s", s: 26 },
  { e: "🚀", x: "78%", y: "2%", rot: "14deg", d: "0.6s", s: 30 },
  { e: "🐕", x: "88%", y: "62%", rot: "-6deg", d: "1.1s", s: 24 },
  { e: "☕", x: "2%", y: "66%", rot: "8deg", d: "1.7s", s: 22 },
  { e: "🍕", x: "40%", y: "-10%", rot: "-4deg", d: "2.2s", s: 20 },
  { e: "🎢", x: "58%", y: "78%", rot: "10deg", d: "0.3s", s: 22 },
];

export function Wordmark() {
  return (
    <div className="relative mx-auto mb-3 flex h-[150px] w-full items-center justify-center">
      {CLUSTER.map((c) => (
        <span
          key={c.e}
          className="bob pointer-events-none absolute select-none opacity-70"
          style={{ left: c.x, top: c.y, fontSize: c.s, animationDelay: c.d, ["--rot" as string]: c.rot }}
          aria-hidden
        >
          {c.e}
        </span>
      ))}
      <Image src="/moji.png" alt="moji" width={690} height={356} priority className="relative z-10 h-[110px] w-auto drop-shadow-[6px_8px_14px_rgba(18,64,92,0.18)]" />
    </div>
  );
}
