import { parseSpec } from "@potluck/spec";
import recoveryTimeline from "../../../specs/kusama-ah.recovery-timeline.json";
import balanceHistory from "../../../specs/polkadot-ah.balance-history.json";
import unifiedHistory from "../../../specs/portaldot-v3-testnet.unified-history.json";

/** Public Portaldot V3 testnet endpoints (CLAUDE.md §7). */
export const PORTALDOT = {
  name: "Portaldot V3 testnet",
  ws: "wss://test-node-v3.portaldot.dev",
  evmRpc: "https://test-evm-rpc-v3.portaldot.dev",
  /**
   * PotluckRegistry (EVM build), deployed 2026-10-21 at block #129,014
   * (contracts/deployments/portaldot-v3-testnet.json).
   */
  registry: "0xef9305561eb0c34d205dfa0d9099a105f44282eb" as `0x${string}` | null,
};

export const UNIFIED_SPEC = parseSpec(unifiedHistory);
export const UNIFIED_SPEC_NAME = "portaldot-v3-testnet.unified-history";

/** Every spec in the repository, in catalog order. */
export const SPECS = [
  {
    file: "portaldot-v3-testnet.unified-history",
    spec: UNIFIED_SPEC,
    chainLabel: "Portaldot V3 testnet",
  },
  {
    file: "polkadot-ah.balance-history",
    spec: parseSpec(balanceHistory),
    chainLabel: "Polkadot Asset Hub",
  },
  {
    file: "kusama-ah.recovery-timeline",
    spec: parseSpec(recoveryTimeline),
    chainLabel: "Kusama Asset Hub",
  },
];
