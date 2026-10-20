/** Kusama Asset Hub: where real inheritance plans live today (spike S7). */
export const KUSAMA_AH = {
  name: "Kusama Asset Hub",
  ws: "wss://kusama-asset-hub-rpc.polkadot.io",
  ss58: 2,
  decimals: 12,
  symbol: "KSM",
  /** Recovery measures delays in relay-chain blocks; Kusama relay blocks are 6 s. */
  relayBlockSeconds: 6,
  explorerBlock: (n: number) => `https://assethub-kusama.subscan.io/block/${n}`,
};

/** Portaldot V3 testnet: where a user can set up their own plan (CLAUDE.md §7). */
export const PORTALDOT = {
  name: "Portaldot V3 testnet",
  ws: "wss://test-node-v3.portaldot.dev",
  ss58: 42,
  decimals: 14,
  symbol: "tPOT",
  blockSeconds: 6,
};
