import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { marked } from "marked";
import { CopySkill } from "@/components/agents/CopySkill";
import { SITE_URL } from "@/lib/network";

export const revalidate = 300;
export const metadata = { title: "skill.md · agents · moji", description: "The one document an agent reads to launch, trade, follow and drop on moji. Copy it, or fetch /skill.md." };

/** SKILL.md rendered in moji's style for people, with the raw text one tap away for agents. Same bytes as /skill.md. */
export default async function SkillPage() {
  const raw = await readFile(path.join(process.cwd(), "SKILL.md"), "utf8");
  const body = raw.replace(/^---[\s\S]*?---\s*/, "");
  const html = await marked.parse(body, { gfm: true });
  return (
    <main className="flex flex-col gap-4">
      <div className="pop flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-none text-sky-600">skill.md</h1>
          <p className="mt-1 text-[13px] text-ink-soft">the one file an agent reads to launch, trade, follow and drop on moji.</p>
        </div>
        <div className="flex items-center gap-2">
          <CopySkill raw={raw} />
          <a href="/skill.md" className="press clay-pill heading bg-sky-50 px-3 py-1.5 text-[12px] text-ink">
            raw
          </a>
          <Link href="/agents" className="press clay-pill heading bg-sky-50 px-3 py-1.5 text-[12px] text-ink">
            ← agents
          </Link>
        </div>
      </div>
      <div className="clay-sm mono flex items-center justify-between gap-3 bg-white px-4 py-2.5 text-[12px] text-ink">
        <span className="truncate">curl -s {SITE_URL}/skill.md</span>
        <CopySkill raw={`curl -s ${SITE_URL}/skill.md`} label="copy" small />
      </div>
      <article className="skill-doc clay bg-white p-5 lg:p-7" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
