import { createPublicClient, http, erc20Abi, getAddress, type Address } from "viem";
import { mainnet, arbitrum, base, monad } from "viem/chains";
import { readFileSync, writeFileSync } from "node:fs";

const S = "/private/tmp/claude-501/-Users-winny/643a238c-72f7-4137-b848-7b6844f1bedd/scratchpad";
const rh = JSON.parse(readFileSync(`${S}/rh_assets.json`, "utf8"));
const rows: any[] = Array.isArray(rh) ? rh : rh.results ?? rh.assets ?? rh.data ?? [];
const universe = [...new Set(rows.map((r: any) => String(r.tokenSymbol || r.symbol || "").toUpperCase()).filter((t: string) => /^[A-Z.]{1,6}$/.test(t)))];
const names: Record<string, string> = {};
for (const r of rows) names[String(r.tokenSymbol || r.symbol).toUpperCase()] = String(r.tokenName || r.name || "").replace(/ • Robinhood Token$/, "");

type Hit = { chain: string; ticker: string; symbol: string; name: string; address: Address; issuer: string; liq: number };
const chainIds: Record<string, number> = { ethereum: 1, arbitrum: 42161, base: 8453, monad: 143 };
const issuerOf = (sym: string, name: string, ticker: string): string | null => {
  const n = name.toLowerCase();
  if (/ondo tokenized/.test(n) && sym.toUpperCase() === `${ticker}ON`) return "ondo";
  if (/xstock/.test(n) && sym.toUpperCase() === `${ticker}X`) return "backed-xstocks";
  if (/dinari/.test(n) && sym.toUpperCase().replace(/\.D$/, "") === ticker) return "dinari";
  if (/tokenized bstock|backed/.test(n) && sym.toUpperCase() === `${ticker}B`) return "backed-bstocks";
  return null;
};

async function search(q: string): Promise<any[]> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, { headers: { "user-agent": "moji" } });
      if (r.status === 429) { await new Promise((z) => setTimeout(z, 1500)); continue; }
      return ((await r.json()) as any).pairs ?? [];
    } catch { await new Promise((z) => setTimeout(z, 800)); }
  }
  return [];
}

async function main() {
  const hits = new Map<string, Hit>();
  let done = 0;
  const queue = universe.flatMap((t) => [`${t}on`, `${t}x`, `${t} Dinari`, `${t}b`]);
  const worker = async () => {
    while (queue.length) {
      const q = queue.shift()!;
      const ticker = q.replace(/(on|x|b| Dinari)$/i, "").toUpperCase();
      for (const p of await search(q)) {
        if (!(p.chainId in chainIds)) continue;
        for (const t of [p.baseToken, p.quoteToken]) {
          const issuer = issuerOf(t.symbol ?? "", t.name ?? "", ticker);
          if (!issuer) continue;
          const key = `${p.chainId}:${t.address.toLowerCase()}`;
          const liq = Number(p.liquidity?.usd ?? 0);
          const prev = hits.get(key);
          if (!prev || liq > prev.liq) hits.set(key, { chain: p.chainId, ticker, symbol: t.symbol, name: t.name, address: t.address, issuer, liq });
        }
      }
      if (++done % 100 === 0) console.error(`searched ${done}/${universe.length * 4}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.error(`candidates: ${hits.size}`);

  // on-chain verification
  const clients = { ethereum: createPublicClient({ chain: mainnet, transport: http("https://eth.llamarpc.com") }), arbitrum: createPublicClient({ chain: arbitrum, transport: http() }), base: createPublicClient({ chain: base, transport: http() }), monad: createPublicClient({ chain: monad, transport: http() }) } as const;
  const verified: (Hit & { decimals: number; onchainSymbol: string; onchainName: string })[] = [];
  for (const h of hits.values()) {
    const pc = clients[h.chain as keyof typeof clients];
    try {
      const [sym, name, dec] = await pc.multicall({ contracts: [
        { address: h.address, abi: erc20Abi, functionName: "symbol" },
        { address: h.address, abi: erc20Abi, functionName: "name" },
        { address: h.address, abi: erc20Abi, functionName: "decimals" },
      ], allowFailure: false });
      verified.push({ ...h, address: getAddress(h.address), decimals: Number(dec), onchainSymbol: String(sym), onchainName: String(name) });
    } catch (e) { console.error("verify failed", h.chain, h.symbol, (e as Error).message.slice(0, 60)); }
  }
  verified.sort((a, b) => a.chain.localeCompare(b.chain) || a.ticker.localeCompare(b.ticker));
  writeFileSync(`${S}/discovered.json`, JSON.stringify({ universe: universe.length, names, verified }, null, 1));
  const by: Record<string, number> = {};
  for (const v of verified) by[`${v.chain}/${v.issuer}`] = (by[`${v.chain}/${v.issuer}`] ?? 0) + 1;
  console.log(JSON.stringify(by));
  for (const v of verified) console.log(v.chain.padEnd(9), v.ticker.padEnd(6), v.issuer.padEnd(14), v.onchainSymbol.padEnd(10), v.onchainName.slice(0, 40).padEnd(40), v.address, v.decimals, `$${Math.round(v.liq)}`);
}
main();
