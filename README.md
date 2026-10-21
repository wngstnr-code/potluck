# Potluck

> **Everyone brings a chunk. Every dApp gets the history.**

On-chain history for any dApp, loaded in the browser with no servers, stored and guaranteed by [Portaldot](https://portaldot-dev.readthedocs.io/), and verified against the chain it came from.

**Live:** [Pantry](https://wngstnr-code.github.io/potluck/pantry/) · [Wasiat-lite](https://wngstnr-code.github.io/potluck/wasiat/) (static files on GitHub Pages; every number is read from the chains in your browser).

Built for **Portaldot Hacker House 2026** (track: Modular Cloud & Middleware). Solo project by [@wngstnr-code](https://github.com/wngstnr-code).

## The problem
RPC nodes answer "what is the state now", but dApps need history: transfers, holders, who inherited what, and when.
- Today every dApp runs or rents an indexer server.
- Users have to trust that server's database.
- When the server goes away, the history goes with it.

## The idea
- **Publishers** run a declarative JSON spec against a source chain (Polkadot Asset Hub, Kusama Asset Hub, or Portaldot itself).
  - They store compact, canonical index chunks in **Portaldot's TransactionStorage**, where validators must keep proving they hold the data.
  - They register a manifest in **`PotluckRegistry.sol` on Portaldot's pallet-revive** (one Solidity source, deployed to both PVM and EVM).
- **Browsers** fetch only the chunks they need through the node's `bitswap_v1_get`. Then they **verify them against the source chain**, not against the publisher:

  | Level | Check | Catches |
  |---|---|---|
  | L1 · Integrity | digest, raw hash, canonical encoding, bloom | corrupted or swapped chunks |
  | L2 · Row truth | each row re-derived from its block's events | invented or altered rows |
  | L3 · Reconciliation | balance before + every row's effect = balance after, for every account and window | **hidden rows**, even when every hash was forged |

- **Adaptive sync.** When direct sync is cheap (Portaldot today: ~2.5 min from genesis in a browser), the SDK syncs directly. When it is not (Polkadot Asset Hub: days of RPC calls), it uses verified snapshots. A lying publisher is caught, flagged on chain, and skipped.

## Architecture

```mermaid
flowchart TB
  subgraph Source["Source chains (archive RPC)"]
    PAH["Polkadot Asset Hub"]
    KAH["Kusama Asset Hub"]
    PDT["Portaldot V3"]
  end

  subgraph Publisher["Publisher (potluck CLI)"]
    SPEC["JSON spec"] --> BUILD["build: decode events with the<br/>runtime that executed each block"]
    BUILD --> CHUNKS["canonical NDJSON chunks<br/>gzip · raw hash · bloom · Merkle root"]
  end

  subgraph Portaldot["Portaldot V3"]
    TS["TransactionStorage<br/>chunks + manifest blobs"]
    REG["PotluckRegistry.sol<br/>pallet-revive · PVM + EVM"]
  end

  subgraph Browser["Browser apps (static files)"]
    SDK["@potluck/client<br/>coverage plan · bloom-filtered loading"]
    VERIFY["L1 integrity · L2 row truth · L3 reconciliation"]
    APPS["Pantry · Wasiat-lite"]
  end

  Source -->|events| BUILD
  CHUNKS -->|store| TS
  CHUNKS -->|publish manifest| REG
  REG -->|eth_call latest| SDK
  TS -->|bitswap_v1_get| SDK
  SDK --> VERIFY
  Source -->|blocks + state| VERIFY
  VERIFY --> APPS
  VERIFY -.->|flag forged manifest| REG
```

## What runs today (measured)

| Component | Result |
|---|---|
| Portaldot V3 unified history (native + EVM/PVM tokens), CLI | 116,549 blocks → 2,176 rows in 158 s; `verify --rebuild` reconciles 899 / 899 accounts |
| Same history in the browser (Pantry) | 2,248 rows / 912 accounts loaded by direct sync in 2 min 25 s; 905 / 905 account checks reconciled in 22.7 s; live tail follows new blocks |
| Verify one account (Pantry) | 183 rows re-derived from 94 blocks (L2) + balance reconciled (L3) in 1.8 s |
| Attack demo (Pantry) | Forged chunk with every hash recomputed passes L1 and L2. L3 catches it (903 / 904) with the exact hidden amount as the difference |
| Inheritance plans (Wasiat-lite) | 121 plans, 14 open attempts, 13 inheritors on Kusama AH; every account's timeline replays to its current storage (133 / 133) |
| Runtime-version map (each block is decoded with the runtime that executed it) | built from `System.LastRuntimeUpgrade` reads in parallel: Portaldot genesis → head in 1.9 s (22 s before); live-tested on Polkadot AH's upgrade boundaries |

## Deployment (Portaldot V3 testnet)

| Item | Value |
|---|---|
| `PotluckRegistry` (PVM) | pending: awaiting tPOT (deposit ≈ 3,293 tPOT, measured by dry run) |
| `PotluckRegistry` (EVM) | pending: awaiting tPOT (deposit ≈ 433 tPOT) |
| First manifests | pending: builds ready locally (Portaldot unified history; newest 1.5 M Polkadot AH blocks) |

The contracts are tested (21 Foundry tests, 100% coverage) and both bytecodes pass `ReviveApi.instantiate` dry runs on the live testnet.

## Run it

Requirements: Node ≥ 22, pnpm 10.

```bash
pnpm install && pnpm build

# Pantry: browse, load and verify histories in the browser
pnpm --filter @potluck/pantry dev        # http://localhost:5173

# Wasiat-lite: inheritance plans and verified timelines; set up a plan on Portaldot
pnpm --filter @potluck/wasiat dev        # next free port, e.g. http://localhost:5174

# Static builds (deploy the dist/ folders anywhere)
pnpm --filter @potluck/pantry build && pnpm --filter @potluck/wasiat build
```

### Publisher CLI

```bash
# Index a range into verifiable chunks (resumable). --last N for the newest N blocks.
node packages/cli/dist/index.js build specs/portaldot-v3-testnet.unified-history.json

# Check a build: integrity, independent re-index, and balance reconciliation against the chain
node packages/cli/dist/index.js verify builds/portaldot-v3-testnet.unified-history/<from>-<to> --rebuild

# Estimate publishing fees on Portaldot (no funds needed); drop --dry-run to publish
node packages/cli/dist/index.js publish builds/... --dry-run --from-address <ss58>

# Keep it current: index new blocks, verify, publish, renew what expires within a day
node packages/cli/dist/index.js sync specs/portaldot-v3-testnet.unified-history.json --registry <h160>

# Renew only (TransactionStorage keeps data ~7 days; a renewal costs ≈ 0.012 tPOT per blob)
node packages/cli/dist/index.js renew builds/... --registry <h160>

# Demo: forge a build that passes integrity checks, then watch verify catch it
node packages/cli/dist/index.js tamper builds/... --out /tmp/forged
node packages/cli/dist/index.js verify /tmp/forged --rebuild
```

### Tests

```bash
pnpm test                       # offline tests on recorded real chain data
POTLUCK_LIVE=1 pnpm test        # adds live tests against Polkadot AH, Kusama AH and Portaldot
pnpm test:contracts             # Foundry tests for PotluckRegistry
```

## Repository

| Path | What |
|---|---|
| `packages/spec` | Spec schema (zod), validation, canonical hash |
| `packages/core` | RPC, runtime-aware decoding, rows, chunks, manifests, L1/L2/L3 verification |
| `packages/client` | Browser SDK: snapshot + direct sync, account history, live tail, registry/bitswap source |
| `packages/cli` | Publisher CLI: build, verify, publish, renew, sync, tamper |
| `packages/theme`, `packages/ui` | Design tokens, fonts, shared React shell |
| `apps/pantry` | Catalog, overview, verify account, attack demo |
| `apps/wasiat` | Wasiat-lite: Recovery-pallet inheritance plans and timelines |
| `contracts` | `PotluckRegistry.sol`, Foundry tests, PVM/EVM build and deploy scripts |
| `specs` | Portaldot unified history, Polkadot AH balance history, Kusama AH recovery timeline |
| `spikes` | Measurements behind the design (runtime decoding, fees, reconciliation, throughput) |

## Documentation
- [Concept](docs/POTLUCK.md)
- [Architecture, formats and decisions](docs/ARCHITECTURE.md)
- [Development status and plan](docs/DEVELOPMENT.md)
- [Design system](docs/DESIGN.md)
- [Documentation index](docs/README.md)

## Open-source dependencies
Polkadot.js (`@polkadot/api`, `types`, `util`, `extension-dapp`), viem, zod, React, Vite, TanStack Virtual, Foundry, resolc, IBM Plex (via Fontsource), Biome and Vitest.

## License
MIT
