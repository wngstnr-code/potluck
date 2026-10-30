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
   * PotluckRegistry deployments in order of preference: the PVM build (resolc, block #236,926),
   * then the EVM build (block #129,014) as the fallback. Both list every published manifest
   * (contracts/deployments/portaldot-v3-testnet.json).
   */
  registries: [
    "0x528fc6d14a8b1cf4474d2999313f74533cf083b4",
    "0xef9305561eb0c34d205dfa0d9099a105f44282eb",
  ] as readonly `0x${string}`[],
};

/** Polkadot Asset Hub: the heavy source chain whose newest window is published on Portaldot. */
export const POLKADOT_AH = {
  name: "Polkadot Asset Hub",
  ws: "wss://polkadot-asset-hub-rpc.polkadot.io",
  symbol: "DOT",
  decimals: 10,
  ss58: 0,
};

export const AH_SPEC = parseSpec(balanceHistory);
export const AH_SPEC_NAME = "polkadot-ah.balance-history";

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
    spec: AH_SPEC,
    chainLabel: "Polkadot Asset Hub",
  },
  {
    file: "kusama-ah.recovery-timeline",
    spec: parseSpec(recoveryTimeline),
    chainLabel: "Kusama Asset Hub",
  },
];
