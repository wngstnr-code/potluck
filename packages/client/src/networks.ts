import type { Hex } from "viem";

/** Everything a client needs to find and verify published histories on one Portaldot network. */
export interface PotluckNetwork {
  name: string;
  portaldot: {
    /** Substrate WebSocket endpoint (bitswap_v1_get, ReviveApi). */
    ws: string;
    /** EVM JSON-RPC endpoint (CORS-enabled), used to read the registry. */
    evmRpc: string;
    /** PotluckRegistry deployments in order of preference; their listings are merged. */
    registries: readonly Hex[];
  };
  /** Public archive endpoints per spec `source.chain`. */
  endpoints: Readonly<Record<string, string>>;
  /**
   * Known specs by name → spec hash. Anyone can register a spec under any name, so names resolve
   * only through this list; the spec itself is fetched from TransactionStorage and hash-checked.
   */
  specs: Readonly<Record<string, Hex>>;
}

/** Public Portaldot V3 testnet (contracts/deployments/portaldot-v3-testnet.json). */
export const PORTALDOT_TESTNET: PotluckNetwork = {
  name: "Portaldot V3 testnet",
  portaldot: {
    ws: "wss://test-node-v3.portaldot.dev",
    evmRpc: "https://test-evm-rpc-v3.portaldot.dev",
    // PVM build (resolc, block #236,926) first, EVM build (block #129,014) as the fallback.
    // Both list every published manifest.
    registries: [
      "0x528fc6d14a8b1cf4474d2999313f74533cf083b4",
      "0xef9305561eb0c34d205dfa0d9099a105f44282eb",
    ],
  },
  endpoints: {
    "polkadot-asset-hub": "wss://polkadot-asset-hub-rpc.polkadot.io",
    "kusama-asset-hub": "wss://kusama-asset-hub-rpc.polkadot.io",
    "portaldot-v3-testnet": "wss://test-node-v3.portaldot.dev",
  },
  specs: {
    "portaldot-v3-testnet.unified-history":
      "0x756d5a78674aeebbf3dcf936e2e470eebff14ddfd2b3bb8f8f153541274eb96e",
    "polkadot-ah.balance-history":
      "0x1bd447237d82d6d6f0b64d6bedeea08b20f71782081e6a48cbcea36f8af58fc6",
    "kusama-ah.recovery-timeline":
      "0xa98c571ca9a0f037c37a9327a8bf6afe5fa0a61c6413cfdabfef933172e5d173",
  },
};

export const NETWORKS = { "portaldot-testnet": PORTALDOT_TESTNET } as const;
export type NetworkName = keyof typeof NETWORKS;
