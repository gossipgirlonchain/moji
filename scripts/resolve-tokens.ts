import { createPublicClient, http, erc20Abi, getAddress, fallback } from "viem";
import { base, mainnet, arbitrum } from "viem/chains";
import { robinhoodChain } from "../src/config/chains";
import { writeFileSync } from "node:fs";

const WANT: Record<string, string[]> = {
  robinhood: ["PONS", "AI", "ANTHROPIG", "PERPSPAD", "ANTHROPICX1L", "OPENAIX1L", "ZFORGE"],
  base: ["AERO", "VVV", "BRETT", "DEGEN", "TOSHI", "VIRTUAL", "NOCK", "ZORA", "CLANKER", "BNKR"],
  ethereum: ["UNI", "LINK", "PEPE", "AAVE", "SHIB", "ENA", "ONDO", "LDO", "COMP", "HYPE"],
  arbitrum: ["ARB", "PENDLE", "GMX", "MAGIC", "RAIN"],
  solana: ["PENGU", "PUMP", "WIF", "BONK", "JUP", "ZCAT", "ANSEM", "TRUMP", "FARTCOIN", "POPCAT", "RAY", "JTO"],
};
const clients: Record<string, any> = {
  base: createPublicClient({ chain: base, transport: fallback([http("https://base-rpc.publicnode.com"), http()]) }),
  ethereum: createPublicClient({ chain: mainnet, transport: fallback([http("https://ethereum-rpc.publicnode.com"), http()]) }),
  arbitrum: createPublicClient({ chain: arbitrum, transport: http("https://arb1.arbitrum.io/rpc") }),
  robinhood: createPublicClient({ chain: robinhoodChain, transport: http("https://rpc.mainnet.chain.robinhood.com", { fetchOptions: { headers: { "user-agent": "moji" } } }) }),
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function search(q: string) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, { headers: { "user-agent": "moji" } });
    if (r.status === 429) { await sleep(1500); continue; }
    return ((await r.json()) as any).pairs ?? [];
  }
  return [];
}
(async () => {
  const out: Record<string, any[]> = {};
  for (const [chain, syms] of Object.entries(WANT)) {
    out[chain] = [];
    for (const sym of syms) {
      const pairs = (await search(sym)).filter((p: any) => p.chainId === chain);
      // best = exact symbol match, highest liquidity
      const cands = new Map<string, { addr: string; name: string; liq: number; vol: number; img?: string }>();
      for (const p of pairs) for (const t of [p.baseToken, p.quoteToken]) {
        if ((t.symbol ?? "").toUpperCase() !== sym) continue;
        const c = cands.get(t.address) ?? { addr: t.address, name: t.name, liq: 0, vol: 0, img: p.info?.imageUrl };
        c.liq = Math.max(c.liq, Number(p.liquidity?.usd ?? 0)); c.vol += Number(p.volume?.h24 ?? 0); cands.set(t.address, c);
      }
      const best = [...cands.values()].sort((a, b) => b.liq - a.liq)[0];
      if (!best) { console.log(chain, sym, "NOT FOUND"); continue; }
      let decimals = 18, onchain = "";
      if (clients[chain]) {
        try {
          const [s, n, d] = await clients[chain].multicall({ contracts: [
            { address: best.addr, abi: erc20Abi, functionName: "symbol" }, { address: best.addr, abi: erc20Abi, functionName: "name" }, { address: best.addr, abi: erc20Abi, functionName: "decimals" }], allowFailure: false });
          decimals = Number(d); onchain = `${s}|${n}`;
        } catch (e) { onchain = "VERIFY_FAILED"; }
      }
      const rec = { ticker: sym, name: best.name, address: chain === "solana" ? best.addr : getAddress(best.addr), decimals, liq: Math.round(best.liq), vol24: Math.round(best.vol), onchain, logo: `https://dd.dexscreener.com/ds-data/tokens/${chain}/${best.addr.toLowerCase()}.png` };
      out[chain].push(rec);
      console.log(chain.padEnd(9), sym.padEnd(12), `liq $${rec.liq.toLocaleString()}`.padEnd(18), `vol $${rec.vol24.toLocaleString()}`.padEnd(18), rec.address, decimals, onchain.slice(0, 40));
      await sleep(350);
    }
  }
  writeFileSync("/private/tmp/claude-501/-Users-winny/643a238c-72f7-4137-b848-7b6844f1bedd/scratchpad/tokens.json", JSON.stringify(out, null, 1));
})();
