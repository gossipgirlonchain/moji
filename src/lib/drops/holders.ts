import "server-only";
import { parseAbiItem, type Address } from "viem";
import { getAddresses } from "@whetstone-research/doppler-sdk/evm";
import { chainById } from "@/config/chains";
import { MOJI_TREASURY } from "@/config/fees";
import { publicClientFor } from "@/lib/rpc";
import { createPublicClient, fallback, http, type Chain, type PublicClient } from "viem";
import { supabaseServer, type MojiRow } from "@/lib/supabase";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const MIN_CHUNK = 2_000n;

/**
 * Client for log scans. On Robinhood Chain the general fallback list ends at Pocket Network, which does not
 * serve historical logs ("historical state is not available"), so scans use only the RPCs that do.
 */
const scanClients = new Map<number, PublicClient>();
function scanClient(chain: Chain): PublicClient {
  let pc = scanClients.get(chain.id);
  if (pc) return pc;
  if (chain.id === 4663) {
    const urls = [process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL, "https://rpc.mainnet.chain.robinhood.com", "https://robinhood-rpc.publicnode.com"].filter((u): u is string => Boolean(u));
    const opts = { fetchOptions: { headers: { "user-agent": "moji.wtf" } }, retryCount: 2, retryDelay: 400, timeout: 20_000, batch: { batchSize: 50, wait: 10 } } as const;
    pc = createPublicClient({ chain, transport: fallback(urls.map((u) => http(u, opts)), { retryCount: 1 }) }) as PublicClient;
  } else pc = publicClientFor(chain);
  scanClients.set(chain.id, pc);
  return pc;
}
const CHUNK: Record<number, bigint> = { 4663: 60_000n, 8453: 2_000n, 1: 2_000n, 143: 2_000n };
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

/** Uniswap V4 PoolManager + UniversalRouter per chain (the SDK map does not carry them). */
const V4: Record<number, { poolManager: string; router: string }> = {
  4663: { poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951", router: "0x8876789976decbfcbbbe364623c63652db8c0904" },
  8453: { poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b", router: "0x6ff5693b99212da76ad316178a184ab56d299b43" },
};

/**
 * Addresses that hold the token but are not holders: the pool, Doppler's contracts, the launcher,
 * the treasury, the token itself, burn addresses. Always excluded from every round, on top of the
 * creator's own exclusion list.
 */
export function systemExclusions(m: MojiRow): Set<string> {
  const out = new Set<string>([ZERO, DEAD]);
  const add = (a?: string | null) => a && out.add(a.toLowerCase());
  add(m.token_address);
  add(m.creator_address);
  add(MOJI_TREASURY);
  const v4 = V4[m.chain_id];
  if (v4) {
    add(v4.poolManager);
    add(v4.router);
  }
  try {
    const a = getAddresses(m.chain_id) as unknown as Record<string, string | undefined>;
    for (const k of ["airlock", "dopplerHookInitializer", "rehypeDopplerHookInitializer", "v4MulticurveInitializer", "uniswapV4Initializer", "dopplerHookMigrator", "streamableFeesLockerV2", "bundler"]) add(a[k]);
  } catch {}
  return out;
}

export type HolderScan = { transfers: number; scannedBlock: bigint; complete: boolean; holders: number };

const blockTimeCache = new Map<string, number>();

async function blockTimes(chainId: number, blocks: bigint[]): Promise<Map<bigint, number>> {
  const chain = chainById(chainId);
  const out = new Map<bigint, number>();
  if (!chain?.viem || blocks.length === 0) return out;
  const sb = supabaseServer();
  const missing: bigint[] = [];
  for (const b of blocks) {
    const hit = blockTimeCache.get(`${chainId}:${b}`);
    if (hit !== undefined) out.set(b, hit);
    else missing.push(b);
  }
  if (missing.length) {
    const { data } = await sb.from("block_times").select("block, ts").eq("chain_id", chainId).in("block", missing.map(String));
    for (const r of (data ?? []) as { block: string | number; ts: string }[]) {
      const t = Math.floor(new Date(r.ts).getTime() / 1000);
      out.set(BigInt(r.block), t);
      blockTimeCache.set(`${chainId}:${r.block}`, t);
    }
  }
  const still = missing.filter((b) => !out.has(b));
  if (still.length) {
    const pc = scanClient(chain.viem);
    const rows: { chain_id: number; block: string; ts: string }[] = [];
    for (let i = 0; i < still.length; i += 200) {
      const batch = still.slice(i, i + 200);
      const got = await Promise.all(batch.map((b) => pc.getBlock({ blockNumber: b }).then((blk) => Number(blk.timestamp))));
      batch.forEach((b, j) => {
        out.set(b, got[j]);
        blockTimeCache.set(`${chainId}:${b}`, got[j]);
        rows.push({ chain_id: chainId, block: String(b), ts: new Date(got[j] * 1000).toISOString() });
      });
    }
    if (rows.length) await sb.from("block_times").upsert(rows, { onConflict: "chain_id,block" });
  }
  return out;
}

/**
 * Walk the moji token's Transfer logs from the launch block (or the last scanned block) to the head,
 * store every transfer, and fold them into holder_balances. Idempotent: rows are keyed on (block, log_index)
 * and the cursor only moves forward once a chunk is stored.
 */
export async function scanHolders(m: MojiRow, opts: { maxChunks?: number; budgetMs?: number } = {}): Promise<HolderScan | null> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 240_000;
  const chain = chainById(m.chain_id);
  if (!chain?.viem || !m.token_address) return null;
  const pc = scanClient(chain.viem);
  const sb = supabaseServer();

  let from: bigint;
  if (m.holders_scanned_block != null) from = BigInt(m.holders_scanned_block) + 1n;
  else if (m.tx_hash) {
    const receipt = await pc.getTransactionReceipt({ hash: m.tx_hash as `0x${string}` }).catch(() => null);
    if (!receipt) return null;
    from = receipt.blockNumber;
  } else return null;

  const head = await pc.getBlockNumber();
  const maxChunks = opts.maxChunks ?? 10;
  let chunk = CHUNK[m.chain_id] ?? 2_000n;
  let chunks = 0;
  let cursor = from;
  let total = 0;
  const token = m.token_address as Address;

  while (cursor <= head && chunks < maxChunks && Date.now() - started < budget) {
    const to = cursor + chunk - 1n > head ? head : cursor + chunk - 1n;
    let logs;
    try {
      logs = await pc.getLogs({ address: token, event: TRANSFER, fromBlock: cursor, toBlock: to });
    } catch (e) {
      // any RPC complaint (range too wide, too many results, a node without history): retry a smaller range
      if (chunk > MIN_CHUNK) {
        chunk = chunk / 4n < MIN_CHUNK ? MIN_CHUNK : chunk / 4n;
        continue;
      }
      const msg = String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? e);
      throw new Error(`could not read transfers around block ${cursor}: ${msg.split("\n")[0].slice(0, 120)}`);
    }
    if (logs.length) {
      const times = await blockTimes(m.chain_id, [...new Set(logs.map((l) => l.blockNumber))]);
      const rows = logs.map((l) => ({
        moji_id: m.id,
        block: String(l.blockNumber),
        log_index: l.logIndex,
        ts: new Date((times.get(l.blockNumber) ?? 0) * 1000).toISOString(),
        from_address: (l.args.from as string).toLowerCase(),
        to_address: (l.args.to as string).toLowerCase(),
        value: (l.args.value as bigint).toString(),
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from("token_transfers").upsert(rows.slice(i, i + 500), { onConflict: "moji_id,block,log_index" });
        if (error) throw new Error("token_transfers: " + error.message);
      }
      await applyBalances(m.id, rows, to);
      total += rows.length;
    }
    cursor = to + 1n;
    chunks++;
    await sb.from("mojis").update({ holders_scanned_block: String(to), holders_scanned_at: new Date().toISOString() }).eq("id", m.id);
  }
  const holders = await countHolders(m);
  await sb.from("mojis").update({ holders_count: holders }).eq("id", m.id);
  return { transfers: total, scannedBlock: cursor - 1n, complete: cursor > head, holders };
}

type TransferRow = { from_address: string; to_address: string; value: string; ts: string };

/** Fold a batch of transfers into holder_balances (read-modify-write per touched address). */
async function applyBalances(mojiId: string, rows: TransferRow[], block: bigint): Promise<void> {
  const sb = supabaseServer();
  const touched = new Set<string>();
  for (const r of rows) {
    touched.add(r.from_address);
    touched.add(r.to_address);
  }
  touched.delete(ZERO);
  const addrs = [...touched];
  const current = new Map<string, { balance: bigint; first_in_at: string | null; last_out_at: string | null }>();
  for (let i = 0; i < addrs.length; i += 500) {
    const { data } = await sb.from("holder_balances").select("address, balance, first_in_at, last_out_at").eq("moji_id", mojiId).in("address", addrs.slice(i, i + 500));
    for (const h of (data ?? []) as { address: string; balance: string; first_in_at: string | null; last_out_at: string | null }[]) {
      current.set(h.address, { balance: BigInt(h.balance), first_in_at: h.first_in_at, last_out_at: h.last_out_at });
    }
  }
  const get = (a: string) => {
    let c = current.get(a);
    if (!c) {
      c = { balance: 0n, first_in_at: null, last_out_at: null };
      current.set(a, c);
    }
    return c;
  };
  for (const r of rows) {
    const v = BigInt(r.value);
    if (v === 0n) continue;
    if (r.from_address !== ZERO) {
      const c = get(r.from_address);
      c.balance -= v;
      if (c.balance < 0n) c.balance = 0n; // defensive: should never happen with a complete log
      c.last_out_at = r.ts;
    }
    if (r.to_address !== ZERO) {
      const c = get(r.to_address);
      if (c.balance === 0n) c.first_in_at = r.ts;
      c.balance += v;
    }
  }
  const upserts = [...current.entries()].map(([address, c]) => ({
    moji_id: mojiId,
    address,
    balance: c.balance.toString(),
    first_in_at: c.first_in_at,
    last_out_at: c.last_out_at,
    updated_block: String(block),
  }));
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await sb.from("holder_balances").upsert(upserts.slice(i, i + 500), { onConflict: "moji_id,address" });
    if (error) throw new Error("holder_balances: " + error.message);
  }
}

async function countHolders(m: MojiRow): Promise<number> {
  const sb = supabaseServer();
  const ex = [...systemExclusions(m)];
  const { count } = await sb.from("holder_balances").select("address", { count: "exact", head: true }).eq("moji_id", m.id).gt("balance", 0).not("address", "in", `(${ex.join(",")})`);
  return count ?? 0;
}

export type HolderRow = { address: string; balance: bigint; first_in_at: string | null; last_out_at: string | null };

/** Every non-excluded address with a balance, largest first. Capped so a runaway list cannot blow the round. */
export async function loadHolders(m: MojiRow, extraExcluded: string[] = [], limit = 20_000): Promise<HolderRow[]> {
  const sb = supabaseServer();
  const ex = new Set([...systemExclusions(m), ...extraExcluded.map((a) => a.toLowerCase())]);
  const out: HolderRow[] = [];
  let fromIdx = 0;
  while (out.length < limit) {
    const { data, error } = await sb.from("holder_balances").select("address, balance, first_in_at, last_out_at").eq("moji_id", m.id).gt("balance", 0).order("balance", { ascending: false }).range(fromIdx, fromIdx + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { address: string; balance: string; first_in_at: string | null; last_out_at: string | null }[];
    for (const r of rows) if (!ex.has(r.address)) out.push({ address: r.address, balance: BigInt(r.balance), first_in_at: r.first_in_at, last_out_at: r.last_out_at });
    if (rows.length < 1000) break;
    fromIdx += 1000;
  }
  return out;
}

/** Transfers touching the moji in [since, until], oldest first. */
export async function loadTransfers(mojiId: string, since: Date, until: Date): Promise<TransferRow[]> {
  const sb = supabaseServer();
  const out: TransferRow[] = [];
  let fromIdx = 0;
  for (;;) {
    const { data, error } = await sb
      .from("token_transfers")
      .select("from_address, to_address, value, ts")
      .eq("moji_id", mojiId)
      .gte("ts", since.toISOString())
      .lte("ts", until.toISOString())
      .order("ts", { ascending: true })
      .order("block", { ascending: true })
      .order("log_index", { ascending: true })
      .range(fromIdx, fromIdx + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as TransferRow[];
    out.push(...rows);
    if (rows.length < 1000) break;
    fromIdx += 1000;
  }
  return out;
}

export type HolderSummary = {
  holders: number;
  top10Bps: number;
  poolBps: number;
  circulating: string; // wei held by real holders
  median: string; // wei
  buckets: { label: string; count: number }[];
  top: { address: string; balance: string; heldSince: string | null }[];
  scannedAt: string | null;
  scannedBlock: string | null;
};

/** Stats for the manage page and the public card. Buckets are in moji tokens, not USD, so they do not drift with price. */
export async function holderSummary(m: MojiRow, supplyWei: bigint): Promise<HolderSummary> {
  const holders = await loadHolders(m);
  const total = holders.reduce((s, h) => s + h.balance, 0n);
  const top10 = holders.slice(0, 10).reduce((s, h) => s + h.balance, 0n);
  const sb = supabaseServer();
  const v4 = V4[m.chain_id];
  let pool = 0n;
  if (v4) {
    const { data } = await sb.from("holder_balances").select("balance").eq("moji_id", m.id).eq("address", v4.poolManager).maybeSingle();
    pool = BigInt((data as { balance?: string } | null)?.balance ?? 0);
  }
  const bps = (a: bigint, b: bigint) => (b > 0n ? Number((a * 10_000n) / b) : 0);
  const edges = [1_000n, 10_000n, 100_000n, 1_000_000n, 10_000_000n].map((x) => x * 10n ** 18n);
  const labels = ["<1K", "1K–10K", "10K–100K", "100K–1M", "1M–10M", ">10M"];
  const counts = new Array(labels.length).fill(0) as number[];
  for (const h of holders) {
    let i = 0;
    while (i < edges.length && h.balance >= edges[i]) i++;
    counts[i]++;
  }
  const median = holders.length ? holders[Math.floor(holders.length / 2)].balance : 0n;
  return {
    holders: holders.length,
    top10Bps: bps(top10, total),
    poolBps: bps(pool, supplyWei),
    circulating: total.toString(),
    median: median.toString(),
    buckets: labels.map((label, i) => ({ label, count: counts[i] })),
    top: holders.slice(0, 20).map((h) => ({ address: h.address, balance: h.balance.toString(), heldSince: h.first_in_at })),
    scannedAt: m.holders_scanned_at ?? null,
    scannedBlock: m.holders_scanned_block != null ? String(m.holders_scanned_block) : null,
  };
}
