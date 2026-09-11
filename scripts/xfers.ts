import { createPublicClient, erc20Abi, formatUnits } from "viem";
import { robinhoodChain } from "../src/config/chains";
import { transportFor } from "../src/lib/rpc";
(async () => {
  const pc = createPublicClient({ chain: robinhoodChain, transport: transportFor(robinhoodChain) });
  const MSFT = "0x21B8f8b8b8Ee9B9b1c0e5b5C7f5C3e2b0d8E7f9A" as const;
})();
