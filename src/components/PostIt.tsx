"use client";

/** X web intent. Works on mobile and desktop with no permissions. */
export function postItUrl(combo: string, ticker: string, url: string, ca?: string | null): string {
  const lines = [`${combo} paired to $${ticker} on @mojidotwtf 🫡`];
  if (ca) lines.push("", `CA: ${ca}`);
  lines.push("", url);
  return `https://x.com/intent/post?text=${encodeURIComponent(lines.join("\n"))}`;
}

export function PostIt({ combo, ticker, url, ca, size = "md" }: { combo: string; ticker: string; url: string; ca?: string | null; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "px-6 py-4 text-[19px]" : "px-5 py-3 text-[15px]";
  return (
    <a
      href={postItUrl(combo, ticker, url, ca)}
      target="_blank"
      rel="noopener noreferrer"
      className={`press clay heading flex w-full items-center justify-center gap-2 bg-white text-ink ${cls}`}
    >
      <span className="heading text-[18px]">𝕏</span> Post it
    </a>
  );
}
