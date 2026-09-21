import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";

export const revalidate = 300;

type NavPage = { slug: string; title: string };
type NavSection = { section: string; pages: NavPage[] };

const ROOT = path.join(process.cwd(), "docs", "site");

async function nav(): Promise<NavSection[]> {
  return JSON.parse(await readFile(path.join(ROOT, "_nav.json"), "utf8")) as NavSection[];
}

export async function generateStaticParams() {
  const sections = await nav();
  return sections.flatMap((s) => s.pages.map((p) => ({ slug: p.slug ? [p.slug] : [] })));
}

type Params = { params: Promise<{ slug?: string[] }> };

async function load(slugParts?: string[]) {
  const slug = (slugParts ?? []).join("/");
  if (!/^[a-z0-9-]*$/.test(slug)) return null;
  const sections = await nav();
  const page = sections.flatMap((s) => s.pages).find((p) => p.slug === slug);
  if (!page) return null;
  const md = await readFile(path.join(ROOT, `${slug || "index"}.md`), "utf8").catch(() => null);
  if (md == null) return null;
  return { sections, page, slug, html: await marked.parse(md, { gfm: true }) };
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const d = await load(slug);
  return { title: d ? `${d.page.title} · moji docs` : "moji docs", description: "Launch, trade, follow and drop emoji tokens on moji, from a wallet or the app." };
}

/** The docs: markdown in docs/site, a sidebar from _nav.json, rendered with the same styles as the skill page. */
export default async function DocsPage({ params }: Params) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  return (
    <main className="home-breakout flex flex-col gap-4 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="clay bg-white p-4 lg:sticky lg:top-4">
        <Link href="/docs" className="heading block text-[18px] text-sky-600">
          moji docs
        </Link>
        <nav className="mt-3 flex flex-col gap-3">
          {d.sections.map((s) => (
            <div key={s.section}>
              <div className="heading text-[10px] uppercase tracking-[0.12em] text-ink-soft">{s.section}</div>
              <ul className="mt-1 flex flex-col">
                {s.pages.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/docs${p.slug ? `/${p.slug}` : ""}`} className={`block rounded-xl px-2 py-1 text-[13px] ${p.slug === d.slug ? "heading bg-sky-50 text-sky-600" : "text-ink hover:bg-sky-50"}`}>
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-1 text-[12px]">
          <a href="/skill.md" className="text-sky-600">
            skill.md
          </a>
          <Link href="/agents" className="text-sky-600">
            agents terminal
          </Link>
          <a href="https://github.com/gossipgirlonchain/moji" target="_blank" rel="noopener noreferrer" className="text-sky-600">
            github ↗
          </a>
        </div>
      </aside>
      <article className="skill-doc clay min-w-0 bg-white p-5 lg:p-8" dangerouslySetInnerHTML={{ __html: d.html }} />
    </main>
  );
}
