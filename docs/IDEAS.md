# Stage 3: Project Ideas for Portaldot Hacker House 2026

> Compiled 2026-10-20. Basis: [HACKATHON.MD](./HACKATHON.MD) and [RESEARCH-STAGE2.md](./RESEARCH-STAGE2.md).
> All chain feature claims below **have been checked directly against the V3 testnet** (see §0).

---

## 0. Verified feasibility facts (2026-10-20)

| Requirement | Test result on `wss://test-node-v3.portaldot.dev` |
|---|---|
| Statement store is publicly accessible | `statement_subscribeStatement` returns a subscription id; `statement_submit` validates input (malformed data is rejected with `alreadyExpired`). Limits: 4–10 statements per account, 1–4 KB, fee per statement. |
| Historical state (archive node) | State queries at block #10 and #50,000 succeed, so old transactions can be replayed. |
| EVM tracing | `debug_traceBlockByNumber` (callTracer) and `eth_getLogs` work. |
| BEEFY / MMR | `beefy_getFinalizedHead` and `mmr_root` are active; 2 BEEFY authorities. |
| **New-version Recovery pallet (native inheritance)** | `setFriendGroups(Vec<{friends, friendsNeeded, inheritor, inheritanceDelay, inheritancePriority, cancelDelay}>)`, `initiateAttempt`, `approveAttempt`, `finishAttempt`, `cancelAttempt`, `slashAttempt`, **`controlInheritedAccount`**, `revokeInheritor`. Not yet used by anyone. |
| Multisig | Max 100 signatories; 0 multisigs on the chain. |
| Runtime API | `reviveApi`, `oracleApi`, `assetConversionApi`, `nftsApi`, `transactionStorageApi`, `mmrApi`, `beefyApi` are available. |
| Public APIs with CORS (callable directly from the browser) | GLEIF LEI API: `Access-Control-Allow-Origin: *`. BMKG `data.bmkg.go.id`: `*`. |

---

## Idea 1: **WASIAT**, protocol-native crypto inheritance according to faraid

**Summary:** A backendless app that uses Portaldot V3's new-version Recovery pallet to pass on on-chain assets automatically, on a schedule, and in accordance with inheritance law (faraid, Islamic inheritance shares, under the KHI, Kompilasi Hukum Islam, Indonesia's Compilation of Islamic Law, with other rule packs to follow). No custodian smart contract is needed and no seed phrase has to be handed over.

### Problem & target users
- Crypto assets are lost forever when the owner dies without passing on the keys. Current approaches (writing the seed phrase on paper or leaving it with a notaris, notary) are unsafe, and the inheritance process at local exchanges is still manual: inheritance letters, taking months.
- **Specific initial target:** Muslim crypto holders in Indonesia who want the distribution to follow faraid. Faraid distribution is deterministic but complicated (ashabul furudh, ‘ashabah, ‘aul, radd), and this is the source of family disputes.
- Secondary target: holders of small RWA/treasury assets on Portaldot who need a "succession plan".

### Why it is anti-mainstream
- Existing "crypto inheritance" products (Casa, Vault12, Sarcophagus, Safe-based dead-man-switches) depend on custodians, ping servers, or smart contracts that hold funds. **WASIAT holds no funds at all.** The inheritance is executed by the chain's own *runtime* through friend groups that have priorities and time delays.
- No product yet combines on-chain inheritance with an **auditable faraid engine** and executes that distribution atomically in a single transaction.
- The "inheritor" version of the Recovery pallet is the newest polkadot-sdk feature; on Portaldot there is not a single configuration yet.

### Lessons from past winners applied
- *Native-ness*: built on a pallet that **exists in no EVM** (like CoreDEX with coretime, PolyDot with Substrate identity).
- *A real, emotional, concrete life problem* (like Proof of Delay, Esmond payroll).
- *A real transaction demo with before/after* (like pdk): the account "dies", then the heirs receive their shares.
- Avoids saturated lanes (not an AI copilot, not monitoring, not payments).

### Rubric fit
| Rubric | How |
|---|---|
| Technical Feasibility 30% | All calls already exist in the runtime (§0). Deliverables: a faraid engine (pure TypeScript + tests of cases from the classical texts), an encoder for `controlInheritedAccount(utility.batchAll([...transfers, vesting.vestedTransfer]))`, a Solidity `WasiatRegistry` contract on Revive (hash of the wasiat (bequest) deed and encrypted heir metadata), a demo tx on testnet. |
| Innovation 30% | First use of Recovery-inheritance on Portaldot. Combines the WASM runtime (pallet) with the EVM (registry and MetaMask access), plus the Statement store as an "alarm" to the owner. |
| Ecosystem Contribution 20% | Open-source SDK `@wasiat/recovery` (helpers for friend groups, priorities, batch encoder) that any wallet on a polkadot-sdk chain can use. An account security feature that gives ordinary people the confidence to store assets on Portaldot. |
| Business Potential 20% | B2C: setup fee per plan and renewal fee. B2B: white-label licensing for exchanges/wallets (exchange inheritance processes are currently manual). Partnerships with notaries and sharia financial institutions. Indonesian and global Muslim market. |

### Real data sources
- Chain: balances, assets (`Assets`), NFTs, and recovery status directly from the Portaldot node.
- Faraid rules: Kompilasi Hukum Islam (KHI) Articles 171–193, encoded as an open ruleset and tested against example cases from fiqh literature. These are real rules, not sample data.
- Prices (optional): `AssetConversionApi` quotes from the chain.

### Backendless architecture
```
Browser (static SPA, IPFS/Vercel static)
 ├─ polkadot-api / @polkadot/api ──WSS──▶ Portaldot V3 node
 │    ├─ recovery.setFriendGroups([...])         ← owner (once)
 │    ├─ recovery.initiate/approve/finishAttempt  ← family/witnesses
 │    ├─ recovery.cancelAttempt                    ← owner still alive = "proof of life"
 │    └─ recovery.controlInheritedAccount(lost, utility.batchAll([...]))
 ├─ Faraid engine (TS, deterministic, in the browser) → produces the list of shares + batch call
 ├─ Statement store (statement_submit/subscribe)  → real-time alarm to the owner when a recovery attempt occurs
 └─ viem ──HTTPS──▶ EVM RPC → WasiatRegistry.sol (deed hash, encrypted heirs, plan version)
```
- Prioritized friend groups: for example group 0 = spouse and siblings (30-day delay), group 1 = notary and 2 witnesses (90-day delay).
- Inheritor = **heirs' multisig**. On execution, the app builds a single `batchAll` containing transfers according to faraid, and for minor heirs the share is locked via `vesting.vestedTransfer` until age 18.

### Business model & first-user acquisition
- Freemium: the basic plan is free (open-source SDK). The "Complete" plan (faraid, multi-asset, child vesting, PDF deed) is charged a one-time on-chain fee through the registry.
- Acquisition: the Indonesian sharia crypto community, sharia fintech study circles/ustadz, the Portaldot community (Discord), and notary collaboration. First users: the Hacker House teams themselves ("protect your project's treasury").

### Demo wow moment
> ⚠️ Correction (see [ROAST-WASIAT.md](./ROAST-WASIAT.md)): "the phone rings without a server" only holds while the app is open. Real push notifications require a server. The faraid distribution must also be computed at execution time, not at setup time.

On stage: the owner "disappears". A witness starts recovery, and **the owner's phone rings immediately** via the Statement store, without a server. The owner cancels, this is the *proof of life*. Then a second scenario: there is no cancellation, the delay (accelerated on testnet) expires, one click on `finishAttempt`, and within **a single block** the assets are split among 5 heirs exactly according to faraid. The children's share is locked by vesting until age 18. Everything is clickable through to the explorer.

### Risks & hard judge questions
- *"What if the witnesses collude?"* There is a threshold, a time delay, the owner's right to cancel, `slashAttempt` (the attacker's deposit is forfeited), and group priorities.
- *"Is this valid under Indonesian inheritance law?"* This product is an execution tool, not a replacement for the determination of heirs. A "court/notary determination" mode (notary group) is provided, with a disclaimer.
- *"Does faraid differ between madhhabs?"* The ruleset is configurable (KHI by default) and audited in tests.
- *"Why Portaldot?"* This inheritance pallet exists in the Portaldot V3 runtime, and on the EVM it requires a custodian contract.
- Technical risk: the Recovery pallet is new, and edge-case behavior needs to be tested. Gas on the `finishAttempt` side is borne by the caller.

---

## Idea 2: **COSIGN**, serverless multisig & treasury for two runtimes

**Summary:** The first multisig/treasury coordinator that is 100% backendless. Call data is stored in TransactionStorage, notifications between signers run in real time through the Statement store, and a single Substrate multisig can execute both pallet actions and Solidity contracts (Revive).

### Problem & target users
- Multisigs on Polkadot (Multix, Polkasafe, Mimir) and Safe on the EVM **depend on a backend**: a Subsquid indexer, Firebase, or the Safe Transaction Service. On a new chain like Portaldot that backend does not exist, so there are **0 on-chain multisigs**. The chain is even still controlled by a single-key **Sudo**.
- Targets: (1) the Portaldot Foundation and core team (Sudo → multisig/committee path), (2) the treasuries of ecosystem project teams that win the Hacker House, (3) DAOs and crypto SMEs that hold shared funds.

### Why it is anti-mainstream
A multisig UI is an already familiar category. What is new is the **architecture**: there is no server at all, call data lives on-chain (TransactionStorage, retention of about 7 days), and signers signal each other through node gossip. Add **cross-VM** execution (an SS58 multisig calling `revive.call` on a Solidity contract), which neither Safe nor Multix can do.

### Lessons from past winners
The judges are chain teams, so tools that close the gaps they feel themselves (Sudo, 0 multisigs) are rated highly, like pdk and Palletman. The *Statement store* and *TransactionStorage* features have not been touched by other participants for coordination.

### Rubric fit
| Rubric | How |
|---|---|
| Technical 30% | Multisig + Proxy pallets (pure proxy as a stable treasury address) + Utility.batchAll + metadata decoding so every call is human-readable + TransactionStorage + Statement store + Revive. |
| Innovation 30% | The first "serverless multi-user app" pattern on Portaldot. A bridge between two runtimes in a single approval flow. |
| Ecosystem 20% | The `@cosign/signal` package (pub/sub on top of the Statement store), which other dApps can use for notifications/chat. A Sudo → multisig migration kit. |
| Business 20% | Free up to N signers. Team tier: a small on-chain fee per executed batch. White-label licensing to other polkadot-sdk chains. |

### Real data sources
Chain (multisig events, runtime metadata, balances, Revive contracts). No synthetic data.

### Backendless architecture
```
Proposer ─▶ transactionStorage.store(callData)  → CID / hash
         ─▶ multisig.approveAsMulti(callHash)
         ─▶ statement_submit(topic=hash(multisig), data={callHash, CID})
Other signers (browser) ◀─ statement_subscribe(topic) → fetch callData via bitswap/TS → decode with metadata → sign
Last signer ─▶ multisig.asMulti(call)  → the call can be revive.call(SolidityContract, …)
```

### Business model & acquisition
Offer it directly to the Foundation (use it in office hours) and to other Hacker House teams for their prize treasuries. Cross-adoption during the event becomes proof and adds Community Choice votes.

### Wow moment
Three laptops. The proposer creates a treasury payment and within ≤ 1 block the other two laptops show a pop-up containing a human-readable call. **Open the Network tab: there is only a WSS connection to the node, no server.** The final approval executes a POT transfer and calls a Solidity contract in a single transaction.

### Risks & hard questions
- *"The Statement store is best-effort, what if a message is lost?"* There is a fallback of polling the chain's `NewMultisig` event, since the Statement store is only an accelerator.
- *"How is this different from Multix?"* Multix needs an indexer. Cosign runs on a chain that does not even have an indexer.
- The Statement store limits (max 10 statements/account, 4 KB) cap the volume. TransactionStorage retention is about 7 days: expired proposals need `renew`.

---

## Idea 3: **GANDA**, a shield against double invoice financing (double-financing)

**Summary:** A backendless receivables registry where invoice-financing lenders detect invoices already financed by another lender **without revealing data to each other**, with buyer (debtor) confirmation using passkey/Face ID verified in a PolkaVM contract.

### Problem & target users
- The number one fraud in invoice financing/factoring: **the same invoice financed at several lenders at once**, or fictitious invoices. In Indonesia there is no real-time cross-platform receivables registry. Productive P2P lenders rely on PDF documents and manual phone calls to the debtor.
- Targets: invoice financing/productive P2P lending platforms, BPR (rural banks), and factoring companies. Aligned with Portaldot's positioning (RWA and physical industry).

### Why it is anti-mainstream
Hackathons usually produce "invoice tokenization" projects (PotKit and AssestDot already did it). GANDA instead builds the **anti-fraud layer needed before any tokenization can be trusted**. The fingerprint is normalized (seller + buyer NPWP/LEI (tax ID/legal entity identifier) + number + amount + date) so an attempt to "change the invoice number format" is still caught. Debtor confirmation uses **WebAuthn P‑256 verified in PolkaVM (Rust)**, which is expensive to do on a pure EVM.

### Lessons from past winners
Esmond (payroll replacing SWIFT), DPO2U (compliance), and PolkaOracle show a real financial problem plus missing infrastructure. PVM's ability to run Rust for heavy cryptography has proven to be valued (Polkadot Rust Bridge, ZKNative).

### Rubric fit
| Rubric | How |
|---|---|
| Technical 30% | Registry contract (Solidity, EVM) + P‑256/WebAuthn verifier (Rust, PVM) + fingerprint normalization + business-entity identity validation via GLEIF (called from the browser) + Statement store alerts. |
| Innovation 30% | Meaningful dual-VM (EVM for the registry, PVM for crypto). Debtor confirmation without a wallet. |
| Ecosystem 20% | An RWA primitive that other tokenization projects can use (PotKit and others can check GANDA before minting). |
| Business 20% | Fee per registration or per check, paid by lenders. The value is clear: a single prevented fraud already covers years of fees. |

### Real data sources
GLEIF LEI API (global legal entity identity, open CORS). Invoice fingerprints from documents uploaded by users. WebAuthn signatures from real devices. Chain data.

### Backendless architecture
Lender browser → compute the fingerprint locally → `GandaRegistry.register(fp, lenderId)` (EVM) → on a collision, revert and the previous holder is alerted via the Statement store. The buyer opens a link → the passkey signs `fp` → `PvmWebAuthnVerifier.verify()` → status "Confirmed by debtor".

### Business model & acquisition
Fee per invoice (for example the equivalent of Rp 2–5 thousand), with a pilot consortium of 2–3 lenders. Entry through funding fintech associations and BPR communities.

### Wow moment
Lender A registers an invoice. Lender B tries to register the **same invoice with the number format changed** and is immediately **rejected within 1 block**, while Lender A receives a real-time alert. Then the "buyer" confirms the invoice using Face ID on a phone, and the on-chain status changes.

### Risks & hard questions
- *"Where does the real invoice data come from?"* This is the weakest point. The demo uses documents that users actually upload. Without a pilot lender, judges may consider the data self-made.
- *"Fingerprint brute force?"* All that leaks is the fact "this invoice has already been financed", and even that only to parties who already know the details. This trade-off is deliberate.
- Cold-start problem: the registry is only valuable if many lenders join (network effect).
- Regulation (OJK, Indonesia's Financial Services Authority; personal data protection): no personal data on-chain, only hashes.

---

## Idea 4: **REWIND**, a cross-VM "time-travel" debugger for Revive

**Summary:** Paste a failed transaction hash, and REWIND shows the EVM/PVM call tree, pallet events, 14↔18 decimal conversion, and the SS58↔H160 mapping. Users can change one parameter and **re-run the transaction at its original block** (historical dry-run), all in the browser.

### Problem & target users
- Revive developers are blind when a transaction fails: Substrate errors (DispatchError) and EVM errors (revert) are separate, the decimals differ, and addresses are dual. Tenderly/Phalcon support neither Portaldot nor PVM.
- Targets: Portaldot developers (including the 136 Hacker House participants), then Polkadot Hub developers and other Revive chains.

### Why it is anti-mainstream
Explorers (potscan) and diagnostics (ReviveScope) only **display**. REWIND **re-runs** the transaction on historical state via `ReviveApi` and merges two worlds (Substrate and EVM) in a single trace. It does not yet exist in the Polkadot ecosystem.

### Lessons from past winners
This is the pattern of the S1 champion (pdk: fail → diagnose → fix) and the champion of the Polkadot Solidity Hackathon EVM track (Relaycode Studio, a dev tool in the browser), brought to V3, whose foundations are new.

### Rubric fit
| Rubric | How |
|---|---|
| Technical 30% | `debug_trace*` (callTracer), `state_call ReviveApi_call` at the parent block (archive state is proven available), metadata decoding, ABI decoding, unified trace. |
| Innovation 30% | Cross-VM debugging and historical dry-run without a server. |
| Ecosystem 20% | Immediately used by all participants. A CLI/CI package to fail PRs if a contract reverts. |
| Business 20% | Open-core. Pro tier: team workspace with encrypted replay bundles in TransactionStorage. Licenses/grants from other Revive chains. |

### Real data sources
Real transactions on testnet/live, runtime metadata, ABIs from verified contracts or user input.

### Architecture
SPA, connected to the EVM RPC (trace, `eth_call` at block N) and to the Substrate RPC (events, `state_call` at block N). Decoding and rendering are done locally.

### Wow moment
Paste a failed tx and within 2 seconds a trace appears showing the cause (for example a 10,000× wrong decimal). Change one number, click "Rewind @ block #N" to simulate success on the old state, then "Send fixed" and the real tx succeeds.

### Risks & hard questions
- Depends on public archive nodes (if pruned, the historical feature disappears).
- Perceived overlap with potscan and ReviveScope, so the differentiation must be sharp.
- The dev tool business on a small chain is thin, so the argument must rest on portability to Polkadot Hub.
- The Node Ops & Tooling track contains 8+ monitoring projects, so judges may tire of the tooling category.

---

## Idea 5: **MIRROR**, proof of Portaldot state carried by the user to Polkadot Hub, without a relayer

**Summary:** A PolkaVM contract on Polkadot Hub (Paseo) that verifies a BEEFY commitment + MMR proof + Portaldot storage proof. The proof is fetched by the **user's own browser**, so there is no relayer or server, and Portaldot assets/certificates can be read by Polkadot Hub DeFi.

### Problem & target users
Portaldot has no XCM, so it is isolated from the Polkadot ecosystem. RWA/asset issuers on Portaldot cannot prove ownership to protocols on the Hub. Target: Portaldot projects that want to reach Polkadot Hub users and liquidity.

### Why it is anti-mainstream
Bridges usually need a relayer (including bridge-zero in this hackathon, which uses GRANDPA to Ethereum). MIRROR uses **BEEFY**, which was designed for bridges, Substrate trie verification in **PVM (Rust)**, and a **proof-carrying transaction** model: the user brings their own proof.

### Rubric fit
Technical: very deep (BEEFY ECDSA, MMR, blake2 trie on PVM). Innovation: multi-chain without a relayer. Ecosystem: opens Portaldot to the Hub. Business: weakest, because the end user is not yet clear.

### Data sources
Headers, BEEFY commitments, `mmr_generateProof`, `state_getReadProof` from the Portaldot node. All real.

### Wow moment
A Portaldot balance/asset "appears" in a Polkadot Hub contract and can be used as an access requirement, with no server in the middle, cryptographically verified.

### Risks & hard questions
- *"BEEFY has only 2 authorities, so we trust 2 keys?"* Correct, the security is equal to the Portaldot validator set.
- Collides directly with bridge-zero (66 commits, already running).
- High complexity and a blurry target user, so Business Potential is weak.

---

## Idea 6: **LUMBUNG**, a backendless indexer whose "granary" is the chain itself

> Added 2026-10-20 at the user's request: answering the problem "dApps are forced to have a backend because they need an indexer".

**Summary:** A *local-first* indexer that runs in the browser. Its index output is deterministically chunked and stored **in Portaldot's TransactionStorage** (validators must prove they still hold it). Its manifest is registered in a Revive contract, so a new dApp only needs to download, verify, and then continue syncing by itself. No indexer server, database, or API key is needed.

### Feasibility facts (tested 2026-10-20)
| Test | Result |
|---|---|
| Substrate event sync | 300 blocks (`System.Events` per block, in parallel) in **510 ms**; `state_queryStorage` over 1,000 blocks in 276 ms |
| EVM logs | `eth_getLogs` from block 0 to latest in **0.4 seconds** |
| Storing blobs | `transactionStorage.store(bytes)` can be used by **anyone** (0 authorization required); max 8 MB/tx; `entryFee` 1000 + `byteFee` 10 planck/byte, so 8 MB ≈ 0.00000084 POT (+ tx fee); retention 100,800 blocks (~7 days), extended with `renew` |
| Fetching blobs from the browser | `bitswap_v1_get(CID)` on a public node **returns the blob contents** (tested on existing 16 KB data) |
| Archive state | Available (query at block #10 succeeded), so re-execution of any range is possible |
| Competitors at the Hacker House | **No** indexer repo |

### Problem & target users
- Every dApp needs historical data: transaction history, token holders, NFT lists, pending multisigs, "which accounts designated me as a witness". The node RPC only answers "current state", so developers are forced to rent SubQuery/Subsquid/The Graph or build their own server. **For Portaldot V3 there is not a single indexer.** Its official explorer (polkadot.js) does not even have account history.
- The Foundation even offers a post-hackathon *"servers, databases, data services" subsidy*. That is proof this cost is real.
- **Target:** dApp developers on Portaldot (including about 136 Hacker House participants), then other polkadot-sdk chains (Polkadot Hub, Bulletin Chain).

### Why it is anti-mainstream
- Indexers themselves are a common category (The Graph, SubQuery, SQD, Envio, Ponder, Goldsky, Subscan API), **but all of them are servers**, whether self-hosted or an operator network.
- The closest precedent is the **TrueBlocks Unchained Index** (Ethereum): address index chunks on IPFS with a manifest in a smart contract. Its weaknesses are that IPFS needs someone to keep *pinning*, and the index only covers address "appearances".
- **LUMBUNG's differentiators:**
  1. Data availability is guaranteed by the **chain's validators** through storage proofs, not by pinning.
  2. Freely user-defined indexes (not only addresses).
  3. Unifies **Substrate events + EVM logs** (two VMs) with SS58↔H160 and 14↔18 decimal normalization.
  4. Runs entirely **in the browser**.

### Core design
1. **Index Spec**: a pure, deterministic TypeScript handler module (no `Date`, no random, restricted I/O), bundled and then hashed. The code itself is also stored in TransactionStorage, so everyone runs identical code.
2. **On-chain-cached map, local reduce**: chunks contain the *map output* per block range, i.e. stateless derived rows (for example `Transfer{from,to,amount,block,vm}`). Aggregation (balances, ownership, history) is computed locally in **SQLite-WASM (OPFS)**. As a result **any chunk can be verified independently and cheaply.**
3. **Publish**: anyone (a developer CLI, a team's GitHub Action, or even an already-synced user browser, opt-in) stores chunks in TransactionStorage, builds a Merkle root, then registers the manifest `{specHash, blockNumber, blockHash, chunks[], root}` in the **`LumbungRegistry`** contract (Solidity on Revive) with a publisher bond.
4. **Consume & verify** in the browser:
   - (a) download chunks via `bitswap_v1_get`, then match them against the `contentHash` recorded on-chain;
   - (b) check the **quorum**: several independent publishers announce the same root;
   - (c) **re-execute k random chunks** yourself against the archive node; a single mismatch is enough for the publisher to be flagged on-chain and ignored;
   - (d) continue with a **live tail** from the latest finalized block (`chainHead_v1_follow`).
5. **Query**: local SQL and the React hook `useLumbung(spec).sql(...)`. Works offline.

```
Browser dApp
 ├─ LumbungRegistry (EVM, viem) ─▶ latest manifest + publisher quorum
 ├─ bitswap_v1_get (WSS node)    ─▶ index chunks (guaranteed to exist by validators)
 ├─ Verifier (Web Worker)        ─▶ check hash + re-execute k random chunks via archive RPC
 ├─ SQLite-WASM (OPFS)           ─▶ local reduce, SQL queries, offline
 └─ chainHead_v1_follow          ─▶ live tail of new blocks
Publisher (anyone, occasionally) ─▶ transactionStorage.store(chunks) + registry.publish(manifest)
```

### Reference indexes released immediately (real data, used by other teams)
1. **Unified account history** (native POT transfers + Revive ERC-20, SS58 and H160 merged): a feature the official explorer does not have.
2. **ERC-20/721 holders** for all Revive contracts on testnet.
3. **Pending multisigs** per signatory.
4. ~~**Recovery reverse index**~~ **Recovery event timeline** (who initiated, approved, cancelled, and slashed recovery attempts). *Correction (see [ROAST.md](./ROAST.md)): the reverse index "who designated me" turns out to be obtainable without an indexer, because `recovery.friendGroups` can be enumerated in 84 ms. What truly needs an indexer is its event history.*

### Lessons from past winners applied
The three S1 champions and the champion of the Polkadot Solidity Hackathon EVM track were all **tools that patch ecosystem gaps felt by the judges**. The indexer is the most fundamental gap. A pdk-style "before/after" demo: a dApp without history vs full history in 2 seconds. Native-ness: TransactionStorage + bitswap exist on no EVM chain.

### Rubric fit
| Rubric | How |
|---|---|
| Technical 30% | Determinism pipeline, Merkle manifest, probabilistic verification, SQLite-WASM, two-VM sync, Revive registry, real testnet txs (store, publish, flag). |
| Innovation 30% | "Chain as an indexer CDN": uses TransactionStorage + bitswap + Revive + Substrate events all at once. Exactly "modular architecture" and "WASM/EVM compatibility" from the rubric. |
| Ecosystem 20% | Infrastructure needed by **every** dApp. Ready-to-use reference indexes for other teams at this event, so cross-adoption becomes proof. |
| Business 20% | (1) *Index bounty*: dApps fund index freshness, publishers are paid per attested checkpoint, the protocol takes a fee. (2) Lumbung Studio (a local-first dev tool) is paid for teams. (3) Partnerships and chain grants (Portaldot has already budgeted a data services subsidy; Polkadot Bulletin Chain uses the same storage model, so it is portable). |

### Business model & first-user acquisition
Approach the Hacker House teams on Discord this week ("your dApp's transaction history in 5 lines of code, no server"). Offer it to the Foundation as an "explorer history layer" for Node Console. After that, move into Polkadot Hub.

### Demo wow moment
1. Open the dApp in an incognito window: **the entire history from block 0 appears in about 2 seconds**, with green verification badges ("chunks guaranteed by validators ✓", "3 publishers agree ✓", "5 random chunks re-executed ✓"). The Network tab contains only WSS and node RPC.
2. Send a tx and the history grows live.
3. **Attack demo:** a malicious publisher uploads a fake snapshot (one transfer removed). The client detects it through re-execution, flags it red on-chain, then automatically switches to an honest publisher.

### Risks & hard judge questions
- *"Isn't the node RPC also a backend?"* It is public infrastructure owned by the chain, not an application-specific server. It can be swapped for any node, and in the future it can use a light client (smoldot).
- *"Disputes can't be adjudicated on-chain?"* Correct. A contract cannot read Substrate events, so the security model is quorum + client verification + reputation/bond. Roadmap: storage proofs of `System.Events` against the state root.
- *"7-day retention?"* Chunks must be `renew`ed or republished. The cost is nearly zero (byteFee 10 planck), and anyone who cares can extend them.
- *"Scale?"* The chain is still young (about 112k testnet blocks). Chunks are partitioned per range and per spec, and clients only download the specs they need.
- *"JS determinism?"* There is a sandbox, a restricted API, cross-machine test vectors, and canonical serialization.
- Execution risk is higher than WASIAT because there are more components.

---

## Comparison table

Scale 1–5 (5 = best). "Quiet lane" = how few competitors there are at this Hacker House.

| Criterion | WASIAT | COSIGN | GANDA | REWIND | MIRROR |
|---|---|---|---|---|---|
| Track | Ecosystem DApps | Modular Cloud & Middleware | Ecosystem DApps (RWA) | Node Ops & Tooling | Multi-Chain |
| No mock data/features | 5 | 5 | 3 | 5 | 5 |
| No backend | 5 | 5 | 5 | 5 | 5 |
| Real problem + specific user | 5 | 4 | 5 | 4 | 2 |
| Anti-mainstream | 5 | 3 | 4 | 3 | 4 |
| Rubric fit (V3 features) | 5 | 5 | 4 | 4 | 4 |
| Market + business model | 4 | 3 | 5 | 3 | 2 |
| Wow moment | 5 | 4 | 4 | 4 | 3 |
| Technical depth | 4 | 4 | 5 | 4 | 5 |
| Quiet lane (competition) | 5 | 4 | 4 | 2 | 1 |
| Execution risk (5 = low) | 4 | 4 | 3 | 4 | 2 |
| **Total (/50)** | **47** | **41** | **42** | **38** | **33** |
| Estimated judge rubric score* | **~92** | ~84 | ~83 | ~80 | ~72 |

*Estimate: Technical 30 + Innovation 30 + Ecosystem 20 + Business 20, based on the qualitative assessment above.

## Recommendation: **WASIAT**

1. **Most "native":** built on the newest Recovery-inheritance pallet in the Portaldot V3 runtime, which **no one has used yet**. The answer to "why Portaldot?" is very strong: on the EVM this needs a custodian contract.
2. **Empty lane:** no other Hacker House participant is in this area, whereas monitoring, AI payments, and bridges are already crowded.
3. **Real-world, emotional, specific:** asset inheritance with faraid for the Indonesian Muslim market, then other inheritance law rulesets (KUHPerdata, the Indonesian Civil Code; China's Civil Code 民法典) as an expansion. That is also relevant to Portaldot's partner communities in Asia.
4. **Strongest wow moment:** a serverless real-time alarm, then an atomic inheritance distribution within one block. Easy for non-technical judges to understand and appealing for Community Choice voting.
5. **Technical depth can be showcased:** prioritized friend groups, cross-pallet batches (Recovery + Utility + Vesting + Multisig), Statement store, Revive registry, and a tested faraid engine.
6. **Can absorb other ideas:** COSIGN's Statement store signal layer can be used as WASIAT's alarm module, which also raises its ecosystem contribution (SDK).

**Second alternative:** GANDA, if you want to bet on Business Potential and the RWA narrative. The risk lies in the source of real invoice data.
