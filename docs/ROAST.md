# Roast: Option C (LUMBUNG + WASIAT-lite)

> 2026-10-20. Framework: roast-my-product (10 dimensions, Value Prop weighted 2×, total 110).
> All numbers below are **measured directly**, not estimated.

## Evidence used for the roast

| Measurement | Result |
|---|---|
| Sync of **all** Portaldot V3 testnet events from block 0 (111,797 blocks) | **5.2 seconds**: 1,754 blocks contain events, **9,202 events in total** (`state_queryStorage`, 8 parallel) |
| Enumeration of `recovery.friendGroups` (for the WASIAT reverse index) | 84 ms, a single `getKeys` call, **no indexer** |
| Polkadot Asset Hub, last 200 blocks (safe RPC, per block) | 867 events (~4.3/block), 1 second |
| Extrapolated full Asset Hub history | **~96 million events, ~3.7 GB raw, ~31 hours** to sync from a browser |
| `state_queryStorage` on a public Polkadot node | **Blocked**: `4003: RPC call is unsafe to be called externally` |

---

## Verdict
**LUMBUNG solves a problem that does not exist on Portaldot today.** The entire history of this chain can be synced from scratch in 5 seconds, so "history from block 0 in 2 seconds" is not a wow moment, it is a *regression* compared to syncing directly.

## Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Value Proposition (2×) | **4/10** | "Verified index snapshot in TransactionStorage" is full of jargon, and its main benefit (first-load speed) is worth zero on a chain with 9,202 events. |
| Crypto Necessity | 7/10 | Data availability guaranteed by validators (storage proof) and the on-chain registry are real. But everything still depends on **a single public RPC node** that happens to have the "unsafe" RPC and bitswap enabled. |
| Target User Clarity | 5/10 | "Portaldot dApp developers" means roughly 30 hackathon teams, and not one of them has been asked whether they need it. |
| First-Time UX | 5/10 | For developers: they must write an "index spec" with a determinism sandbox that has no design yet. For end users: the verification badge is jargon. |
| Core Loop | 4/10 | Infra: the developer integrates once. There is no reason for a publisher to come back other than a bounty that does not exist yet. |
| Competitive Moat | 3/10 | SubQuery/Subsquid support any Substrate chain; once they add a Portaldot endpoint, developers will pick whatever is practical. The publisher network starts from zero. The TrueBlocks precedent already exists. |
| Technical Execution | 5/10 | A hole in the trust model (see #3), dependence on unsafe RPC, JS determinism that is prone to becoming a rabbit hole, and 7-day retention. |
| Naming & Messaging | 3/10 | "Lumbung" means nothing to non-Indonesian judges (nor to Portaldot's Mandarin-speaking partner community). Hard to remember and to spell. |
| Monetization | 3/10 | "Index bounty" is a made-up economy. The only real payer is a Foundation subsidy, so it depends on grants. |
| Market Timing | 4/10 | Too early for Portaldot (the data is small), and on chains where the data is large (Hub), Subscan/SubQuery already exist. |
| **Weighted total** | **47/110** | **Fundamental problems, needs rethinking** (range 30–49). |

---

## The Worst Issues

### 1. The wow moment kills itself
**What's wrong:** The demo "history from block 0 appears in 2 seconds" loses to a naive 5.2-second sync that needs no snapshot, registry, or verification. Portaldot's technical judges know their chain is still empty.
**Why it matters:** Innovation 30% and Technical 30% collapse if a judge asks *"why not just sync directly?"* and the answer is "later, when the chain is big".
**What good looks like:** Demo on data that is **genuinely heavy**, where a naive sync takes hours (Asset Hub ~31 hours), then show the result in seconds.

### 2. "No backend" that is only half true
**What's wrong:** The architecture leans on `state_queryStorage` (an unsafe RPC that is **blocked** on public Polkadot nodes), `bitswap_v1_get`, and archive nodes, all on **one** public Portaldot node. On top of that, the publisher that *renews* chunks every 7 days is usually a cron job on GitHub Actions, which is really a backend in disguise.
**Why it matters:** Judges will ask *"isn't the RPC node your backend?"* and *"who runs the publisher?"*. The project's core claim can be broken with a single question.
**What good looks like:** The snapshot is an **optional accelerator, not a dependency**. If a chunk is missing or expired, the client automatically syncs by itself. Use only safe RPC (`archive_v1_*`, `chainHead_v1_*`, `state_getStorage` per block), with unsafe RPC as a fast path when available. Support multiple nodes (bring-your-own-node).

### 3. Random verification is an illusion of security
**What's wrong:** "Re-execute k random chunks": a malicious publisher who deletes one transfer in one chunk out of 200 is only caught with probability **5/200 = 2.5%**. The "attack detected" demo will look staged.
**Why it matters:** A crypto-literate judge will calculate this immediately. The publisher quorum can also be Sybil-attacked.
**What good looks like:** **Deterministic verification for the user's own data.**
- *Balance reconciliation*: the sum of all incoming and outgoing transfers of an account must equal its current on-chain balance (minus fee/reserve). If one transfer is deleted, the balance does not match, so it is detected **100%** of the time for the affected user.
- *Supply reconciliation* for holder lists.
- Positive claims ("event X exists in block B") are checked with a single storage read.
- Full re-verification runs in the background.

### 4. WASIAT-lite is justified with a false claim
**What's wrong:** I previously said the reverse index "who designated me as a witness" is impossible without an indexer. **That is wrong:** `recovery.friendGroups` can be enumerated in 84 ms with a single call.
**Why it matters:** If a judge tries it, the credibility of the entire pitch is gone.
**What good looks like:** Connect WASIAT through the **narrative**, not through a query: *an inheritance app must stay alive for 20–30 years, longer than the company that built it, so it must not depend on anyone's indexer server.* The data that genuinely needs history is the **event timeline**: who started a recovery attempt, who approved, who cancelled (proof of life), and slashes. That exists only in events, not in state.

### 5. The "custom index spec" scope is a rabbit hole
**What's wrong:** A deterministic JS sandbox with free-form handlers is a research project of its own (The Graph needed years for this).
**Why it matters:** Time runs out on infrastructure the judges cannot see, and the demo ends up half-finished.
**What good looks like:** For the MVP use a **declarative spec** (JSON: event/log filter → columns), which is deterministic by construction, plus 3–4 reference indexes that are built out properly.

---

## Common sins detected
- **Complexity Worship:** snapshot + Merkle + quorum + bond + re-execution for 9,202 events of data.
- **Phantom Users:** "dApp developers need this" when not a single team has been asked.
- **Grant-Dependent:** the only real payer is a Foundation subsidy.
- **Jargon Overload:** "verifiable chunked index manifests with probabilistic re-execution".

## UX red flags (for the example dApp and dev portal)
- **Loading without explanation:** sync/verification must show readable progress ("Verifying 12/12 chunks… matches on-chain balance ✓").
- **Stale data after a tx:** the live tail must update the history optimistically.
- **Jargon-laden verification badge:** replace it with one sentence: "This history matches the balance on the chain".

---

## Fix These 3 Things Now

1. **[Biggest impact] Move the problem to where it is real: make Portaldot the *data layer* for other chains' history.**
   Index the heavy chain (Polkadot Asset Hub/Paseo: ~96 million events, ~31 hours to sync), store its chunks in **Portaldot's TransactionStorage**, and register its manifest in **Portaldot's Revive registry**. The client verifies against the source chain via balance reconciliation.
   - The wow moment becomes real: *31 hours turns into 3 seconds*.
   - Portaldot gets a genuine use case and demand for POT (byteFee).
   - The project ticks **multi-chain + modular + storage** on the rubric all at once.
   - Portaldot's own data is still supported (and fast).
2. **[Easiest] Rename it and write one sentence without jargon, then cut down to a declarative spec.**
   Example: *"On-chain history for any dApp, in seconds, without a server."* No free-form JS handlers in the MVP.
3. **[Existential] Fix the trust model and prove that someone wants to use it.**
   Replace "k random chunks" with **balance/supply reconciliation (deterministic) + positive-claim checks + fallback to self-sync**. Then, before the 24 Oct check-in, DM 5 Hacker House teams (potscan, PortalProof, PotKit, ComplyDot, potdrive) and get **at least 2 teams to integrate**. Real adoption is the only answer to "Phantom Users".

**Projected score after fixes:** Value Prop 7 (14), Crypto 8, Target 7, FTUE 6, Loop 5, Moat 5, Tech 7, Naming 7, Monetization 5, Timing 7, for **≈ 71/110 (Strong)**.

---

## Name candidates

| Name | Tagline | Pros | Cons |
|---|---|---|---|
| **Potluck** ⭐ | *"Everyone brings a chunk. Every dApp gets the history."* | The metaphor matches exactly how it works (everyone contributes pieces of the index, everyone gets to eat); a pun on the **POT** token; easy for international judges to remember and spell; appealing for Community Choice | Sounds casual; "pot" is also slang; generic name (needs a domain/trademark check) |
| **Backfill** | *"Years of chain history. Seconds to load. Zero servers."* | A term developers understand immediately (backfill = syncing history) | Less emotional, sounds like a feature |
| **Memento** | *"Your dApp never forgets, even after its servers are gone."* | Double meaning: *memory* and *memento mori*, ties into WASIAT | Common name, many other products |
| **Kilas** | *"Kilas balik: any chain's history, instantly."* | Local but pleasant to say internationally (KEE-las); short | Its meaning must be explained to foreign judges |
| **Graphless** | *"Indexing without The Graph's servers."* | Sharp positioning against the incumbent | Defines itself through a competitor; trademark overtones |

**Recommendation:** **Potluck** for the protocol/indexer. **WASIAT** stays for the example dApp: its local authenticity becomes a strength of the story, and the pairing is contrasting and memorable ("Potluck powers Wasiat").
