import "server-only";
import { decodeAbiParameters, decodeFunctionData, type Address, type Hex } from "viem";
import { airlockAbi, bundlerAbi, getAddresses, parseAirlockCreateReceipt } from "@whetstone-research/doppler-sdk/evm";
import { chainById } from "@/config/chains";
import { MOJI_INTEGRATOR, MOJI_TREASURY, SHARE_PROTOCOL, SHARE_TREASURY } from "@/config/fees";
import { publicClientFor } from "./rpc";

const beneficiaryComponents = [
  { name: "beneficiary", type: "address" },
  { name: "shares", type: "uint96" },
] as const;
const curveComponents = [
  { type: "int24", name: "tickLower" },
  { type: "int24", name: "tickUpper" },
  { type: "uint16", name: "numPositions" },
  { type: "uint256", name: "shares" },
] as const;
/** Layout the SDK uses for MulticurveBuilder + Rehype hook pool initializer data. */
const multicurveHookData = [
  {
    type: "tuple",
    components: [
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "farTick", type: "int24" },
      { name: "curves", type: "tuple[]", components: curveComponents },
      { name: "beneficiaries", type: "tuple[]", components: beneficiaryComponents },
      { name: "dopplerHook", type: "address" },
      { name: "onInitializationDopplerHookCalldata", type: "bytes" },
      { name: "graduationDopplerHookCalldata", type: "bytes" },
    ],
  },
] as const;

export type LaunchVerification = { ok: true; poolOrHook: Address; blockNumber: bigint } | { ok: false; reason: string };

const eq = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/**
 * Trust nothing the client says about a launch except the tx hash. The chain must show:
 * the creator sent the tx to Doppler's Airlock (or to Doppler's Bundler, which creates and dev-buys in one tx),
 * it created exactly this token against this numeraire, the pool's fee beneficiaries carry the moji treasury and
 * protocol shares and the creator's share goes to the creator (or the fee recipient they named), and the
 * integrator is ours. The integrator alone is spoofable, so the beneficiaries are the real proof.
 */
export async function verifyLaunchTx(input: {
  chainId: number;
  txHash: Hex;
  tokenAddress: Address;
  creatorAddress: Address;
  numeraire: Address;
  /** who sent the tx when it was not the creator (sponsored launches); the creator must still be a fee beneficiary */
  sender?: Address;
  /** who the creator's fee share was pointed at, when not the creator */
  feeRecipient?: Address | null;
}): Promise<LaunchVerification> {
  const chain = chainById(input.chainId);
  if (!chain?.viem) return { ok: false, reason: "unsupported chain" };
  const pc = publicClientFor(chain.viem);
  const addrs = getAddresses(input.chainId) as unknown as Record<string, Address | undefined>;
  const airlock = addrs.airlock;
  if (!airlock) return { ok: false, reason: "no airlock on this chain" };

  const [receipt, tx] = await Promise.all([pc.getTransactionReceipt({ hash: input.txHash }).catch(() => null), pc.getTransaction({ hash: input.txHash }).catch(() => null)]);
  if (!receipt || !tx) return { ok: false, reason: "launch tx not found yet" };
  if (receipt.status !== "success") return { ok: false, reason: "launch tx reverted" };
  if (!eq(receipt.from, input.sender ?? input.creatorAddress)) return { ok: false, reason: input.sender ? "tx sender is not the sponsor" : "tx sender is not the creator" };
  const bundler = addrs.bundler;
  const bundled = Boolean(bundler) && eq(tx.to, bundler);
  if (!eq(tx.to, airlock) && !bundled) return { ok: false, reason: "tx did not go to the Doppler Airlock or Bundler" };

  const created = parseAirlockCreateReceipt({ receipt, expectedAirlock: airlock });
  if (!created) return { ok: false, reason: "no Airlock Create event in tx" };
  if (!eq(created.tokenAddress, input.tokenAddress)) return { ok: false, reason: "token address does not match the launch tx" };
  if (!eq(created.numeraire, input.numeraire)) return { ok: false, reason: "pair does not match the launch tx" };

  let params: { integrator: Address; poolInitializer: Address; poolInitializerData: Hex };
  try {
    if (bundled) {
      // Bundler.bundle(createData, vestingData, exactAmountIn, recipient): the create params are the first argument.
      const d = decodeFunctionData({ abi: bundlerAbi, data: tx.input });
      if (d.functionName !== "bundle") return { ok: false, reason: "tx is not a Bundler bundle" };
      params = (d.args as unknown as [typeof params])[0];
    } else {
      const d = decodeFunctionData({ abi: airlockAbi, data: tx.input });
      if (d.functionName !== "create") return { ok: false, reason: "tx is not an Airlock create" };
      params = (d.args as unknown as [typeof params])[0];
    }
  } catch {
    return { ok: false, reason: "could not decode the launch calldata" };
  }
  if (!eq(params.integrator, MOJI_INTEGRATOR)) return { ok: false, reason: "integrator is not moji" };

  let beneficiaries: readonly { beneficiary: Address; shares: bigint }[];
  let hook: Address;
  try {
    const [decoded] = decodeAbiParameters(multicurveHookData, params.poolInitializerData);
    beneficiaries = decoded.beneficiaries;
    hook = decoded.dopplerHook;
  } catch {
    return { ok: false, reason: "pool config is not a moji multicurve launch" };
  }
  if (!eq(hook, addrs.rehypeDopplerHookInitializer)) return { ok: false, reason: "pool does not use the moji fee hook" };
  const share = (who: Address) => beneficiaries.filter((b) => eq(b.beneficiary, who)).reduce((s, b) => s + b.shares, 0n);
  if (share(MOJI_TREASURY) < SHARE_TREASURY) return { ok: false, reason: "treasury fee share missing" };
  const earner = input.feeRecipient ?? input.creatorAddress;
  const protocolOwner = beneficiaries.find((b) => b.shares === SHARE_PROTOCOL && !eq(b.beneficiary, MOJI_TREASURY) && !eq(b.beneficiary, earner));
  const earnerShare = share(earner);
  if (!protocolOwner && !eq(earner, MOJI_TREASURY)) return { ok: false, reason: "protocol fee share missing" };
  if (earnerShare === 0n) return { ok: false, reason: input.feeRecipient ? "the named fee recipient is not a fee beneficiary" : "creator is not a fee beneficiary" };

  return { ok: true, poolOrHook: created.poolOrHookAddress as Address, blockNumber: receipt.blockNumber };
}
