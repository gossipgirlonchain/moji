/**
 * Build src/config/stocks-arbitrum.ts from Reality rTokens on Arbitrum One.
 *
 * Source A (preferred): Bitget Wallet RWA API. Needs an API key from https://portal-web3.bitget.com (no KYB).
 *   BGW_API_KEY=... BGW_API_SECRET=... npx tsx scripts/discover-reality.ts
 * Source B (fallback): a text file with one Arbitrum contract address per line.
 *   npx tsx scripts/discover-reality.ts --from-file rtokens.txt
 *
 * Every address is verified on-chain (symbol / name / decimals via Arbitrum RPC) before it is written.
 * Tickers are the underlying symbol (AAPL); symbolOnChain keeps the rToken symbol (rAAPL).
 * Logos: reuses public/stocks/<TICKER>.png when present, else tries financialmodelingprep, else empty (initials fallback).
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, erc20Abi, type Address } from "viem";
import { arbitrum } from "viem/chains";

const BASE = "https://bopenapi.bgwapi.io";
const ARB_CHAIN_IDS = new Set(["arb", "arbitrum", "arb1", "arbitrum-one", "42161"]);

type ListRow = { ticker: string; name: string; contracts: { chain: string; contract: string; data_source: string }[] };

function sign(path: string, body: string, key: string, secret: string, ts: string): string {
  // Docs: JSON of {apiPath, body (raw string), x-api-key, x-api-timestamp} with keys sorted, HMAC-SHA256 base64.
  const payload = JSON.stringify({ apiPath: path, body, "x-api-key": key, "x-api-timestamp": ts });
  return createHmac("sha256", secret).update(payload).digest("base64");
}

async function bgw<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.BGW_API_KEY ?? "";
  const secret = process.env.BGW_API_SECRET ?? "";
  if (!key || !secret) throw new Error("BGW_API_KEY / BGW_API_SECRET not set (portal-web3.bitget.com), or use --from-file");
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "x-api-timestamp": ts, "x-api-signature": sign(path, raw, key, secret, ts) },
    body: raw,
  });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()) as T;
}

async function fromApi(): Promise<{ ticker: string; name: string; address: Address }[]> {
  const res = await bgw<{ status: number; data?: { list?: ListRow[] } }>("/bgw-pro/market/v3/rwa/stockList", {});
  const list = res.data?.list ?? [];
  const chains = new Map<string, number>();
  for (const row of list) for (const c of row.contracts ?? []) if (c.data_source === "reality") chains.set(c.chain, (chains.get(c.chain) ?? 0) + 1);
  console.log("reality contracts per chain id:", Object.fromEntries(chains));
  const out: { ticker: string; name: string; address: Address }[] = [];
  for (const row of list) {
    const c = (row.contracts ?? []).find((x) => x.data_source === "reality" && ARB_CHAIN_IDS.has(x.chain.toLowerCase()));
    if (c && /^0x[0-9a-fA-F]{40}$/.test(c.contract)) out.push({ ticker: row.ticker.toUpperCase(), name: row.name, address: c.contract as Address });
  }
  return out;
}

function fromFile(path: string): { ticker: string; name: string; address: Address }[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^0x[0-9a-fA-F]{40}$/.test(l))
    .map((address) => ({ ticker: "", name: "", address: address as Address }));
}

async function main() {
  const fileArg = process.argv.indexOf("--from-file");
  const seeds = fileArg > -1 ? fromFile(process.argv[fileArg + 1]) : await fromApi();
  console.log(`${seeds.length} candidate rTokens on Arbitrum`);
  const pc = createPublicClient({ chain: arbitrum, transport: http(process.env.ARBITRUM_RPC_URL ?? "https://arb1.arbitrum.io/rpc") });

  const rows: string[] = [];
  let bad = 0;
  for (const s of seeds) {
    try {
      const [symbol, name, decimals] = await Promise.all([
        pc.readContract({ address: s.address, abi: erc20Abi, functionName: "symbol" }),
        pc.readContract({ address: s.address, abi: erc20Abi, functionName: "name" }),
        pc.readContract({ address: s.address, abi: erc20Abi, functionName: "decimals" }),
      ]);
      const ticker = (s.ticker || symbol.replace(/^r/, "")).toUpperCase();
      const logoPath = `public/stocks/${ticker}.png`;
      let logo = existsSync(logoPath) ? `/stocks/${ticker}.png` : "";
      if (!logo) {
        try {
          const r = await fetch(`https://financialmodelingprep.com/image-stock/${ticker}.png`);
          if (r.ok && (r.headers.get("content-type") ?? "").startsWith("image/")) {
            writeFileSync(logoPath, Buffer.from(await r.arrayBuffer()));
            logo = `/stocks/${ticker}.png`;
          }
        } catch {}
      }
      rows.push(`  { ticker: ${JSON.stringify(ticker)}, name: ${JSON.stringify(s.name || name)}, address: ${JSON.stringify(s.address)}, logo: ${JSON.stringify(logo)}, decimals: ${Number(decimals)}, issuer: "reality", symbolOnChain: ${JSON.stringify(symbol)} },`);
      console.log("ok", ticker.padEnd(6), symbol.padEnd(8), Number(decimals), s.address, name);
    } catch (e) {
      bad++;
      console.log("SKIP", s.address, s.ticker, String((e as Error).message).slice(0, 80));
    }
  }
  rows.sort();
  const file = `// Reality rTokens on Arbitrum One (chainId 42161): ERC-20s issued by Reality (Bitget), 1:1 backed by
// shares held with a US broker-dealer. Doppler announced rToken-paired markets on 2026-09-14.
//
// Generated ${new Date().toISOString().slice(0, 10)} by \`npx tsx scripts/discover-reality.ts\` (${fileArg > -1 ? "address file" : "Bitget RWA API stockList"}),
// every address verified on-chain (symbol/name/decimals via Arbitrum RPC). Do not hand-edit: rerun the script.
import type { Stock } from "./stocks-types"

export const STOCKS_42161: Stock[] = [
${rows.join("\n")}
]
`;
  writeFileSync("src/config/stocks-arbitrum.ts", file);
  console.log(`wrote src/config/stocks-arbitrum.ts: ${rows.length} rTokens, ${bad} skipped`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
