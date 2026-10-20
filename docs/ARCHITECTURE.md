# Potluck: Detailed Architecture & MVP Scope

> 2026-10-20. Concept: [POTLUCK.md](./POTLUCK.md). All technical numbers were measured directly from the chains unless marked *(assumption)*.

---

## 0. Technical facts that constrain the design

| Fact | Measured value | Design implication |
|---|---|---|
| Portaldot block length limit | normal 14,942,208 bytes | One 8 MB chunk fits per block, so **max chunk size is 8 MB** and 1 store per tx |
| `TransactionStorage.maxTransactionSize` | 8,388,608 bytes | Same |
| Retention | 100,800 blocks (~7 days) | The manifest stores `(tsBlock, tsIndex)` for each chunk for `renew` |
| `byteFee` / `entryFee` | 10 / 1000 planck | 25 MB ≈ 0.0000025 POT; cost is dominated by the tx fee, not by storage |
| `bitswap_v1_get` | Works on public nodes (tested at 16 KB) | Chunk download path from the browser. MB-sized blobs need a spike |
| Full Portaldot sync | 5.2 s (9,202 events) | **Direct** mode is already enough today |
| Polkadot AH | 22.05 million blocks, ~3 events/block, **≥35 runtime versions** overall and **10 versions / 9 upgrades inside the Revive window** (S1), metadata **v14** since #1000 (561–639 KB per version), Parity public node is **archive** | Multi-runtime decoder; no manual types needed (v14 is self-describing) |
| Decoding runtime (S1) | A block's events decode **only** with the runtime that executed it (parent state). The post-state version fails at the `set_code` block #16,946,479 | `core` resolves metadata via `runtimeVersion(parentHash)` |
| Public RPC throughput (S6) | Only the Parity Asset Hub endpoint is reliable. ~2.2 blocks/s per in-flight request; **~250 blocks/s** at 128 in flight with batched `chain_getBlockHash([n…])`, 0 errors | Publisher batches hash lookups and keeps a high in-flight count; builds are resumable. Naive browser sync of the Revive window ≈ **2–4 days** |
| Balance reconciliation (S4) | **319/319** touched accounts reconcile exactly; closed rule table for all 30 `Balances` variants | L3 verification is sound; rule table lives in `core` |
| Balance-history volume (S4) | Revive window ≈ **24–34 M rows, ~0.6–1 GB gzip (78–130 chunks)**; 52% `Deposit`, 34% `Transfer`, 12% `Withdraw` | Full-window publish is too heavy for the MVP; see §15 decision 5 |
| Kusama AH Recovery (S7) | Pallet since #11,135,052; **inheritance API since #17,836,634** (2026-06-12, spec 2003000) | Recovery-timeline spec `fromBlock = 17836634` |
| Huge blocks (S1) | #20,485,673 holds 1,888 events / 112,929 bytes | Chunk by bytes; one oversized block may form its own chunk |
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

```jsonc
{
  "potluck": 1,
  "name": "polkadot-ah.balance-history",
  "source": {
    "kind": "substrate-events",                  // | "revive-logs" | "multi" (Portaldot)
    "genesisHash": "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f",
    "fromBlock": 11405259                       // Revive active on Polkadot AH (2026-01-27)
  },
  "match": [
    { "pallet": "Balances", "event": "Transfer",  "row": { "kind": "transfer", "from": "$from", "to": "$to", "amount": "$amount" } },
    { "pallet": "Balances", "event": "Deposit",   "row": { "kind": "deposit",  "to": "$who",   "amount": "$amount" } },
    { "pallet": "Balances", "event": "Withdraw",  "row": { "kind": "withdraw", "from": "$who", "amount": "$amount" } },
    { "pallet": "Balances", "event": "Minted",    "row": { "kind": "mint",     "to": "$who",   "amount": "$amount" } },
    { "pallet": "Balances", "event": "Burned",    "row": { "kind": "burn",     "from": "$who", "amount": "$amount" } }
    // + Reserved/Unreserved/Slashed/Endowed/DustLost/ReserveRepatriated ... as needed for reconciliation
  ],
  "columns": ["block", "eventIndex", "kind", "from", "to", "amount"],
  "accounts": ["from", "to"],                   // for per-chunk bloom & per-account queries
  "reconcile": {
    "type": "balance-delta",
    "storage": "System.Account",
    "value": "data.free + data.reserved",
    "delta": { "transfer": "-from +to", "deposit": "+to", "withdraw": "-from", "mint": "+to", "burn": "-from" }
  },
  "chunk": { "maxBlocks": 100000, "maxBytes": 8000000 }
}
```

- `specHash = blake2b-256(canonical JSON of the spec)`. The spec is also stored in TransactionStorage and registered in the registry.
- **No free-form code.** Only `match → row → columns`, so it is deterministic by construction.
- The `kusama-ah.recovery-timeline` spec uses `reconcile.type = "state-replay"`: events are replayed into state (friend group, attempt, inheritor), then compared against the `recovery.*` storage at `toBlock`.
- The `portaldot.unified-history` spec uses `source.kind = "multi"`: `Balances.*` events + `Transfer(address,address,uint256)` logs from all Revive contracts (`eth_getLogs`). Addresses are normalized via `ReviveApi.accountId(h160)`, and the EVM amount is divided by `nativeToEthRatio` when the token is native.

---

## 6. Indexing pipeline (the publisher and direct mode use the same code)

1. **Runtime map:** sample the range, then binary search on `state_getRuntimeVersion` to find the blocks where `specVersion` changes (S1: 161 samples + 144 probes for the Revive window). Metadata per version is cached (disk for the CLI, OPFS for the browser). **Decode block N with the runtime of block N−1's state** (the executing runtime), never with N's post-state version.
2. **Fetch events:** batch `chain_getBlockHash([n1, n2, …])` (up to 500 per call), then `state_getStorage(System.Events, hash)` per block with high bounded parallelism (publisher: ~128 in flight), retry with backoff, resumable checkpoints.
3. **Decode** with the metadata registry of that block's version, then **match** the spec and **project** into rows.
4. **Canonical normalization:**
   - addresses as AccountId32 hex taken from the codec via `toHex()` (never `toJSON()`, which yields SS58), H160 for Revive plus a mapping column;
   - bigint as a decimal string;
   - row order `(block, eventIndex, logIndex)`;
   - JSON with key order = `columns`, one row per line (NDJSON), no whitespace.
5. **Chunking:** split by `maxBlocks` or `maxBytes` (≤ 8 MB after compression); a single oversized block (e.g. 1,888 events in a migration block) may form its own chunk.
6. Per chunk:
   - `rawHash = blake2b-256(NDJSON)`, used for determinism across publishers;
   - `blob = gzip(NDJSON)` (gzip does not need to be deterministic because the blob hash is recorded separately);
   - account **bloom** (4 KB, k=7, target false positive ~1%).
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

## 8. Publish flow (CLI)

```
potluck build   --spec specs/polkadot-ah.balance-history.json --to finalized
potluck publish --network portaldot-testnet   # uses an SS58 account (seed from local env)
```

1. `transactionStorage.store(blob_i)`, one tx per chunk. Record `(tsBlock, tsIndex)` from the `Stored` event.
2. `utility.batchAll([ transactionStorage.store(manifest.json), revive.call(PotluckRegistry, publish(...)) ])`: the manifest and the registration are **atomic** in a single tx (the SS58 account is mapped to H160 automatically).
3. `potluck renew`: renews chunks nearing expiry, then calls `noteRenewal` in the registry. Anyone can call it.
4. `potluck verify <manifestId>`: re-runs the spec and compares `rawHash`, used as a "second publisher" for quorum.
5. `potluck tamper` (demo only): publishes a manifest with one row removed.

---

## 9. The `PotluckRegistry.sol` contract (Revive, EVM bytecode)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PotluckRegistry {
    struct Spec { address author; bytes32 specCid; uint64 createdAt; }
    struct Manifest {
        bytes32 specHash;      bytes32 sourceGenesis;
        uint64  fromBlock;     uint64  toBlock;      bytes32 toBlockHash;
        bytes32 chunksRoot;    bytes32 manifestCid;  // blake2b digest → CID
        uint32  tsBlock;       uint32  tsIndex;      // manifest location in TransactionStorage
        address publisher;     uint64  publishedAt;  uint32  flags;
    }

    mapping(bytes32 => Spec) public specs;
    Manifest[] public manifests;
    mapping(bytes32 => uint256[]) public manifestsBySpec;
    mapping(uint256 => mapping(address => bool)) public flaggedBy;

    event SpecRegistered(bytes32 indexed specHash, address indexed author, bytes32 specCid);
    event ManifestPublished(uint256 indexed id, bytes32 indexed specHash, address indexed publisher,
                            uint64 toBlock, bytes32 chunksRoot);
    event ManifestFlagged(uint256 indexed id, address indexed by, uint32 chunkIndex, uint8 reason, bytes32 evidence);
    event Renewed(uint256 indexed id, uint32 tsBlock, uint32 tsIndex);

    function registerSpec(bytes32 specHash, bytes32 specCid) external;
    function publish(Manifest calldata m) external returns (uint256 id);
    function flag(uint256 id, uint32 chunkIndex, uint8 reason, bytes32 evidence) external; // 1 flag per address
    function noteRenewal(uint256 id, uint32 tsBlock, uint32 tsIndex) external;
    function latest(bytes32 specHash, uint256 n) external view returns (Manifest[] memory);
}
```

- **MVP:** no bond/slashing. A flag is only a public claim; the client verifies on its own and weighs publishers by their flag history.
- **P1:** publisher bond + dispute window with a multisig arbiter (honestly acknowledged as temporary centralization).

---

## 10. Client SDK `@potluck/client`

```ts
const pot = await Potluck.open({
  spec: "polkadot-ah.balance-history",
  source: ["wss://polkadot-asset-hub-rpc.polkadot.io", "wss://…"],   // bring-your-own-node
  portaldot: "wss://test-node-v3.portaldot.dev",
  registry: "0x…", evmRpc: "https://test-evm-rpc-v3.portaldot.dev",
});
pot.on("progress", e => …);                       // "Verifying chunk 7/25…"
const rows = await pot.sql(`SELECT * FROM rows WHERE "from"=?1 OR "to"=?1 ORDER BY block DESC`, [acct]);
const report = await pot.verifyAccount(acct);     // { integrity, rowsChecked, reconciled, details[] }
pot.follow();                                     // live tail
```

**Loader:** read `latest(specHash)` from the registry, fetch the manifest via `bitswap_v1_get`, then fetch **only the chunks whose bloom contains the requested account**. The contents are checked against `rawHash` and `chunksRoot`, then inserted into SQLite.

**Verifier (3 levels):**

| Level | What | Cost | Catches |
|---|---|---|---|
| L1 Integrity | blob hash = CID; `rawHash` = manifest; Merkle root = registry | local | Corrupted/swapped chunks |
| L2 Row truth | for every row belonging to the account: fetch `System.Events` at that block from the source chain, decode, compare | ~1 RPC per unique block | Fake/altered rows |
| L3 Completeness (windowed reconciliation) | for **every** chunk in the range: `balance(A, to) − balance(A, from−1)` = Σ deltas of A's rows in the chunk. For chunks whose bloom says "A is not here", the balance must be unchanged | 2 storage reads per chunk | **Deleted/hidden rows**, including when the bloom is also forged |

**State-replay** (Recovery): events are replayed into state, then compared against `recovery.friendGroups/attempt/inheritor` at `toBlock`.

**Live tail:** `chainHead_v1_follow` (fallback `subscribeFinalizedHeads`). The spec is run on each new block.

**Local storage:** SQLite-WASM (OPFS) per spec, cursor per source, metadata cache per runtime version. Works offline.

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

### Still open
3. Coordination with the Portaldot team about storing up to ~0.6–1 GB on testnet (material for the 28–29 Oct office hour).
4. **User prerequisite:** create a dev SS58 account and request tPOT via a Discord ticket. Not done yet.
5. **Publish scope for the Polkadot AH balance-history spec** (raised by S4: ~0.6–1 GB for the full Revive window). The spec keeps `fromBlock = 11405259`; what changes is what the MVP *publishes*.
   - **Recommended: progressive backfill.** Publish the newest range first (e.g. the last ~1.5 M blocks ≈ 90–140 MB, ~12–18 chunks), then older ranges as extra manifests as testnet capacity and time allow.
     - The client merges manifests, shows a coverage bar, and direct-syncs any uncovered range.
     - This fits the Potluck story: any publisher can "bring a chunk" of older history.
   - Alternatives: publish the full window (heavy on a shared testnet, ~12 h build); or change the demo spec to a lighter one (e.g. Revive contract logs only). The latter weakens the reconciliation (L3) story.
