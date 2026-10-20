# Potluck: final concept (option C, after the reframe)

> 2026-10-20. Core product: **Potluck**. Example dApp: **Wasiat-lite**.
> Background: [IDEAS.md](./IDEAS.md) (Idea 6 & 1), [ROAST.md](./ROAST.md), [ROAST-WASIAT.md](./ROAST-WASIAT.md).

**Tagline:** *Everyone brings a chunk. Every dApp gets the history.*
**One sentence (no jargon):** On-chain history from any chain, opened in seconds in the browser, with no server, stored and guaranteed by Portaldot.

---

## 1. What changed from the original concept

| | Original concept (LUMBUNG) | After the reframe (Potluck) |
|---|---|---|
| Data indexed | Portaldot only | **Any polkadot-sdk-based chain**, prioritizing heavy chains (Polkadot & Kusama Asset Hub). Portaldot itself is still supported. |
| Role of Portaldot | The chain being indexed | **Data layer (warehouse + registry)** for other chains' history |
| Wow moment | "2 seconds", even though a direct sync takes only 5.2 seconds | **~31 hours becomes ~3 seconds** on real Asset Hub data |
| Verification | k random chunks (2.5% chance of catching fraud) | **Reconciliation against the source chain**: per-row claim checks + balance must match (100% for user-owned data) |
| Snapshot | Dependency | **Optional accelerator**: if absent, the client syncs by itself |
| Index spec | Free-form JS handler (rabbit hole) | **Declarative JSON spec** (deterministic by construction) |
| Wasiat-lite | Reverse index (turned out not to need an indexer) | **Real Recovery event timeline** from Kusama AH (121 configurations, 13 completed inheritances) |

## 2. Why this reframe is right

**Data size (measured 2026-10-20):**

| Chain | Blocks | Events/block | Full sync from browser |
|---|---|---|---|
| Portaldot V3 testnet | ~112k | ~0.08 | **5.2 seconds**, does not need Potluck |
| Polkadot Asset Hub | ~22.05 million | ~3.0 | **~31 hours**, needs Potluck |
| Kusama Asset Hub | ~22.78 million | ~4.7 | Tens of hours, needs Potluck |

Both Asset Hubs have public **archive** nodes (block #1000 can be read), so anyone can build and verify an index permissionlessly.

**Why Portaldot has to be the warehouse** (the answer to "why Portaldot is essential" in the pitch deck):
1. **Portaldot's TransactionStorage is permissionless and fee-based.** Anyone can store (0 authorization required), it is cheap (`byteFee` 10 planck/byte), max 8 MB per tx.
2. **Polkadot Bulletin Chain**, its counterpart on Polkadot, **depends on authorization** (per-account quota, no token). Ordinary developers cannot use it directly.
3. **IPFS** needs someone to keep *pinning*, in other words a server. On Portaldot, **validators must prove they still hold the data** (`checkProof` every block) during the retention period.
4. Blobs can be fetched directly from a node via **`bitswap_v1_get`** (tested), without a gateway.
5. The manifest registry lives on **Revive (EVM)**, read from the browser with viem/MetaMask, so it uses the WASM + EVM features at once.
6. In line with Portaldot's own official narrative: a *Layer0 meta-protocol* that "moves data between blockchain protocols".

## 2b. Portaldot as a first-class source ("ready to use" when it gets busy)
The SDK uses **adaptive sync**:
- If a direct sync is estimated at ≤ 20 seconds (Portaldot today, ~5 seconds), the SDK syncs directly.
- If it takes longer, the SDK uses a verified snapshot + gap sync.

Once Portaldot gets busy, snapshots start being published and dApps use them automatically **without code changes**. Portaldot's value today: **unified two-VM history** (Substrate + Revive logs, SS58↔H160, 14↔18 decimals). Details: [ARCHITECTURE.md §2](./ARCHITECTURE.md).

## 3. How it works

```
           SOURCE CHAIN (Polkadot AH / Kusama AH / Portaldot)
                 │  events & state (public archive RPC)
     ┌───────────┴───────────┐
     ▼                       ▼
 PUBLISHER (anyone:        CONSUMER (dApp browser)
 CLI on laptop / browser)    │ 4. fetch manifest from registry
 1. run JSON spec            │ 5. download chunks via bitswap_v1_get
 2. split result → chunks,   │ 6. verify against source chain
    compressed               │ 7. local SQL query + live tail
 3. store & register         │
     │                       │
     ▼                       │
 ┌──────────────── PORTALDOT V3 ─────────────────┐
 │ TransactionStorage : chunk (validator-backed) │
 │ PotluckRegistry.sol (Revive): manifest,       │
 │   publisher, bond, fraud flag                 │
 └───────────────────────────────────────────────┘
```

**Roles:**
- **Source chain:** where the original data lives. Nothing needs to change.
- **Publisher:** anyone who runs the Potluck CLI every once in a while (not an always-on server). They pay the storage fee in POT.
- **Portaldot:** the chunk warehouse (TransactionStorage) and the catalog (registry on Revive).
- **Consumer:** a browser dApp that uses the `@potluck/client` SDK.

**Steps:**
1. **Declarative spec**, for example:
   `{ "chain": "polkadot-asset-hub", "event": "balances.Transfer", "columns": ["from","to","amount"], "chunkBy": "blockRange:100000" }`.
   No free-form code, so the result is guaranteed to be the same on any machine.
2. The **publisher** runs the spec against the source chain's archive RPC. The result is compressed, split into pieces of ≤ 8 MB, then stored with `transactionStorage.store`.
3. The **manifest** `{specHash, chainId, fromBlock, toBlock, toBlockHash, chunks[CID…], merkleRoot}` is registered in `PotluckRegistry` on Revive, with a publisher bond.
4. The **consumer** reads the latest manifest for the spec it needs, then downloads **only the relevant chunks** via `bitswap_v1_get`.
5. **Verification** (the core part):
   - **Integrity:** the chunk hash matches the TransactionStorage record and the manifest's Merkle root.
   - **Per-row correctness:** for rows belonging to the user (for example my account's transfers), the client fetches `System.Events` at that block from the source chain (one call per block) and matches them.
   - **Completeness:** reconciliation. The balance computed from the history must equal the on-chain balance at `toBlock`. If the publisher deletes even a single transfer, the balance does not match and the fraud is **certain to be caught**.
   - **Fraud:** the client flags the manifest on-chain (`flag`), so other consumers ignore it and the publisher's bond can be disputed.
6. **Live tail:** after `toBlock`, the client immediately follows new blocks from the source chain (`chainHead_v1_follow`).
7. **Fallback:** if there is no manifest or the chunk has expired, the client syncs by itself. Slow on a big chain, but it **never depends on anyone**.

**Retention:** chunks last 100,800 blocks (~7 days) and can be `renew`ed by anyone who cares (publisher, dApp, or user). The cost is almost zero.

## 4. MVP scope (reference indexes with real data)

| # | Spec | Source chain | Who uses it |
|---|---|---|---|
| 1 | **Recovery timeline** (`recovery.*`: friend group set, attempt started/approved/cancelled/completed, slash) | **Kusama AH** (real data: 121 configurations, 13 inheritances) + Portaldot V3 | **Wasiat-lite** |
| 2 | **Account transfer history** (native DOT/KSM + assets) | Polkadot AH | Any wallet/dApp; the "31 hours to 3" demo |
| 3 | **Unified Portaldot history** (native transfers + Revive ERC-20 logs, SS58↔H160, 14↔18 decimals) | Portaldot V3 | Hacker House teams (potscan, PortalProof, PotKit, and others) |

**Wasiat-lite** (one screen): enter an address, then a full timeline of that account's inheritance setup and recovery attempts is shown (who the witnesses are, when an attempt started, who cancelled as proof of life, when the inheritance completed), verified against Kusama AH, plus a button to set up the same configuration on Portaldot V3. The narrative: *an inheritance app must outlive its maker's servers, and Potluck makes that possible.*

## 5. Demo scenario (≤ 3 minutes)

1. **The problem (20 seconds):** open the history of a Polkadot Asset Hub account naively and show the progress ("estimated 31 hours").
2. **Potluck (40 seconds):** an incognito window, the same dApp with the Potluck SDK. The full history appears within seconds. The verification panel shows "N rows checked against Polkadot AH ✓, balance matches ✓", and the Network tab contains only connections to the node.
3. **On-chain proof (30 seconds):** click the manifest, open the `store` tx and the registry on the Portaldot testnet.
4. **Attack (40 seconds):** a malicious publisher publishes a manifest with one transfer deleted. Balance reconciliation fails, the manifest is flagged red on-chain, and the client automatically switches to an honest publisher.
5. **Wasiat-lite (40 seconds):** the real inheritance timeline from Kusama AH, then a friend group setup on Portaldot V3 (real tx).
6. **Closing (10 seconds):** "Portaldot becomes the history warehouse for the Polkadot ecosystem. Every byte is paid for in POT."

## 6. Rubric mapping

| Rubric | Evidence |
|---|---|
| **Technical Feasibility 30%** | Real `store` tx + registry + flag on the Portaldot testnet; CLI + SDK + dApp runnable; tests against a live node; incremental commits. |
| **Innovation 30%** | TransactionStorage + bitswap + Revive + multi-chain all at once (exactly "WASM/EVM compatibility, modular architecture, multi-chain capabilities"). The first serverless indexer in the Polkadot ecosystem. Reconciliation-based verification. |
| **Ecosystem Contribution 20%** | A ready-to-use Portaldot index for other teams; creates demand for POT (byteFee + tx fee); positions Portaldot as a *data layer* for Polkadot; open-source. |
| **Business Potential 20%** | The model in §7; market = dApps on hundreds of polkadot-sdk chains that currently pay SubQuery/Subscan or run their own servers. |

**Main track:** **Modular Cloud & Middleware** ("storage/data components, and APIs"). This lane is empty for indexers; the Multi-Chain track already has a strong bridge-zero. The multi-chain side still boosts the Innovation score and the chance at the **Grand Prize** (highest total score).

## 7. Business model
1. A small **protocol fee** on top of the storage fee when publishing/renewing through the official SDK.
2. **Index on demand:** dApps post a bounty (POT/USDT) to keep a given spec always fresh. Publishers are paid per checkpoint that passes verification; the protocol takes a percentage.
3. **Potluck Studio** (a local-first dev tool: spec builder, simulation, manifest monitor) with a paid team tier.
4. **Chain partnerships:** the Portaldot Foundation (which has already budgeted a subsidy for *data services*) and other polkadot-sdk chains that have no indexer.

**First acquisition:** Hacker House teams (index #3 free), the Polkadot/Kusama Hub developer community (index #2), and the Recovery user community on Kusama (index #1).

## 8. Hard questions & answers

| Judge's question | Answer |
|---|---|
| "The RPC node is your backend, isn't it?" | RPC is public infrastructure owned by the chain, not an application server. Any node can be swapped in. Potluck runs not a single server. |
| "Who runs the publisher?" | Anyone, every once in a while: the CLI on a laptop, or a user's browser that has already synced (opt-in). The snapshot is only an accelerator; without it the client still works. |
| "Why is Polkadot data stored on Portaldot?" | It is the only on-chain storage in this ecosystem that is permissionless + validator-guaranteed + fetchable directly from the browser. Bulletin Chain needs authorization; IPFS needs pinning. |
| "Retention is only 7 days?" | `renew` can be called by anyone at almost zero cost. Bounties fund whoever renews. If it expires, fall back to self-sync. |
| "Can the verification be fooled?" | Integrity via hashes; correctness via event checks on the source chain; completeness via balance reconciliation. A malicious publisher is almost certain to be caught by the user whose data was altered. |
| "How is this different from SubQuery/Subscan/TrueBlocks?" | They are servers or need pinning. Potluck: serverless, verified against the source chain, validator-guaranteed data, multi-chain. |
| "What if Portaldot is down?" | The client falls back to a direct sync from the source chain. Slow, but it still works. |

## 9. Main risks
- **Testnet capacity & ethics:** storing hundreds of MB on a testnet. Mitigation: compression, range/account-based indexes, start from a limited range, coordinate with the Portaldot team.
- **Dependence on "unsafe" RPC:** `state_queryStorage` is blocked on Polkadot nodes. Mitigation: use only safe RPC (`state_getStorage` per block, `archive_v1_*`); fast path when available.
- **Public RPC rate limits** when building a large index. Mitigation: limited parallelism, multiple endpoints can be used.
- **Complexity of reconciliation verification** (fee, reserve, lock, dust). Mitigation: start from assets/events whose reconciliation is clean, documented.
