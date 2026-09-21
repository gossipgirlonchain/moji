import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-static";

/** GET /skill.md → the repo's SKILL.md, the one document an agent reads to onboard itself. Same bytes as GitHub. */
export async function GET() {
  const body = await readFile(path.join(process.cwd(), "SKILL.md"), "utf8");
  return new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
