# Roast: WASIAT (Idea 1)

> 2026-10-20. Framework: roast-my-product (10 dimensions, Value Prop 2×, total 110). The numbers below are measured directly from the chain.

## Evidence used for the roast

| Measurement | Result |
|---|---|
| Inheritance-version Recovery pallet (`friendGroups`/`inheritor`) on other chains | **Kusama Asset Hub: already live**, 121 configured accounts, 14 recovery attempts, **13 completed inheritances**. Not present on the Polkadot relay chain, Polkadot Asset Hub, Kusama relay chain, Paseo Asset Hub, or the old Portaldot mainnet. |
| Usage pattern on Kusama AH | Mostly experiments: 89/121 have only 1 friend, 104/121 have `friendsNeeded = 1`, 68/121 have `inheritanceDelay = 0`. A small portion are serious (delay 1.2 million–2.6 million blocks). |
| `securityDeposit` | Kusama AH: 166,666,666,500 planck (~0.17 KSM), max 9 friends. **Portaldot V3: `0`**, max 100 friends. |
| Configured accounts on Portaldot V3 (test & live) | 0 |

---

## Verdict
**WASIAT is a sharia inheritance product for users who do not exist, on a chain that has no assets yet, with a name that is wrong according to the very fiqh (Islamic jurisprudence) it wants to serve.**

## Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Value Proposition (2×) | 6/10 | "Automatically bequeath crypto according to faraid (Islamic inheritance shares) without handing over a seed phrase" is clear and emotional. Marked down because its promise ("split automatically according to faraid") cannot be fulfilled under fiqh (see #2). |
| Crypto Necessity | 8/10 | On-chain enforcement with a delay + owner veto + slashing without a custodian. That is real and cannot be replicated with a database. But there is a comparison question: why not Shamir (SLIP-39) to the heirs, which works on any chain? |
| Target User Clarity | **3/10** | The intersection "Indonesian Muslims × self-custody × holding assets on Portaldot" ≈ **zero people**. |
| First-Time UX | 4/10 | The owner must recruit 2–5 friends who **have a wallet + POT**, and the heirs (including parents and children) also need wallets. Multi-party onboarding, some of whom are not crypto users. |
| Core Loop | 2/10 | Set it and forget it. One-time use. Proof-of-life reminders need notifications, and notifications need a server. |
| Competitive Moat | 3/10 | The pallet does the heavy lifting. The UI can be copied in a few days. The same pallet is already live on Kusama AH, so Nova/Talisman/Polkadot App will very likely build a native UI. |
| Technical Execution | 6/10 | The pallet is real and battle-tested on Kusama. But `securityDeposit = 0` on Portaldot, the precomputed faraid split is conceptually wrong, and the Statement store alarm only arrives if the app is open. |
| Naming & Messaging | 4/10 | **"Wasiat" ≠ faraid.** In fiqh, wasiat (bequest) is capped at a maximum of ⅓ of the estate and may not go to heirs, whereas faraid is the distribution among heirs. Users who know fiqh (our own target) will correct it immediately. |
| Monetization | 3/10 | Pay once in an almost empty market. B2B licensing to exchanges (Indodax/Tokocrypto/Pintu) is irrelevant, because their customers' assets are custodial and not on-chain accounts owned by the customers. |
| Market Timing | 5/10 | The feature is new (good), but Portaldot has no valuable assets yet, and Polkadot Hub does not have this pallet yet. |
| **Weighted total** | **50/110** | **Needs significant work** (range 50–69). |

---

## The Worst Issues

### 1. The intended users do not exist
**What's wrong:**
- Most Indonesian crypto holders keep their assets on **custodial exchanges**, which WASIAT cannot touch.
- Those who self-custody hold BTC/ETH/SOL, not assets on Portaldot.
- The segment that cares most about faraid also overlaps with the segment that is skeptical of crypto: the Ijtima Ulama MUI 2021 (2021 decision of the Indonesian Ulema Council) declared crypto haram as a currency, and conditional even as a commodity.

**Why it matters:** Business Potential (20%) demands "real market needs" and "clear target users". A judge only needs to ask "how many realistic initial users?" and the answer is close to zero.
**What good looks like:** Pick a segment that **already holds assets on a chain that has this pallet**. Or switch the persona to a more real risk that is closer to the judges: **key-person risk in crypto teams**. If a founder or admin-key holder dies or disappears, the treasury and contract admin rights are locked forever. The Hacker House teams themselves are examples of users who can be named.

### 2. Faraid cannot be computed in advance
**What's wrong:** The faraid share is determined by the **conditions at the time the decedent dies**:
- who is still alive (hajb (exclusion of heirs)),
- marital status,
- children born after the plan was made.

On top of that, **debts and funeral costs must be settled first**, then the wasiat (max ⅓, not for heirs), and only the remainder is divided by faraid. Determining the heirs in Indonesia also goes through the Pengadilan Agama (Religious Court) or a notaris (notary). The design "`batchAll` computed at setup then executed atomically" is **wrong under both fiqh and law**.

**Why it matters:** A Muslim judge or a notaris will break the core of the product. Users who follow wrong numbers can end up in family disputes, which is exactly the problem they wanted to prevent.
**What good looks like:** Separate **facts** from **execution**:
1. The owner sets the *rules* (a KHI (Indonesia's Compilation of Islamic Law) ruleset, wasiat ≤ ⅓ for non-heirs, a list of debts).
2. At execution time, **a notaris/witness group attests the facts** (who is alive, remaining debts) on-chain.
3. The faraid engine computes **at that moment**, and the heirs' multisig executes.

WASIAT becomes an *auditable calculator and executor*, not a judge.

### 3. The wow moment rests on a false claim
**What's wrong:** "The owner's phone rings instantly without a server" is **not possible**. The Statement store only reaches clients that are open and connected. Push notifications to a phone (Web Push/FCM/APNs) need a sending server. The proof-of-life mechanism, the security core of this product, is in fact its weakest part.
**Why it matters:** If the demo uses a phone with the app open and then claims "no server", technical judges will ask about it, and the project's honesty is on the line.
**What good looks like:** Proof-of-life security rests on a **long delay** (30–90 days) + owner veto when they open any wallet (the app reads `recovery.attempt` on-chain) + layered witnesses. The Statement store is honestly described as an "instant alarm when the app is open". Demo it as it is.

### 4. `securityDeposit = 0` makes slashing meaningless
**What's wrong:** On Portaldot, `slashAttempt` burns a deposit of 0. An attacker can keep opening fake recovery attempts at no cost (griefing), and the owner has to keep cancelling. Kusama sets a deposit.
**Why it matters:** The security claim "the attacker's deposit is forfeited" does not hold on the target chain.
**What good looks like:** Propose a parameter change to the Foundation (good material for office hours). Meanwhile, add an **application-level bond** in the Revive contract that WASIAT requires before a witness can start a recovery attempt.

### 5. The incumbent is coming
**What's wrong:** The same pallet is already live on Kusama Asset Hub with 13 completed inheritances. Kusama usually precedes Polkadot. Big wallet teams (Nova, Talisman, Polkadot App) only need to add a "Recovery" screen.
**Why it matters:** If WASIAT's value is merely a "UI for the Recovery pallet", that value will become a commodity within months.
**What good looks like:** The moat lies in the **inheritance-law layer**: a KHI + KUHPerdata (Indonesian Civil Code) + Chinese inheritance law (民法典 继承编 (PRC Civil Code, Succession Book)) ruleset, the facts-by-notaris flow, and a PDF deed that can be taken to court. That is what wallet teams will not build.

---

## Common sins detected
- **Phantom Users:** "Indonesian Muslim crypto holders on Portaldot".
- **No Retention Loop:** set it and forget it; no reason to come back.
- **Bridge to Nowhere (variant):** preparing an inheritance split for assets that do not yet exist on this chain.
- **Jargon Overload (fiqh side):** fiqh terms used incorrectly, even though the target understands fiqh.

## UX red flags
- **No onboarding for non-crypto people:** witnesses and heirs (parents, children) are forced to have a wallet and POT.
- **No recovery on error:** if a witness loses their key within 10 years, the group cannot be used, and there is no witness "health check".
- **Token amounts without a rupiah value:** the inheritance must be shown in rupiah so families can understand it.

---

## Fix These 3 Things Now

1. **[Biggest impact] Switch the persona to users who actually hold on-chain assets.**
   Strongest option: **key-holder continuity for crypto teams/DAOs**. Examples are treasuries, contract admin keys, and upgrade rights that get locked when a founder disappears. Hacker House teams and the Foundation itself (which still uses a single-key Sudo) are users who can be named. Faraid remains as a ruleset for individual owners, but it is no longer the only story.
2. **[Easiest] Fix the fiqh and the name.**
   The order: debts → wasiat ≤ ⅓ (non-heirs) → faraid, computed **at execution time** from facts attested by the notaris/witness group. Rename it to something that does not misuse a term, for example **Pusaka** ("heirloom", universal and beautiful), **Waris**, or **Tirkah** (the fiqh term for the estate left behind).
3. **[Existential] Be honest about proof-of-life and fix the security incentives.**
   Do not claim serverless notifications. Build security from delay + veto + layered witnesses + an **application bond** (because `securityDeposit = 0`), and add a "witness health check" (detecting witness accounts that are no longer active). Then validate with 5 real prospective users (sharia notaris or crypto teams) before building.

**Projected score after fixes:** Value 7 (14), Crypto 8, Target 6, FTUE 5, Loop 3, Moat 5, Tech 7, Naming 7, Monetization 5, Timing 6, for **≈ 66/110**.

---

## Comparison with the Potluck/LUMBUNG roast

| | Current score | Projection after fixes | Fatal weakness |
|---|---|---|---|
| Potluck (indexer) | 47 | **≈ 71** | The problem does not exist on Portaldot yet. Fixed by reframing to heavy-chain data. |
| WASIAT | 50 | ≈ 66 | No users and wrong fiqh. Fixed by changing the persona + facts-at-execution flow. |

**Implication for option C:** WASIAT is strongest as a **narrative and example dApp** ("an app that must outlive the servers of its maker"), not as the main product judged on Business Potential. This supports Potluck as the core product.
