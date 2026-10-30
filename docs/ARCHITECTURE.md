# Potluck: Detailed Architecture & MVP Scope

> 2026-10-20. Concept: [POTLUCK.md](./POTLUCK.md). All technical numbers were measured directly from the chains unless marked *(assumption)*.

---

## 0. Technical facts that constrain the design

| Fact | Measured value | Design implication |
|---|---|---|
| Runtime execution on the public Portaldot node | `state_getRuntimeVersion` / `state_getMetadata` take ~8.5 s whenever the node switches runtime version | The runtime map reads `System.LastRuntimeUpgrade` instead (post-state version of block b = value at b + 1; code changed at #50,000 and #57,052, the value at #50,001 and #57,053) and probes in parallel: genesis → head map in 1.9 s instead of 22 s. Browsers cache metadata in IndexedDB |
| Polkadot AH backfill build (newest 1.5 M blocks, #20,572,285–#22,072,284) | 2,173,842 rows in 30 chunks, **62 MB gz**, built in 5,372 s at ~279 blocks/s (per-block, 128 in flight) | Publishing it costs ≈ 6,200 tPOT at ~100 tPOT/MB. Publish a smaller newest window first (e.g. the newest ~5 chunks ≈ 10 MB) and extend as tPOT allows; denser encoding (dictionary/columnar) is the P1 cost lever |
| Browser direct sync of Portaldot V3 (Pantry, Chrome) | 118,991 blocks → 2,248 rows in 2 min 25 s; L3 905 / 905 account checks in 22.7 s | Direct sync is fine for Portaldot today; snapshots are what make heavy chains load in seconds |
| Portaldot block length limit | normal 14,942,208 bytes | One 8 MB chunk fits per block, so **max chunk size is 8 MB** and 1 store per tx |
| `TransactionStorage.maxTransactionSize` | 8,388,608 bytes | Same |
| Retention | 100,800 blocks (~7 days, `TransactionStorage.RetentionPeriod`); a block's entries are dropped at `block + 100,801`, so a renewal must land by `block + 100,800` | The manifest stores `(tsBlock, tsIndex)` for each chunk for `renew` |
| Renewal cost (`paymentInfo`, 2026-10-21) | **≈ 0.0117 tPOT per `renew(block, index)`, whatever the blob size**, vs ≈ 104.9 tPOT to `store` 1 MB. `Renewed { index, content_hash }` gives the new location | Keeping data alive is almost free; only the first store and a re-store after expiry cost per byte. `potluck renew` runs daily with a one-day window |
| Storage cost (S2, `paymentInfo`) | **≈ 0.0001 tPOT per byte ≈ 100 tPOT per MB**, linear up to 7.8 MB; `byteFee`/`entryFee` (10/1000 planck) are negligible next to the transaction length fee | Bytes are the cost driver. Measured: the newest 1.5 M Polkadot AH blocks are **62 MB gz** (≈ 6,200 tPOT), not the ~19 MB first estimated. Encoding efficiency (dictionary/columnar) is a P1 cost lever. *(Corrects an earlier "25 MB ≈ 0.0000025 POT" estimate.)* |
| Blob upload over WSS (S2) | 7.8 MB accepted; travels as hex (2×), ~28 s from the developer's link | Request timeout ≥ 90 s; keep chunk blobs ≲ 4.5 MB |
| `bitswap_v1_get` (S3, 2026-10-21) | Public node, from Node.js over WSS: the published 2.53 MB Polkadot AH chunk in 3.9–4.4 s (≈ 0.6 MB/s), the 0.65 MB chunk in 1.6–1.7 s; both digests match | The whole newest-80,000-block AH window (3.2 MB) downloads in ≈ 6 s, against 316 s to index those blocks at ≈ 250 blocks/s with 128 requests in flight. Keep chunks ≲ 4.5 MB |
| Full Portaldot sync | 5.2 s (9,202 events) | **Direct** mode is already enough today |
| Heavy-chain snapshot (Pantry, 2026-10-21) | Polkadot AH newest 80,000 blocks from Portaldot (registry + bitswap, 3.0 MB, L1 on both chunks): **5.6–6.4 s** for 114,460 rows. Direct sync measured in the same browser: 117 blocks/s on a 300-block sample (events only) ≈ 11 min 23 s for the window | The core claim holds on a real heavy chain: ~100× faster, and every account can still be checked (L2 + L3) against Asset Hub on demand |
| Snapshot load (Pantry, 2026-10-21) | Portaldot unified history #1–#129,069 from the registry (1 chunk, 74 KB) plus a direct-synced tail: **3.0 s** in the browser, L3 938 / 938; the same history by direct sync took 1 min 9 s | Published snapshots make even Portaldot ~23× faster to open; the gap grows with chain size |
| TransactionStorage byte fee (found by L3, 2026-10-21) | Each `store` emits `Balances.Held(StorageFeeHold, who, x)` then `Balances.BurnedDebt(x)`; the burn names no account, so the account's total drops by `x` with no attributable debit | The unified spec matches `Held` only `where` reason = `{"transactionStorage":"StorageFeeHold"}` and books it as a `StorageFee` debit. Before the fix, the publisher's own account failed L3 by exactly the 5 stores' fees (784,080 planck) |
| Registry costs (EVM build, measured on chain) | Deploy: 327.36 tPOT code deposit + 105.86 tPOT storage deposit + 0.56 tPOT fee. `registerSpec` ≈ 7.7–11.5 tPOT deposit. `publish` ≈ 38–42 tPOT deposit per manifest | Per-manifest deposits dominate small publishes (store fees for the Portaldot history are ≈ 8 tPOT). Moving non-essential manifest fields to events (§9) is the lever if publishing often |
| Polkadot AH | 22.05 million blocks, ~3 events/block, **≥35 runtime versions** overall and **10 versions / 9 upgrades inside the Revive window** (S1), metadata **v14** since #1000 (561–639 KB per version), Parity public node is **archive** | Multi-runtime decoder; no manual types needed (v14 is self-describing) |
| Decoding runtime (S1) | A block's events decode **only** with the runtime that executed it (parent state). The post-state version fails at the `set_code` block #16,946,479 | `core` resolves metadata via `runtimeVersion(parentHash)` |
| Public RPC throughput (S6) | Only the Parity Asset Hub endpoint is reliable. ~2.2 blocks/s per in-flight request; **~250 blocks/s** at 128 in flight with batched `chain_getBlockHash([n…])`, 0 errors | Publisher batches hash lookups and keeps a high in-flight count; builds are resumable. Naive browser sync of the Revive window ≈ **2–4 days** |
| Balance reconciliation (S4) | **319/319** touched accounts reconcile exactly; closed rule table for all 30 `Balances` variants | L3 verification is sound; rule table lives in `core` |
| Balance-history volume (S4) | Revive window ≈ **24–34 M rows, ~0.6–1 GB gzip (78–130 chunks)**; 52% `Deposit`, 34% `Transfer`, 12% `Withdraw` | Full-window publish is too heavy for the MVP; see §15 decision 5 |
| Kusama AH Recovery (S7) | Pallet since #11,135,052; **inheritance API since #17,836,634** (2026-06-12, spec 2003000) | Recovery-timeline spec `fromBlock = 17836634` |
| Huge blocks (S1) | #20,485,673 holds 1,888 events / 112,929 bytes | Chunk by bytes; one oversized block may form its own chunk |
| EVM logs on Revive (M2b) | Logs are `Revive.ContractEmitted { contract, data, topics }` events inside `System.Events`; native value moved by EVM calls appears as ordinary `Balances` events | One pipeline (executing-runtime decoding) covers both VMs; no `eth_getLogs` path needed. ERC-20 and ERC-721 `Transfer` share topics[0] and differ by indexed-topic count |
| Portaldot unified history, genesis → head (M2b live test) | 115,471 blocks, 2 runtime upgrades (#50,000, #57,052), 2,156 rows incl. 16 token rows; token rows equal `eth_getLogs` as a multiset; **894/894 native accounts reconcile** | Dual-VM history is exact today; direct sync is the right mode for Portaldot |
| Holds can vanish without a Balances event (M2b): **retracted 2026-10-30** | The 166,640 planck that seemed to vanish when `System.KilledAccount` reaped `0xa466…3235` at Portaldot #89,388 is the TransactionStorage fee it paid at #89,387 (`Held` + `BurnedDebt`, the StorageFee row above). At the parent of #89,388 the account had `reserved = 0` and no holds; its rows alone balance to zero (214,625,494,897,088 − 166,790,897,013,175 − 166,640 = 47,834,597,717,273 free, then − 1,430,640,467,392 fee − 46,403,957,249,881 `transferAll` = 0) | Not a chain bug, nothing to report. `KilledAccount` stays a **reset** row (value 0 at its event) for reap-and-recreate blocks (next row) |
| Reap and recreate in one block (2026-10-27) | Paying an asset fee through a swap can reap an account (`KilledAccount`) and recreate it (`NewAccount`, `Deposit`, then a `Transfer` out) in the same block, e.g. Polkadot AH #21,352,408. 6 accounts in 4 of 30 chunks of the 1.5 M-block build failed L3 while resets applied at block end | A reset applies at its **event position**; in its block, the account's debits before its next credit stay part of the reset. All 30 chunks (617,190 account checks) then reconcile |
| Public Portaldot WSS (M2b) | Drops every connection ~60 s after opening (close 1006); reconnect ≈ 2 s; calls ≈ 0.45 s from Indonesia | Auto-reconnect + ~15 s retry window; clients must re-subscribe after reconnects. Full-chain scan took 5.2 s in S1 conditions and ~117 s under current load |
| `state_queryStorage` semantics | Reports only blocks whose value changed | Range scan rebuilds every block as the latest change at or before it (exact), with per-block fallback |
| Kusama AH | 22.78 million blocks, ~4.7 events/block, Recovery-inheritance live (121 configurations) | Real source for Wasiat-lite |
| `state_queryStorage` on Polkadot nodes | **Blocked** (unsafe) | The publisher uses **only** safe RPC: `chain_getBlockHash` + `state_getStorage(System.Events, hash)` per block, or `archive_v1_*` |
| Revive account mapping | Regular accounts: `keccak256(AccountId32)[12..]`; **851 distinct `map_account` accounts** | Address normalization is **mandatory** via the runtime API `ReviveApi.address` / `ReviveApi.accountId` + storage `revive.originalAccount`, not computed locally |
| Portaldot decimals | native 14, EVM 18 (`nativeToEthRatio` 10000) | All amounts are stored as native planck bigint + a unit column |

---

## 1. Design principles

1. **Zero server.** Only static files + contracts + on-chain data are deployed. No process has to stay running.
2. **Snapshot = accelerator, not a dependency.** Without a snapshot, the client is still correct (just slower).
3. **Deterministic by construction.** Declarative spec and canonical encoding, so two honest publishers always produce the same hash.
4. **Verify against the source chain, not against the publisher.** Trust comes from the chain, not from reputation.
5. **Chain-agnostic, Portaldot first-class.** One SDK for any polkadot-sdk-based source, with a dedicated dual-VM adapter for Portaldot.

---

## 2. Portaldot as a source: "just use it" when it gets busy

**Answer to the question: yes, and it is in fact designed as the default mode.**

The SDK picks a strategy automatically per spec (**adaptive sync**):

```
estimate_direct = (head − local_cursor) × cost_per_block
if estimate_direct ≤ 20 seconds      → DIRECT  (sync straight from the node)
otherwise:
   find a verified manifest whose toBlock is closest to head
   found → SNAPSHOT (download chunks) + DIRECT for the toBlock..head gap
   none  → DIRECT with progress (+ offer "publish your sync result", P1)
```

- **Today (small Portaldot):** the SDK automatically uses DIRECT, about 5 seconds for the entire history. No snapshot needs to be published because that would be wasteful.
- **Later (busy Portaldot):** once the DIRECT estimate exceeds the threshold, publishers start publishing snapshots and dApps use them automatically. **Not a single line of dApp code changes.**
- **Value for the Portaldot that exists today** (not about speed): a **unified dual-VM history** that nobody has yet.
  - native Substrate transfers + Revive ERC-20/721 logs in one table;
  - SS58↔H160 addresses normalized via the runtime API;
  - 14↔18 decimal amounts normalized.

  The official explorer has no account history, and potscan only displays. This is what is being offered to the Hacker House teams right now.
- **"Self-hosted" bonus:** Portaldot data is stored on Portaldot, so the source, the storage, and the registry are all on the same chain.

---

## 3. System components

```
┌──────────────────────── SOURCE CHAIN ────────────────────────┐
│ Polkadot AH · Kusama AH · Portaldot V3 (Substrate + Revive)  │
│ Safe RPC: chain_getBlockHash, state_getStorage, state_getRuntimeVersion,
│           state_getMetadata, chainHead_v1_follow, eth_getLogs (Revive), runtime API
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
     ┌──────────▼──────────┐          ┌─────────▼──────────────────────────┐
     │  @potluck/core      │◀─────────│  @potluck/client (browser, Worker) │
     │  (shared)           │          │  adaptive sync · loader · verifier │
     │  source adapters    │          │  SQLite-WASM (OPFS) · live tail    │
     │  runtime/metadata   │          │  React hooks                        │
     │  spec engine        │          └─────────▲──────────────────────────┘
     │  canonical encoder  │                    │ manifest, chunk
     │  chunker · bloom    │                    │
     └──────────▲──────────┘          ┌─────────┴──────────────────────────┐
                │                     │           PORTALDOT V3              │
     ┌──────────┴──────────┐  store   │ TransactionStorage: chunk + manifest│
     │  @potluck/cli       │─────────▶│ PotluckRegistry.sol (Revive):       │
     │  build · publish ·  │ publish  │   spec, manifest, flag, renewal     │
     │  renew · verify     │─────────▶│ bitswap_v1_get: download blob       │
     └─────────────────────┘          └────────────────────────────────────┘

Apps (static): Pantry (catalog + history demo) · Wasiat-lite (inheritance timeline)
```

---

## 4. Monorepo structure

```
potluck/
├─ packages/
│  ├─ spec/        # spec JSON Schema + canonicalization + specHash
│  ├─ core/        # source adapters, runtime/metadata cache, spec engine, encoder, chunker, bloom, merkle
│  ├─ client/      # browser SDK: adaptive sync, loader, verifier, SQLite-WASM, live tail, React hooks
│  └─ cli/         # Node publisher: build/publish/renew/verify/tamper (for the attack demo)
├─ contracts/      # PotluckRegistry.sol (Foundry, EVM bytecode; allowEVMBytecode=true)
├─ specs/          # reference specs (JSON)
│  ├─ portaldot.unified-history.json
│  ├─ polkadot-ah.balance-history.json
│  └─ kusama-ah.recovery-timeline.json
├─ apps/
│  ├─ pantry/      # manifest catalog + "try an address" + verification status
│  └─ wasiat/      # Wasiat-lite
└─ docs/
```

**Stack:**
- TypeScript, pnpm workspace.
- `@polkadot/api` / `@polkadot/types` for multi-runtime decoding (most mature historical metadata support).
- `viem` for the registry (custom chain 420420777).
- `@sqlite.org/sqlite-wasm` with the `opfs-sahpool` VFS in a Web Worker (does not need COOP/COEP headers).
- `@noble/hashes` (blake2b, keccak), `CompressionStream` (gzip).
- Vite + React for the apps; Foundry for the contracts.

---

## 5. Spec format (declarative)

**Source of truth:** the zod schema in [`packages/spec/src/schema.ts`](../packages/spec/src/schema.ts) plus the semantic checks in [`validate.ts`](../packages/spec/src/validate.ts). The reference specs live in [`/specs`](../specs) and are validated by a test.

```jsonc
{
  "potluck": 1,
  "name": "polkadot-ah.balance-history",
  "description": "...",
  "source": {
    "kind": "substrate-events",
    "chain": "polkadot-asset-hub",
    "genesisHash": "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f",
    "fromBlock": 11405259
  },
  "columns": ["kind", "from", "to", "amount"],   // `block` and `eventIndex` are implicit
  "accounts": ["from", "to"],                     // bloom + per-account queries
  "match": [
    { "pallet": "Balances", "event": "Transfer", "row": { "kind": "Transfer", "from": "$from", "to": "$to", "amount": "$amount" } },
    { "pallet": "Balances", "event": "Withdraw", "row": { "kind": "Withdraw", "from": "$who", "amount": "$amount" } },
    { "pallet": "Balances", "event": "BalanceSet", "row": { "kind": "BalanceSet", "to": "$who", "amount": "$free" }, "absolute": true }
    // ... all 13 delta events of the S4 rule table
  ],
  "reconcile": {
    "type": "balance-delta",                      // or { "type": "none" }
    "storage": { "pallet": "System", "item": "Account" },
    "sum": ["data.free", "data.reserved"],
    "debit": "from", "credit": "to", "amount": "amount"
  },
  "chunk": { "maxBlocks": 50000, "maxRawBytes": 32000000 }
}
```

- Row values: `"$field"` references a decoded event field (metadata snake_case names); anything else is a literal.
- `effect` changes how a row reconciles (default: delta):
  - `"reset"`: the credit account's value is exactly `amount` **at the row's event**. `System.KilledAccount` → `"0"`. Earlier rows of that block are part of the reset, and so are the account's debits after it until its next credit, because `KilledAccount` is emitted before the `Transfer` that empties the account. Later rows count, since an account can be reaped and recreated in one block.
  - `"opaque"`: the change cannot be expressed (e.g. `BalanceSet` sets `free` but not `reserved`); the account is excluded from reconciliation.
  - Non-delta rows carry `"effect":"reset"|"opaque"` at the end of their NDJSON line.
- A match may also be a **Revive EVM log**: `{ "log": "Transfer(address indexed from, address indexed to, uint256 value)", "contracts"?: [...], "row": {...} }`, with `$contract` and parameter references. `balance-delta` accepts an optional `when` filter (e.g. only `asset == "native"` rows).
- `specHash = blake2b-256(canonical JSON)`: sorted keys, no whitespace, integers only. Because the stored spec blob is exactly that canonical JSON, the hash also equals its TransactionStorage content digest.
- **No free-form code.** Only `match → row → columns`, so it is deterministic by construction.
- `kusama-ah.recovery-timeline` uses `reconcile: none` in the spec. Its state-replay check (replay events into friend groups / attempts / inheritors, compare with `recovery.*` storage) is client-side work in M5.
- `portaldot-v3-testnet.unified-history` combines Balances events (`asset: "native"`, AccountId32 hex) with ERC-20 and ERC-721 `Transfer` logs (`asset`: token contract, H160 accounts, `tokenId` for NFTs). Clients query a user's AccountId32 for native rows and its H160 (`ReviveApi.address`) for token rows.

## 6. Indexing pipeline (the publisher and direct mode use the same code)

1. **Runtime map:** sample the range (starting at fromBlock − 2, so storage at fromBlock − 1 can be decoded for reconciliation), then binary search on `state_getRuntimeVersion` to find the blocks where `specVersion` changes. The live test rebuilds the Revive-window map and finds the S1 upgrades plus #11,405,258, the block that enabled Revive. Metadata per version is cached (disk for the CLI, OPFS for the browser). **Decode block N with the runtime of block N−1's state** (the executing runtime), never with N's post-state version.
2. **Fetch events:** batch `chain_getBlockHash([n1, n2, …])` (up to 500 per call), then `state_getStorage(System.Events, hash)` per block with high bounded parallelism (publisher: ~128 in flight), retry with backoff, resumable checkpoints.
3. **Decode** with the metadata registry of that block's version, then **match** the spec and **project** into rows.
4. **Canonical normalization:**
   - addresses as AccountId32 hex taken from the codec via `toHex()` (never `toJSON()`, which yields SS58), H160 for Revive plus a mapping column;
   - bigint as a decimal string;
   - row order `(block, eventIndex)`;
   - JSON with key order `block`, `eventIndex`, the spec columns in declared order, then `"absolute":true` only for absolute rows; one row per line (NDJSON), no whitespace. The decoder re-encodes every line and rejects non-canonical input.
5. **Chunking:** chunk ranges are contiguous and cover the whole published range; a block is never split. A chunk closes before the next block that would exceed `maxRawBytes` or lie ≥ `maxBlocks` after its start, and an oversized block (e.g. 1,888 events in a migration block) forms its own chunk. The gzip blob must stay ≤ 8,388,608 bytes.
6. Per chunk:
   - `rawHash = blake2b-256(NDJSON)`, used for determinism across publishers;
   - `blob = gzip(NDJSON)` (gzip does not need to be deterministic because the blob hash is recorded separately);
   - account **bloom** sized per chunk (9.6 bits per distinct account, k=7, ~1% false positives; a fixed 4 KB would saturate with thousands of accounts per chunk).
7. `chunksRoot` = keccak256 Merkle root over the `rawHash` values (in chunk order), so it can be verified in Solidity going forward.

---

## 7. Manifest format (stored in TransactionStorage, root in the registry)

```jsonc
{
  "potluck": 1,
  "spec": "0x<specHash>",
  "source": { "genesisHash": "0x…", "name": "polkadot-asset-hub" },
  "range": { "from": 20500000, "to": 22000000, "toHash": "0x…" },
  "encoding": "ndjson+gzip",
  "chunks": [
    { "from": 20500000, "to": 20599999, "rows": 51234,
      "rawHash": "0x…", "blob": { "cid": "bafk2bza…", "size": 3812345, "tsBlock": 120034, "tsIndex": 1 },
      "bloom": "base64…" }
  ],
  "chunksRoot": "0x…",
  "publisher": "0x<h160>",
  "tool": "potluck-cli/0.1.0"
}
```

---

## 8. Publisher CLI (`packages/cli`)

```
potluck build   <spec.json> [--last N | --from A --to B] [--concurrency 64]   # resumable
potluck verify  <build-dir> [--rebuild] [--no-reconcile] [--chunks i,j]
potluck publish <build-dir> --registry <h160> [--dry-run --from-address <ss58>]
potluck renew   <build-dir> [--registry <h160>] [--within 14400] [--restore] [--dry-run]
potluck sync    <spec.json> --registry <h160> [--dry-run] [--min-blocks 1000] [--budget <tPOT>]
potluck tamper  <build-dir> --out <dir>                                       # demo only
```

- **build**:
  - checks the endpoint genesis against the spec and builds the runtime map;
  - scans segments (queryStorage with exact reconstruction, or per block when refused);
  - decodes with the executing runtime and streams rows into the `ChunkAccumulator`;
  - writes `chunks/<i>.ndjson.gz` and persists `state.json` after every closed chunk (resumable), then writes `spec.json` (canonical) and `manifest.draft.json`;
  - metadata is cached in `.cache/potluck/metadata/<genesis>/`.
  - Two independent builds are byte-identical.
- **verify**: L1 integrity (blob digest/size, raw hash, canonical NDJSON, rows in range, bloom coverage); `--rebuild` re-indexes each chunk range and compares raw hashes (the second-publisher check); L3 reconciles every account of each chunk against source-chain state.
- **publish**:
  1. Checks every chunk locally first.
  2. `transactionStorage.store` of the spec blob (if the spec is not registered yet), then `registerSpec`.
  3. One `store` per chunk. Each `Stored(index, content_hash)` is checked against the manifest digest and its `(block, index)` recorded (resumable via `publish-state.json`).
  4. `store` of the final manifest (chunk locations + publisher H160 filled in).
  5. `registry.publish(...)` through `revive.call`, with weight/deposit limits from a `ReviveApi.call` dry run (+20%).
  - Steps 4 and 5 are two transactions, not one atomic batch: the manifest entry must carry its own blob location, which is only known after inclusion.
  - `--dry-run` builds the same transactions and estimates fees with `paymentInfo`, without funds.
- **tamper** (demo): copies a build with one debit row removed and all hashes recomputed. It passes L1 alone; `verify --rebuild` reports a mismatch and L3 points at the victim account.
- **renew**:
  - Reads the locations in `publish-state.json` (spec, chunks, manifest) and checks each on chain: `TransactionStorage.Transactions(block)[index]` must still hold the expected content hash.
  - Entries whose last renewable block is within `--within` blocks (default 14,400, about a day) get `transactionStorage.renew`. The new location from `Renewed` is saved and, with `--registry`, announced with `noteRenewal` (chunk index, or `MANIFEST_BLOB` for the manifest).
  - Expired entries cannot be renewed. `--restore` stores them again from the local build (full store fee); otherwise they are reported and the exit code is 2.
  - Clients fetch blobs by digest over bitswap, so locations matter only to renewers, including third parties renewing someone else's data.
- **sync** (what a publisher runs periodically, by hand or from their own scheduler):
  1. Builds the blocks finalized since the newest complete build of the spec (or resumes an unfinished build that continues it). It skips when fewer than `--min-blocks` are new and refuses to start without a first build.
  2. Verifies the new build (L1 + reconciliation) before anything is spent.
  3. Publishes every complete build that is not registered yet, each as its own manifest (clients merge manifests). `--budget` aborts first if the estimated store fees are higher.
  4. Renews every published build.
  - Measured (2026-10-21, dry run): Portaldot #116,550..#128,267 built, verified (53 / 53 accounts) and estimated in 15 s; publishing both Portaldot builds would cost ≈ 8.2 tPOT.
  - Each sync adds a manifest, and the client reads the newest 32 per spec by default. Consolidating old manifests is P1.

---

## 9. The `PotluckRegistry.sol` contract (Revive, EVM + PVM)

**Source of truth:** [`contracts/src/PotluckRegistry.sol`](../contracts/src/PotluckRegistry.sol), with tests in [`contracts/test/PotluckRegistry.t.sol`](../contracts/test/PotluckRegistry.t.sol) (21 tests incl. fuzz, 100% line/branch coverage).

The same source is compiled to EVM bytecode (solc 0.8.28, 5,414 B) and to PolkaVM (resolc 1.4.0, 42,055 B). Both instantiate on the live Portaldot V3 runtime (spike S8 dry-run).

Interface summary:

```solidity
// specs: specHash = blake2b-256 of the canonical spec JSON = its TransactionStorage content digest
function registerSpec(bytes32 specHash, uint32 tsBlock, uint32 tsIndex) external;
function getSpec(bytes32 specHash) external view returns (Spec memory);
function specCount() external view returns (uint256);
function specHashAt(uint256 index) external view returns (bytes32);

// manifests: many per spec (progressive backfill), same range allowed from other publishers (quorum),
// duplicate (spec, source, range, chunksRoot, publisher) rejected
function publish(ManifestInput calldata m) external returns (uint256 id);
function getManifest(uint256 id) external view returns (Manifest memory);
function manifestCount() external view returns (uint256);
function manifestCountBySpec(bytes32 specHash) external view returns (uint256);
function manifestIdsBySpec(bytes32 specHash, uint256 offset, uint256 limit) external view returns (uint256[] memory);
function latest(bytes32 specHash, uint256 n) external view returns (Manifest[] memory); // newest first

// flags & renewals: chunkIndex == type(uint32).max (MANIFEST_BLOB) refers to the manifest blob itself
function flag(uint256 id, uint32 chunkIndex, FlagReason reason, bytes32 evidence) external; // one per address, not by the publisher
function hasFlagged(uint256 id, address flagger) external view returns (bool);
function noteRenewal(uint256 id, uint32 chunkIndex, uint32 tsBlock, uint32 tsIndex) external; // manifest blob location is updated in storage; chunk renewals are events only
```

Notes:
- `ManifestInput` carries `specHash, sourceGenesis, fromBlock, toBlock, toBlockHash, chunksRoot, manifestDigest, tsBlock, tsIndex, chunkCount`. The stored `Manifest` adds `publisher, publishedAt, flags`.
- `FlagReason`: `Integrity`, `RowMismatch`, `Reconciliation`, `Unavailable`.
- Events: `SpecRegistered`, `ManifestPublished`, `ManifestFlagged`, `Renewed`. Clients can rebuild the full catalog from logs.
- Blobs are fetched by digest via `bitswap_v1_get`, so a false renewal announcement can only point to an unusable location, never corrupt data.
- **Storage deposits matter on Revive** (`depositPerByte` 0.06 tPOT, `depositPerItem` 0.15 tPOT). Deploy costs ≈ 433 tPOT (EVM) / ≈ 3,293 tPOT (PVM). The per-manifest cost will be measured after deployment; if it is too high, move non-essential manifest fields from storage to events.

- **MVP:** no bond/slashing. A flag is only a public claim; the client verifies on its own and weighs publishers by their flag history.
- **P1:** publisher bond + dispute window with a multisig arbiter (honestly acknowledged as temporary centralization).

---

## 10. Client SDK `@potluck/client`

**Source of truth:** [`packages/client/src`](../packages/client/src). The SDK bundles for browsers (esbuild, no Node built-ins). Implemented API:

```ts
const source = withRetry(await connectWs("wss://polkadot-asset-hub-rpc.polkadot.io")); // bring-your-own-node
const manifests = new PortaldotSource({
  portaldot: withRetry(await connectWs("wss://test-node-v3.portaldot.dev")),
  evmRpcUrl: "https://test-evm-rpc-v3.portaldot.dev",                                     // CORS: *
  registry: "0x…",
});
const result = await accountHistory({ spec, source, manifests, accounts: [accountId32, h160], onProgress });
// result: { rows, segments: [{ mode, chunksDownloaded, chunksSkippedByBloom, integrityProblems,
//           rowTruthFailures, reconciliation }], verified, uncovered, head }
const stop = followHistory({ spec, source, accounts, afterBlock: result.head, onRows });
```

- **Manifests:** `PortaldotSource.list` reads `latest(specHash)` from the registry via `eth_call` and fetches each manifest via `bitswap_v1_get` (CID = raw CIDv1 of the blake2b-256 digest, `blobCid`). It keeps only manifests that hash to their registered digest and match the spec, source chain, range and chunks root.
- **Coverage (`planCoverage`):** unflagged manifests first, reaching furthest. Gaps ≤ `maxDirectBlocks` (default 200,000) are synced directly; longer gaps are reported as `uncovered` (the UI's coverage bar).
- **Loader:** only chunks whose bloom may contain one of the account ids are downloaded; every blob is digest-checked (`fetchBlob`).
- **Accounts:** for the Portaldot unified spec, query both the AccountId32 and its H160 (`reviveAddressOf`, via the `ReviveApi_address` runtime API).

**Verifier (3 levels, all against the source chain):**

| Level | What | Cost | Catches |
|---|---|---|---|
| L1 Integrity (`checkChunkIntegrity`) | blob digest/size, raw hash, canonical NDJSON, rows in range, account count, bloom coverage | local | Corrupted/swapped chunks. A consistent forgery passes L1 alone |
| L2 Row truth (`checkRowTruth`) | re-derive every block the account's rows touch from source events; each row must exist byte-for-byte | ~2 RPC per unique block | Fake/altered rows |
| L3 Completeness (`reconcileAccounts`) | for **every** chunk and direct segment, including bloom-skipped chunks: value(to) = value(from−1) + deltas (or reset value + later deltas) | 2 storage reads per chunk | **Deleted/hidden rows**, including when the bloom is forged too (live-tested) |

**Live tail (`followHistory`):** polls the finalized head instead of subscribing, because the public Portaldot endpoint drops connections every ~60 s and silently ends subscriptions. New blocks are decoded with their executing runtime.

**Not built yet:**
- Recovery state replay (check the timeline against `recovery.*` storage).
- A persistent local store (SQLite-WASM/IndexedDB cache with a per-spec cursor). Apps keep results in memory for the MVP.

---

## 11. Apps

**Pantry** (`apps/pantry`)
- Catalog of specs & manifests from the registry: publisher, block range, size, retention status, flags.
- "Try an address": history + a human-readable L1/L2/L3 verification report ("This history matches the balance on Polkadot Asset Hub ✓").
- Comparison panel: DIRECT estimate (for example "~2–4 days" for the Revive window) vs SNAPSHOT (seconds).
- Attack demo button: loads a tampered manifest, then shows L3 failing, an on-chain flag, and switching to an honest publisher.

**Wasiat-lite** (`apps/wasiat`)
- Address input (Kusama AH or Portaldot V3), then shows an **inheritance timeline**: friend groups & priorities, attempts started/approved/cancelled, inheritance completed, slash. "state-replay matches ✓" badge.
- "Set up on Portaldot V3": a `recovery.setFriendGroups` form (a real tx via a wallet extension), with a warning that `securityDeposit = 0` on Portaldot.
- Narrative: *an inheritance app must outlive the server of its creator.*

**Hosting:** static files. Stretch: the app bundle is also stored in TransactionStorage.

---

## 12. Threat model

| Threat | Mitigation |
|---|---|
| Publisher deletes/hides rows | L3 windowed reconciliation (guaranteed to be caught for affected accounts) |
| Publisher forges/alters rows | L2 checks against the original events on the source chain |
| Bloom forged so that a chunk is not downloaded | L3 checks the balance in **all** chunks, including the "irrelevant" ones |
| Chunk expired/lost | DIRECT fallback + `renew` by anyone |
| Source RPC lies | Multi-endpoint + (stretch) storage proof verification against the finalized header |
| Manifest spam | Registry orders per publisher + flag history; P1: bond |
| Source data reorged | Only **finalized** (GRANDPA) blocks are indexed |

**Honestly acknowledged limitation:** a spec without a reconciliation model (for example non-balance events that are not reflected in state) only gets L1 + L2.

---

## 13. MVP scope

### P0: required for submission
| # | Deliverable | Done when |
|---|---|---|
| 1 | `spec` + `core` | 3 reference specs pass; two runs produce an identical `rawHash` |
| 2 | `cli` build/publish/renew/verify/tamper | Real manifests for 3 specs on Portaldot testnet (`store` tx + registry, with explorer links) |
| 3 | `PotluckRegistry.sol` | Deployed on testnet; Foundry tests; events readable from the browser |
| 4 | `client` | Adaptive sync, loader + bloom, L1/L2/L3, SQLite-WASM, live tail |
| 5 | Pantry | Polkadot AH account history (published range per §15 decision 5) loads in **< 5 seconds cold** and passes L3. DIRECT vs SNAPSHOT panel |
| 6 | Attack demo | Tampered manifest **100% detected** for the affected account; on-chain flag |
| 7 | Wasiat-lite | Real Recovery timeline from Kusama AH + state-replay ✓ + `setFriendGroups` tx on Portaldot V3 |
| 8 | Portaldot unified history | Dual-VM history (Balances + Revive ERC-20) in DIRECT mode + address normalization via `ReviveApi` |
| 9 | Documentation | README, architecture diagram, deploy instructions, tx proofs, video ≤ 3 minutes, pitch deck |

### P1: if time permits
`@potluck/react` React hook · browser-as-publisher (opt-in) · publisher bond · full Polkadot AH history (not a window) · automatic multi-endpoint · ≥ 2 Hacker House teams integrate it.

### Out of scope for MVP
Free-form JS handlers · on-chain slashing/adjudication · smoldot light client · non-Substrate chains (Ethereum) · GraphQL · Potluck token.

---

## 14. Technical spikes (do these first to retire risk)

| Spike | Status | Question |
|---|---|---|
| S1 Multi-runtime Polkadot AH event decoding in the browser | ✅ [results](../spikes/results/S1.md) | Metadata size/latency per version; correct at every version boundary? |
| S8 resolc → PVM + EVM registry on Revive | 🟡 dry-run ✅ [results](../spikes/results/S8.md); real deploy needs tPOT | Do both variants instantiate? What deposits do they need? |
| S2 Store 1/4/8 MB on Portaldot testnet | ⏳ (needs tPOT) | Does it pass the block limit & weight? What is the real fee? |
| S3 `bitswap_v1_get` for MB-sized blobs over WSS | ⏳ | RPC response size limit? Latency? |
| S4 Polkadot AH balance reconciliation | ✅ [results](../spikes/results/S4.md) | Which events change `free+reserved` (fee, reserve, dust, AHM migration)? Does it pass for 20 random accounts? |
| S5 Revive address mapping | ✅ partial | Use `ReviveApi.address/accountId`, because the keccak formula does not hold for `map_account` accounts |
| S6 Public RPC rate limits during build | ✅ [results](../spikes/results/S6.md) | Safe throughput per endpoint; how many endpoints are needed? |
| S7 Recovery runtime boundary on Kusama AH | ✅ [results](../spikes/results/S7.md) | At which block the pallet appears (spec starting point) |

---

## 15. Decisions

### Decided (2026-10-20)
1. **Polkadot AH window = since Hub smart contracts went live**: the Revive pallet first exists at **block #11,405,259 (2026-01-27T10:59:24Z, spec 2000005)**.
   - The window is about **10.65 million blocks (266 days)**.
   - Naive sync (S6): ~2–4 days in a browser (33–63 blocks/s); publisher build ≈ 12 h at ~250 blocks/s. *(Corrected 2026-10-20; the earlier ~15 h figure was wrong.)*
   - Currently there are 593 Revive accounts/contracts on the Hub.
   - Data (S4, measured): ~24–34 M rows, **~0.6–1 GB gzip, 78–130 chunks**. The earlier ~250 MB assumption was wrong.
2. **Contract: a single Solidity source, dual deployment on Revive.**
   - **PVM** (resolc, PolkaVM, primary) + **EVM** (solc, backup and comparison), identical ABI.
   - The client uses either address through viem/MetaMask with no code difference.
   - Feasibility proof: the testnet already contains 1 PVM contract (4,995 bytes) and 13 EVM codes.
   - If the resolc spike fails, EVM alone is enough. No change in the client.
   - ink! is deliberately **not** used: rewriting the registry in Rust adds no functionality, duplicates code, and ink! v6 for Revive has not been verified on Portaldot.
5. **Publish scope = progressive backfill** (decided 2026-10-20, after S4 measured ~0.6–1 GB for the full Revive window).
   - The spec keeps `fromBlock = 11405259`; only the *published* coverage grows over time.
   - **MVP publishes the newest range first**: the last ~1.5 M blocks ≈ 90–140 MB, ~12–18 chunks. Older ranges follow as additional manifests as testnet capacity and time allow.
   - Manifests for one spec may cover disjoint or adjacent ranges. The registry's `latest(specHash, n)` returns all of them; the client merges them, shows a **coverage bar**, and direct-syncs any uncovered range.
   - This matches the Potluck story: any publisher can "bring a chunk" of older history.
   - Rejected alternatives: publishing the full window now (heavy on a shared testnet, ~12 h build), or a lighter demo spec such as Revive contract logs only (weakens the L3 reconciliation story).

### Still open
3. Coordination with the Portaldot team about testnet storage for the backfill: ~90–140 MB first, up to ~0.6–1 GB eventually (material for the 28–29 Oct office hour).
4. **User prerequisite:** create a dev SS58 account and request tPOT via a Discord ticket. Not done yet.
