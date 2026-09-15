/**
 * Deploy the MojiDrops escrow (contracts/MojiDrops.sol) to Robinhood Chain (4663).
 *
 *   SEED_PRIVATE_KEY=0x... DROPS_OPERATOR=0x... NEXT_PUBLIC_MOJI_TREASURY=0x... npx tsx scripts/deploy-drops.ts [chainId]
 *
 * SEED_PRIVATE_KEY pays the deploy and becomes the contract owner (use the treasury key).
 * DROPS_OPERATOR is the address that pays rounds: the wallet behind DROPS_OPERATOR_PRIVATE_KEY on the
 * server. It only needs a little ETH for gas; it never holds campaign funds. Defaults to the deployer.
 * The processing fee on payouts goes to DROPS_FEE_RECIPIENT (default: the treasury, then the deployer)
 * at DROPS_FEE_BPS (default 50 = 0.5%, max 500). Prints the address to put in NEXT_PUBLIC_DROPS_CONTRACT.
 */
import { createPublicClient, createWalletClient, http, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainById } from "../src/config/chains";
import artifact from "../src/lib/drops/MojiDrops.json";

const pk = process.env.SEED_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("Set SEED_PRIVATE_KEY");
const chainId = Number(process.argv[2] ?? 4663);
const chain = chainById(chainId)?.viem;
if (!chain) throw new Error(`unknown chain ${chainId}`);
const account = privateKeyToAccount(pk);
const operator = (process.env.DROPS_OPERATOR ?? account.address) as Address;
if (!isAddress(operator)) throw new Error("DROPS_OPERATOR is not an address");
const feeRecipient = (process.env.DROPS_FEE_RECIPIENT ?? process.env.NEXT_PUBLIC_MOJI_TREASURY ?? account.address) as Address;
if (!isAddress(feeRecipient)) throw new Error("DROPS_FEE_RECIPIENT is not an address");
const feeBps = Number(process.env.DROPS_FEE_BPS ?? 50);
if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 500) throw new Error("DROPS_FEE_BPS must be 0..500");

const pc = createPublicClient({ chain, transport: http() });
const wc = createWalletClient({ chain, account, transport: http() });

async function main() {
  console.log(`deploying MojiDrops to ${chain!.name} from ${account.address}, operator ${operator}, fee ${feeBps} bps → ${feeRecipient}`);
  const hash = await wc.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode as `0x${string}`, args: [operator, feeRecipient, feeBps] });
  console.log("tx", hash);
  const receipt = await pc.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("deploy failed");
  console.log(`MojiDrops at ${receipt.contractAddress}`);
  console.log(`\nNEXT_PUBLIC_DROPS_CONTRACT=${receipt.contractAddress}\nNEXT_PUBLIC_DROPS_FEE_BPS=${feeBps}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
