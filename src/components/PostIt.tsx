"use client";

/** X web intent. Works on mobile and desktop with no permissions. */
export function postItUrl(combo: string, ticker: string, url: string): string {
  const text = `just claimed ${combo} on moji, paired to $${ticker} 🫡\n${url}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

export function PostIt({ combo, ticker, url, size = "md" }: { combo: string; ticker: string; url: string; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "px-6 py-4 text-[19px]" : "px-5 py-3 text-[15px]";
  return (
    <a
      href={postItUrl(combo, ticker, url)}
      target="_blank"
      rel="noopener noreferrer"
      className={`press clay heading flex w-full items-center justify-center gap-2 bg-white text-ink ${cls}`}
    >
      <span className="heading text-[18px]">𝕏</span> Post it
    </a>
  );
}
