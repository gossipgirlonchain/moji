import { createPublicClient, http, erc20Abi, fallback } from "viem";
import { base, bsc, mainnet } from "viem/chains";
const eth = createPublicClient({ chain: mainnet, transport: fallback([http("https://ethereum-rpc.publicnode.com"), http("https://eth.drpc.org")]) });
const bs = createPublicClient({ chain: base, transport: fallback([http("https://base-rpc.publicnode.com"), http()]) });
const bn = createPublicClient({ chain: bsc, transport: fallback([http("https://bsc-dataseed.bnbchain.org"), http("https://bsc-rpc.publicnode.com")]) });
const BSC = { CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", BTCB: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" } as const;
const ETH = { UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", PEPE: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", ENA: "0x57e114B691Db790C35207b2e685D4A43181e6061", COMP: "0xc00e94Cb662C3520282E6f5717214004A7f26888" } as const;
const CB = { AAPLc: "0xb200000000000000000000c2e324d24d7eecd1fb", AMZNc: "0xb200000000000000000000d9192b6b456483c2e8", MSTRc: "0xb2000000000000000000004884b426556b92883d", MSFTc: "0xb200000000000000000000ab99cfa739e253872b", TSLAc: "0xb2000000000000000000001e800a7f5189430cd0" } as const;
const SOL = { PENGU: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv", WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", PUMP: "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn", TRUMP: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN", FARTCOIN: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump", POPCAT: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", JTO: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL" } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function ds(chain: string, addr: string) {
  const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain}/${addr}`, { headers: { "user-agent": "moji" } });
  const ps = ((await r.json()) as any[]) ?? [];
  const real = ps.filter((p) => Number(p.volume?.h24 ?? 0) > 1000);
  const liq = Math.max(0, ...real.map((p) => Number(p.liquidity?.usd ?? 0)));
  const vol = real.reduce((t, p) => t + Number(p.volume?.h24 ?? 0), 0);
  return { liq: Math.round(liq), vol: Math.round(vol), sym: ps[0]?.baseToken?.address?.toLowerCase() === addr.toLowerCase() ? ps[0]?.baseToken?.symbol : ps[0]?.quoteToken?.symbol, name: ps[0]?.baseToken?.address?.toLowerCase() === addr.toLowerCase() ? ps[0]?.baseToken?.name : ps[0]?.quoteToken?.name, img: ps[0]?.info?.imageUrl };
}
(async () => {
  console.log("=== ethereum");
  for (const [sym, a] of Object.entries(ETH)) {
    const [s, n, d] = await eth.multicall({ contracts: [{ address: a.toLowerCase() as `0x${string}`, abi: erc20Abi, functionName: "symbol" }, { address: a.toLowerCase() as `0x${string}`, abi: erc20Abi, functionName: "name" }, { address: a.toLowerCase() as `0x${string}`, abi: erc20Abi, functionName: "decimals" }], allowFailure: false });
    const m = await ds("ethereum", a); await sleep(300);
    console.log(sym.padEnd(6), `${s}|${n}`.padEnd(30), "dec", d, `liq $${m.liq.toLocaleString()}`.padEnd(18), `vol $${m.vol.toLocaleString()}`, a);
  }
  console.log("=== base coinbase stocks");
  for (const [sym, a] of Object.entries(CB)) {
    const [s, n, d] = await bs.multicall({ contracts: [{ address: a as `0x${string}`, abi: erc20Abi, functionName: "symbol" }, { address: a as `0x${string}`, abi: erc20Abi, functionName: "name" }, { address: a as `0x${string}`, abi: erc20Abi, functionName: "decimals" }], allowFailure: false });
    const m = await ds("base", a); await sleep(300);
    console.log(sym.padEnd(6), `${s}|${n}`.padEnd(30), "dec", d, `liq $${m.liq.toLocaleString()}`.padEnd(18), `vol $${m.vol.toLocaleString()}`);
  }
  console.log("=== bsc");
  for (const [sym, a] of Object.entries(BSC)) {
    const [s, n, d] = await bn.multicall({ contracts: [{ address: a as `0x${string}`, abi: erc20Abi, functionName: "symbol" }, { address: a as `0x${string}`, abi: erc20Abi, functionName: "name" }, { address: a as `0x${string}`, abi: erc20Abi, functionName: "decimals" }], allowFailure: false });
    const m = await ds("bsc", a); await sleep(300);
    console.log(sym.padEnd(6), `${s}|${n}`.padEnd(30), "dec", d, `liq $${m.liq.toLocaleString()}`.padEnd(18), `vol $${m.vol.toLocaleString()}`, a);
  }
  console.log("=== solana (dexscreener only)");
  for (const [sym, a] of Object.entries(SOL)) {
    const m = await ds("solana", a); await sleep(300);
    console.log(sym.padEnd(9), `${m.sym}|${String(m.name).slice(0, 22)}`.padEnd(32), `liq $${m.liq.toLocaleString()}`.padEnd(18), `vol $${m.vol.toLocaleString()}`, a);
  }
})();
