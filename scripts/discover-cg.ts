import { createPublicClient, erc20Abi, getAddress, fallback, http, type Address } from "viem";
import { mainnet, arbitrum, base, monad } from "viem/chains";
import { writeFileSync } from "node:fs";
const S = "/private/tmp/claude-501/-Users-winny/643a238c-72f7-4137-b848-7b6844f1bedd/scratchpad";
const PLAT: Record<string, { key: string; chain: any; rpcs: string[] }> = {
  ethereum: { key: "ethereum", chain: mainnet, rpcs: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://rpc.ankr.com/eth"] },
  "arbitrum-one": { key: "arbitrum", chain: arbitrum, rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"] },
  base: { key: "base", chain: base, rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"] },
  monad: { key: "monad", chain: monad, rpcs: ["https://rpc.monad.xyz"] },
};
const issuerOf = (name: string, sym: string): string | null => {
  const n = name.toLowerCase(); const s = sym.toLowerCase();
  if (n.includes("ondo tokenized") || (n.includes("ondo") && s.endsWith("on"))) return "ondo";
  if (n.includes("xstock") || (s.endsWith("x") && n.includes("stock"))) return "xstocks";
  if (n.includes("dinari") || n.includes("dshare") || s.endsWith(".d")) return "dinari";
  if (n.includes("backed ") || (s.startsWith("b") && n.includes("backed"))) return "backed";
  if (n.includes("bstock")) return "bstocks";
  return null;
};
async function main() {
  const r = await fetch("https://api.coingecko.com/api/v3/coins/list?include_platform=true", { headers: { "user-agent": "moji" } });
  const coins = (await r.json()) as { id: string; symbol: string; name: string; platforms: Record<string, string> }[];
  console.error("coins", coins.length);
  const cands: { chain: string; id: string; symbol: string; name: string; address: string; issuer: string }[] = [];
  for (const c of coins) {
    const issuer = issuerOf(c.name, c.symbol);
    if (!issuer) continue;
    for (const [plat, addr] of Object.entries(c.platforms ?? {})) {
      if (!(plat in PLAT) || !addr) continue;
      cands.push({ chain: PLAT[plat].key, id: c.id, symbol: c.symbol.toUpperCase(), name: c.name, address: addr, issuer });
    }
  }
  console.error("candidates", cands.length);
  const clients: Record<string, any> = {};
  for (const p of Object.values(PLAT)) clients[p.key] = createPublicClient({ chain: p.chain, transport: fallback(p.rpcs.map((u) => http(u, { retryCount: 2, timeout: 15000 }))) });
  const verified: any[] = [];
  for (const c of cands) {
    try {
      const [sym, name, dec] = await clients[c.chain].multicall({ contracts: [
        { address: c.address as Address, abi: erc20Abi, functionName: "symbol" },
        { address: c.address as Address, abi: erc20Abi, functionName: "name" },
        { address: c.address as Address, abi: erc20Abi, functionName: "decimals" },
      ], allowFailure: false });
      verified.push({ ...c, address: getAddress(c.address), onchainSymbol: String(sym), onchainName: String(name), decimals: Number(dec) });
    } catch (e) { console.error("verify failed", c.chain, c.symbol, (e as Error).message.slice(0, 50)); }
  }
  verified.sort((a, b) => a.chain.localeCompare(b.chain) || a.issuer.localeCompare(b.issuer) || a.symbol.localeCompare(b.symbol));
  writeFileSync(`${S}/discovered-cg.json`, JSON.stringify(verified, null, 1));
  const by: Record<string, number> = {};
  for (const v of verified) by[`${v.chain}/${v.issuer}`] = (by[`${v.chain}/${v.issuer}`] ?? 0) + 1;
  console.log(JSON.stringify(by));
  for (const v of verified) console.log(v.chain.padEnd(9), v.issuer.padEnd(8), v.onchainSymbol.padEnd(10), v.onchainName.slice(0, 44).padEnd(44), v.address, v.decimals);
}
main();
