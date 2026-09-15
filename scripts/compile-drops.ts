/**
 * Compile contracts/MojiDrops.sol with solc and write the ABI + bytecode to src/lib/drops/MojiDrops.json.
 *
 *   npm run drops:compile
 *
 * Re-run after editing the contract. The JSON is committed so the app and the deploy script never
 * need solc at runtime.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const solc = require("solc") as { compile: (input: string) => string; version: () => string };

const src = readFileSync(resolve("contracts/MojiDrops.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "MojiDrops.sol": { content: src } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input))) as {
  errors?: { severity: string; formattedMessage: string }[];
  contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string }; deployedBytecode: { object: string } } }>>;
};
for (const e of out.errors ?? []) {
  console.error(e.formattedMessage);
}
if (out.errors?.some((e) => e.severity === "error")) process.exit(1);
const c = out.contracts["MojiDrops.sol"].MojiDrops;
mkdirSync(resolve("src/lib/drops"), { recursive: true });
writeFileSync(
  resolve("src/lib/drops/MojiDrops.json"),
  JSON.stringify({ compiler: solc.version(), abi: c.abi, bytecode: "0x" + c.evm.bytecode.object, deployedBytecode: "0x" + c.evm.deployedBytecode.object }, null, 2) + "\n",
);
console.log(`MojiDrops compiled with solc ${solc.version()}: ${c.evm.deployedBytecode.object.length / 2} bytes`);
