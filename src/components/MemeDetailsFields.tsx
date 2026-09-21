"use client";

import { DESCRIPTION_MAX, type MemeDetails } from "@/lib/meme-details";

/** The words and links of a meme: description, X, Telegram, website. Used at launch (step 4) and on the moji page. */
export function MemeDetailsFields({ value, onChange, disabled, className = "" }: { value: MemeDetails; onChange: (d: MemeDetails) => void; disabled?: boolean; className?: string }) {
  const set = (k: keyof MemeDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value });
  const field = "clay-input !py-2.5 !px-3.5 text-[14px]";
  return (
    <div className={`flex w-full flex-col gap-2 ${className}`}>
      <textarea value={value.description} onChange={set("description")} disabled={disabled} maxLength={DESCRIPTION_MAX} rows={2} placeholder="what is this moji about? (optional)" className={`${field} resize-none`} />
      <div className="grid grid-cols-3 gap-2">
        <input value={value.x_url} onChange={set("x_url")} disabled={disabled} placeholder="X @handle" autoComplete="off" className={field} />
        <input value={value.telegram_url} onChange={set("telegram_url")} disabled={disabled} placeholder="Telegram" autoComplete="off" className={field} />
        <input value={value.website_url} onChange={set("website_url")} disabled={disabled} placeholder="website" autoComplete="off" inputMode="url" className={field} />
      </div>
    </div>
  );
}
