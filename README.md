# Potluck

> **Everyone brings a chunk. Every dApp gets the history.**

On-chain history for any dApp, loaded in seconds in the browser, with no servers, stored and guaranteed by [Portaldot](https://portaldot-dev.readthedocs.io/).

Built for **Portaldot Hacker House 2026** (track: Modular Cloud & Middleware).

## Status
Early development. See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the live status and plan.

## The idea in 30 seconds
- dApps need history (transfers, holders, timelines), but RPC nodes only answer "what is the state now". Today that forces every dApp to run or rent an indexer server.
- **Potluck publishers** run a declarative spec against a source chain (Polkadot Asset Hub, Kusama Asset Hub, or Portaldot itself). They store compact index chunks in **Portaldot's TransactionStorage**, where validators must keep proving they hold the data, and register a manifest in a **Solidity registry on Portaldot's pallet-revive**.
- **Browsers** download only the chunks they need via the node's `bitswap_v1_get`, **verify them against the source chain** (integrity, row truth, balance reconciliation), and keep live-tailing new blocks. No servers, no API keys.
- When syncing directly is cheap (Portaldot today), the SDK simply syncs directly. When it is expensive (days of RPC calls for Polkadot Asset Hub since smart contracts launched), it uses verified snapshots instead.

## Usage (publisher CLI)

```bash
pnpm install && pnpm build

# Index the newest 3,000 Polkadot Asset Hub blocks into verifiable chunks (resumable)
node packages/cli/dist/index.js build specs/polkadot-ah.balance-history.json --last 3000

# Check a build: integrity, independent re-index, and balance reconciliation against the chain
node packages/cli/dist/index.js verify builds/polkadot-ah.balance-history/<from>-<to> --rebuild

# Estimate publishing fees on Portaldot (no funds needed); drop --dry-run to publish
node packages/cli/dist/index.js publish builds/... --dry-run --from-address <ss58>

# Demo: forge a build that passes integrity checks, then watch verify catch it
node packages/cli/dist/index.js tamper builds/... --out /tmp/forged
node packages/cli/dist/index.js verify /tmp/forged --rebuild
```

## Documentation
- [Concept](docs/POTLUCK.md)
- [Architecture & MVP scope](docs/ARCHITECTURE.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Documentation index](docs/README.md)

## License
MIT
