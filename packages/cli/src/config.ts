/** Default public archive endpoints per spec `source.chain`. Override with --endpoint. */
export const KNOWN_ENDPOINTS: Record<string, string> = {
  "polkadot-asset-hub": "wss://polkadot-asset-hub-rpc.polkadot.io",
  "kusama-asset-hub": "wss://kusama-asset-hub-rpc.polkadot.io",
  "portaldot-v3-testnet": "wss://test-node-v3.portaldot.dev",
};

export const PORTALDOT = {
  ws: process.env.PORTALDOT_WS ?? "wss://test-node-v3.portaldot.dev",
  evmRpc: process.env.PORTALDOT_EVM_RPC ?? "https://test-evm-rpc-v3.portaldot.dev",
  chainId: Number(process.env.PORTALDOT_CHAIN_ID ?? 420420777),
};

export const TOOL = "potluck-cli/0.1.0";
