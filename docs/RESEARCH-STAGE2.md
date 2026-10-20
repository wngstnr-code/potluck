# Stage 2 — Winning Patterns, Competitors, & Market Landscape

> Compiled 2026-10-20. Continuation of [HACKATHON.MD](./HACKATHON.MD).
> Sources: X @PortaldotL0, DoraHacks (API & winner pages), READMEs of winning and participant GitHub repos, Polkadot forum, docs.polkadot.com, testnet RPC queries.

---

## A. Previous Winners — What Won & Why

### A1. Portaldot Online Mini Hackathon S1 (May 2026, 47 builds) — judges = Portaldot team

| # | Project | What | Why it won (from README & demo) |
|---|---|---|---|
| 🏆 | **pdk** | Error decoder CLI (FailLens) + 18 dev-loop commands | Fixes a pain the chain team itself feels (unreadable `Module 0x06…` errors). **"Fail → diagnosis → fix → success" demo with real txs.** Reads chain metadata directly (not stale after runtime upgrades). Distributed via PyPI + npm + Docker. 184+141 tests **against a live node**, explicit "no mocks" claim. Clean README: problem → try it in 30 seconds → diagram → SDK comparison table → tx proof. |
| 🥈 | **PortalModeler** | Visual workflow builder (node canvas) + AI draft + debug | Makes the chain "visible". Visual = strong demo. |
| 🥉 | **Palletman** | "Postman for pallets": auto-generated forms from metadata, fee estimation, templates saved in a contract | Metadata-driven, usable by anyone without SCALE. Small but meaningful contract (registry + POT fee). |
| Special | PortalHouse, Potdo, PortalPilot, portaldot-mcp | AI/NL → transactions, copilot, MCP | Accessibility. **But there are ≥8 similar projects — saturated.** |
| Special | PortaldotProver | Verified AI marketplace | "Engineering breakthrough" |
| Special | ProofPort | Proof-based bounties | "Product readiness" (most complete) |

**What lost**: generic ports from other chains — name service (×2), payment streaming (×2), credentials/certificates (×3), supply chain, lending, prediction market, generic RWA (AssestDot), arisan (rotating savings group)/savings pool. None made the top‑3.

### A2. Polkadot Solidity Hackathon 2026 (Feb–Mar 2026, 268 builds, 851 hackers, $31K) — **identical stack: pallet-revive EVM + PVM**

| Track | Winner | Core idea | Pattern |
|---|---|---|---|
| EVM 1st | **Relaycode Studio** | In-browser IDE: write Solidity, compile to EVM/PVM, estimate gas, deploy | Dev tool wins 1st place again |
| EVM 1st | COMA | AI e-commerce agent, crypto checkout | Consumer + AI |
| EVM 2nd | DOT Pixel, Dust Protocol (stealth privacy) | | |
| EVM 3rd | DPO2U (ZK compliance oracle LGPD/GDPR), Ocean Fin | | |
| PVM 1st | **CoreDEX** | Futures & options for **coretime** | Uses a primitive that **exists only on Polkadot** |
| PVM 1st | Esmond | On-chain payroll/escrow replacing SWIFT | Clear real-world problem |
| PVM 2nd | **Zenith** (intent bridging verified on PVM), **Nyx** (Rust CLOB matching engine on PolkaVM) | | Native Rust on PVM = "impossible on regular EVM" |
| PVM 3rd | Omni Shield (BN128/Blake2 precompiles for stealth), **Polkadot Rust Bridge** (ZK/BLS/Poseidon 14× cheaper on PolkaVM) | | Exploiting the VM's technical advantages |
| OZ | Hyperway (gasless GPU marketplace), Obidot (XCM+Hyperbridge DEX aggregator) | | |
| Honorable | **PolkaOracle** ("Hub has no oracle"), ZKNative, PolyDot (Substrate identity via System precompile — "accountability impossible on standard EVM"), Kredio, Reprieve | | Gap-filling infra |

### A3. Polkadot Builder Party & Playground.dot (Web3 Summit 2026)
- Winners: custom pallet (Agora — verified off-chain computation), proof-of-location (Bluetooth), media authentication, **Nani (real-time monitoring + alerts)**, Chopdot (bill splitting), Fangorn (threshold encryption).
- Playground: "Proof of Delay" — born from **real frustration** (a train delayed 4 hours) → on-chain certificate. Judges reward real-life friction turned into a product.

---

## B. Patterns That Make a Project Win

1. **Native-ness / "impossible elsewhere".** Winners use something that **exists only on this platform** (coretime, PolkaVM running Rust, special precompiles, Substrate identity from EVM) and state it explicitly. The Portaldot rubric is explicit too: Innovation 30% = effective use of V3 features.
2. **Fixing a gap the judges themselves feel.** Judges = chain team. All three S1 winners are tools that make their chain easier to use. PolkaOracle got a mention because "Hub has no oracle". → Ecosystem Contribution 20%.
3. **Verifiable proof, not claims.** Real txs, before/after, tests against a live node, contract addresses + hashes. The Technical Feasibility rubric mentions "verifiable on-chain interactions" and "genuine & sustained GitHub activity".
4. **One visual, fast wow.** Raw error → human sentence; visual canvas; compile-and-deploy in the browser.
5. **Usable by others right now.** Packaged (npm/PyPI), SDKs, open-source → real ecosystem value.
6. **A concrete real-world problem** (SWIFT payroll, delayed train, bill splitting) beats a "platform for everyone".

## C. What Judges Reward vs Ignore

| Rewarded | Tends to be ignored |
|---|---|
| Chain-specific primitives used meaningfully | Generic dApp ports from Ethereum |
| Closing real infra/DX gaps | AI wrappers without on-chain depth (already far too many) |
| Live tx demo, before/after | Concepts, mock data, slides without a product |
| Tests against a live node, CI, distributed packages | Tokenomics/new tokens without a product |
| A "why it must be Portaldot" narrative | Big claims ("RWA platform for everyone") without specific users |
| Incremental commits, clean documentation | End-of-event code dump (explicitly prohibited by the rules) |

## D. ALREADY SATURATED Ideas — Avoid

**From S1 (and common at crypto hackathons):** AI copilot / NL→tx / MCP; name service; payment streaming & subscriptions; credentials/certificates/provenance; supply chain tracking; arisan/savings pool; bounty platform; prediction market; generic lending; generic RWA tokenization.

**Already built by Hacker House 2026 participants** (public GitHub repos as of 20 Oct, ~30 repos):

| Lane | Participant repos | Strength |
|---|---|---|
| **Node monitoring / validator** (≥8!) | pot-watch, portalguard, PortalPulse, NodePulse, portaldot-sentinel, ReviveScope, Atlas (x402 probe), holt (validator risk score + merkle) | Very crowded → avoid |
| Explorer | **potscan** (Solidity+ink!, address mapping) | Medium |
| TransactionStorage storage | **potdrive** (FastCDC dedup, IPFS CID, gasless MetaTx, 26 commits) | Strong |
| Bridge / cross-chain | **bridge-zero** (Portaldot GRANDPA light client on Ethereum Sepolia, 66 commits), crosschain-liquidity-engine (1 commit), IntentFlow (1 commit) | bridge-zero is very strong |
| CrossVM / dual-runtime | **SEAM** (100 commits), **twinkey** (SS58 signing wallet for Solidity dApps) | Strong |
| AI agent payments & guard (≥5) | allowance, verigate, kudex, AssayGate, PortalMeter (HTTP 402 + payment channel) | Crowded |
| RWA | PotKit (invoice → ERC‑721 + ERC‑20 shares, hand-written Yul), ComplyDot, AssayGate | Medium |
| Dev tooling | PRT (runtime upgrade diff testing), ink-toolchain recipe, testnet guide | Medium |
| Other | anchorlog (tamper-evident log), BlindBid (sealed-bid auction), PortalProof (creator order proof) | — |

## E. V3 Primitives NOT Yet Touched by Anyone (opportunities)

| Primitive | On-chain status | Note |
|---|---|---|
| **Statement store** (signed pub/sub via node, short TTL, RPC `statement_submit/subscribe`) | No participant uses it | On Polkadot it is used for Polkadot App chat. **Real-time channel without a backend.** |
| **Oracle pallet** (`feedValues`) | Completely empty | Feeders must be authorized members (sudo) → access risk |
| **AssetConversion** (native DEX) + **AssetConversionTxPayment** (pay gas with another asset) | 0 pools | The chain economy has no liquidity at all yet |
| **Recovery** (native social recovery) | Not used | Account recovery UX / inheritance |
| **Identity** | 0 identities | No registrar yet |
| **NominationPools** | 0 pools | Retail staking not possible yet |
| **Nfts** (pre-signed mint, attributes, swap) & **NftFractionalization** pallet | 1 collection; fractionalization pallet unused (PotKit uses its own EVM implementation) | |
| **Mixnet** | 0 mixnodes | Requires node operators — hard for a hackathon |
| **MMR / BEEFY** (`mmr_generateProof`, `beefy_*`) | Not used | Lightweight proofs for verification in the browser/contracts |
| **Proxy / Multisig / Scheduler / Utility.ifElse / MultiAssetBounties** | 0 proxies, 0 multisigs | Native automation & shared custody |
| **PolkaVM (PVM)** | Only 1 PVM contract on testnet | Native Rust in contracts — a strong technical differentiator (see winners in A2) |
| **Precompiles** | Only Assets & Vesting (+ system) | No staking/identity precompiles → EVM cannot directly access other pallets |

## F. Market Landscape

### F1. The Portaldot market itself
- **Real ecosystem is nearly zero**: V3 Live has 0 contracts; testnet has ~15 test contracts; BEP‑20 version of the POT token has ~US$26K liquidity (third-party tracker, date uncertain). No verified RWA partnership news.
- Community & partners are **China/Asia**-oriented (Chinese-language crypto media, university blockchain clubs).
- Official positioning: a chain for **physical industries & RWA** (real estate, commodities, IP).
- Consequence: "Business Potential" cannot rely on existing Portaldot users. It must (a) target **builders/operators** coming to Portaldot, or (b) target a **real-world niche** served by Portaldot-specific primitives, or (c) be **portable**.

### F2. Key insight: Portaldot V3 = Polkadot Hub technology
- pallet-revive + eth-rpc + the same kitchensink pallets as Polkadot Hub (smart contracts live Jan 2026) & Bulletin Chain (TransactionStorage) & People chain (Statement store).
- Anything built here is **portable to every polkadot-sdk chain** → TAM far larger than Portaldot. Strong business argument: "starts on Portaldot, runs on every Revive chain".

### F3. Real unsolved problems (Polkadot/Revive ecosystem)
1. **Oracle** — Hub has no oracle (PolkaOracle); Portaldot has an oracle pallet but it is empty.
2. **Account & decimal duality** — SS58 vs H160, 14 vs 18 decimals (`nativeToEthRatio 10000`) → a silent trap (documented by ReviveScope).
3. **End-to-end examples, onboarding, version compatibility** — the top 3 pain points of Polkadot developers (community survey).
4. **Indexer & data** — no indexer/subgraph for small chains; dApps are forced to have a backend.
5. **Real-time apps without a server** — the Statement store answers this, but there is no tooling/app outside the Polkadot App yet.
6. **Account recovery & shared custody** for non-technical users (native Recovery/Proxy/Multisig have no UX).

### F4. Gaps still open (intersecting with §D & §E)
- **Backendless** apps that use the Statement store + TransactionStorage + a light client as the "server" (no one has tried yet).
- **Data/oracle** infra that does not depend on sudo permission (e.g. an optimistic oracle on Revive that uses proofs, or filling the oracle pallet via governance).
- Tools for **native pallets from EVM** (a DX bridge between Solidity and pallets that have no precompile).
- **PVM as an advantage**: heavy computation (crypto verification, parsing, matching) in contracts — proven to be liked by Polkadot judges.
- Specific real-world use cases that fit Portaldot's positioning (physical industries/RWA) but are **not** generic tokenization.

---

## G. Lessons to Apply to the Idea (Stage 3)

1. **Must stand on ≥1 untouched V3 primitive** (§E) and be able to claim "impossible/hard on regular EVM".
2. **Pick a quiet lane** (§D): avoid node monitoring, AI agent payments, explorer, storage drive, bridge to Ethereum.
3. **Specific user + concrete problem** — ideally one that the judges (builders/foundation) also feel, *or* a real-world niche aligned with the RWA/physical-industry positioning.
4. **Demo = real tx with before/after** in < 30 seconds; all data from the public chain/API (no mocks).
5. **Backendless architecture as a feature, not a limitation**: browser ↔ node (WSS/smoldot), Statement store as pub/sub, TransactionStorage as blob, Revive/PVM contracts as logic.
6. **Measurable ecosystem contribution**: release an SDK/package that other teams in this hackathon can use too (cross-adoption = proof + Community Choice votes).
7. **Portability narrative** to Polkadot Hub and other polkadot-sdk chains for Business Potential.
8. Target the **Grand Prize** (highest total score) — requires technical depth + uniqueness, not just winning a track.
