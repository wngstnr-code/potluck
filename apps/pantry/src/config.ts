import { parseSpec } from "@potluck/spec";
import unifiedHistory from "../../../specs/portaldot-v3-testnet.unified-history.json";

/** Public Portaldot V3 testnet endpoints (CLAUDE.md §7). */
export const PORTALDOT = {
  name: "Portaldot V3 testnet",
  ws: "wss://test-node-v3.portaldot.dev",
  evmRpc: "https://test-evm-rpc-v3.portaldot.dev",
  /** PotluckRegistry address; null until the registry is deployed (needs tPOT). */
  registry: null as `0x${string}` | null,
};

export const UNIFIED_SPEC = parseSpec(unifiedHistory);
export const UNIFIED_SPEC_NAME = "portaldot-v3-testnet.unified-history";
