import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-col items-center gap-4 pt-10 text-center">
      <div className="text-[72px]">🫥</div>
      <h1 className="text-[28px] text-sky-600">no moji here</h1>
      <p className="text-[14px] text-ink-soft">that combo hasn&apos;t been claimed. which means it&apos;s open.</p>
      <Link href="/launch" className="press clay heading bg-sky-500 px-6 py-3.5 text-[17px] text-white">
        claim it
      </Link>
    </main>
  );
}
