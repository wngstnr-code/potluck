# Portaldot Hacker House 2026 — Full Dossier

> Compiled: 2026-10-20. Sources: official DoraHacks page, X @PortaldotL0, Node Console, and **direct queries to the testnet/live RPC** (not just marketing claims).
> Page: https://dorahacks.io/hackathon/portaldot-hacker-house-2026/detail

---

## 1. Quick Summary

| Item | Value |
|---|---|
| Organizer | Portaldot Network Ecosystem Foundation (via DoraHacks) |
| Format | Virtual, all activity on Discord (`discord.gg/portaldot`) |
| Prize pool | **5,200 USDT** (2,600 USDT cash + 2,600 USDT equivalent in POT tokens) |
| Build period | 14 Oct – 6 Nov 2026 (code must be written within this period) |
| Registered participants | 136 hackers (as of 20 Oct), no public builds yet |
| Tags | Blockchain, Rust, ink!, Solidity · Platform: Portaldot |
| Required | Public GitHub repo + demo video ≤ 3 minutes + deployment on **Portaldot testnet** |

---

## 2. Theme & Tracks

Theme: build on **Portaldot V3.0** — now EVM-compatible, runs **WASM and EVM** contracts, supports the ERC‑20/ERC‑721 standards, modular architecture, multi-chain capabilities.

| Track | Official focus | Prize |
|---|---|---|
| **Modular Cloud & Middleware** | Decentralized middleware, storage/data components, APIs based on Portaldot's modular architecture | 1st place: 800 USDT |
| **Multi-Chain & Cross-Chain Infra** | Asset/data bridges, liquidity engines using cross-chain capabilities | 1st place: 800 USDT |
| **Node Operations & Tooling** | Node monitoring, automated staking, node data visualization, network security analysis | 1st place: 800 USDT |
| **Ecosystem DApps** | Innovative DeFi, RWA tokenization, consumer apps | 1st place: 800 · 2nd place: 500 · 3rd place: 300 USDT |

### Other prizes
- **Grand Prize** (highest overall score): **1,000 USDT**. If the Grand Prize winner also wins a track, the track prize moves down to the next-ranked project.
- **Community Choice Award**: 200 USDT (Discord voting, separate from the judges' scores, can be stacked with other prizes).
- Track prizes are **not guaranteed** to be awarded if no project meets the quality threshold.

> Strategic note: Ecosystem DApps has 3 prize slots (the most), but is probably also the most crowded. The three infra tracks each have only 1 winner, but the competition may be thinner.

---

## 3. Judging Rubric (official weights)

| Criterion | Weight | What is assessed |
|---|---|---|
| **Technical Feasibility** | **30%** | Technical approach, architecture, code completeness, real delivery. Is the core feature finished? Does GitHub show **genuine & sustained** development? Deployed on the **Portaldot testnet with verifiable on-chain interactions**? |
| **Innovation** | **30%** | Innovation in the technical solution, product model, scenario. **Effective use of V3.0 features: WASM/EVM compatibility, modular architecture, multi-chain.** Real value beyond existing solutions. |
| **Ecosystem Contribution** | **20%** | Contribution to Portaldot infrastructure, developer tools, node ecosystem, applications, user growth. Potential for continued building, open-source value, long-term collaboration. |
| **Business Potential** | **20%** | Real market need, clear target users & use cases, feasible business model & growth path, team's ability to continue. |

Objective evidence used by the judges: GitHub repo, **commit timeline**, testnet transaction records, contract addresses, tx hashes, live demo performance.

---

## 4. Timeline (UTC)

| Date | Agenda |
|---|---|
| 29 Sep | Pre-registration opens |
| 14 Oct 12:00–14:00 | Kick-off Meeting & Workshop (already passed) |
| **24 Oct 12:00** | **Check-in submission deadline** (prototype must already be demo-able) |
| 26 Oct 16:00 | Feedback announcement |
| 27 Oct 12:00 | Office Hour application deadline |
| 28–29 Oct | Office Hours with mentors |
| **6 Nov 04:00** | **Final submission / Code Freeze** |
| 8–9 Nov | Live Demo Day (Discord) |
| 9 Nov 16:00 – 10 Nov 16:00 | Community Choice Voting |
| 11 Nov | Winners announced |
| 12–14 Nov | Winner information collection |
| 14 Nov 12:00 | Prize distribution |

---

## 5. Requirements

### Participation
- Teams/individuals able to build Web3 products independently and maintain them long-term.
- Stack: Rust/ink!, Solidity, Web3 frontend, full-stack (not restricted).
- **Must use core Portaldot V3.0 features and deploy on the Portaldot testnet.**
- Code written mainly during 14 Oct – 6 Nov.

### Check-in (24 Oct)
- Current progress + unfinished items
- Public GitHub repo: complete README, ongoing development notes, **product architecture diagram**
- Testnet deployment info: contract address, tx hash, explorer link
- Early demo: live DApp link **or** video ≤ 3 minutes showing ≥1 core function
- Simulated data is allowed at this stage, but real testnet interaction is encouraged

### Final submission (6 Nov)
- Project name, team members, one-sentence summary
- Public repo, complete README, deployment instructions, documentation, code that can be run/reproduced
- Testnet deployment info (contract address + tx hash)
- Runnable demo (web/DApp link or local instructions)
- **Demo video ≤ 3 minutes**: real product, core function, Portaldot integration, public link
- **Pitch deck** (PDF/link): the problem, **why Portaldot is essential**, proof of functionality, reasons it deserves future support

### Code compliance
- Repo public during the event; **≥ 3 valid commits** within the Hacker House period
- **The final version's core modules must not be committed all at once in the last 24 hours**
- Keep the commit timeline, PRs, etc. as evidence
- After code freeze: no substantial changes allowed; serious bugs must be reported to the organizer
- Submitting old, already-finished projects is prohibited; open-source frameworks/SDKs are allowed as long as their source is credited

### IP
- Code remains the team's property; the Foundation receives a non-exclusive license to display/promote it.

---

## 6. Sponsors / Partners, Judges, Mentors

**Official partners** (X post @PortaldotL0, 30 Sep 2026): Echobit Exchange, NodeLab, Jinse Finance (金色财经), Odaily, feixiaohao (非小号), DeBox, 0xtheweb3, HNUBA_CN, Noma Network, Mintellect AI, Gold House, Cortex Network, cufeba888, DeSci Sino, RunePool BTC, XPower Finance, BUPT3 DAO, TronBank Pro, Upchain DAO, RU Chain, CUIT BCA 2020, Matrix Chain, CityU HK Web3 AI, Sumplus, nanaland, BHBA, TagHub.
→ Mostly **Chinese-language crypto media & communities + university blockchain clubs**. No technology/API sponsor offering a separate bounty.

**Judges**: **not publicly announced.** The 14 Oct kick-off mentioned Portaldot "technical mentors". Working assumption: judges = Portaldot Foundation's technical + ecosystem team (possibly plus partner representatives). Implication: judges know their own chain's shortcomings very well → projects that close real ecosystem gaps tend to be rewarded (proven in S1, see §9).

**Recommended technologies/APIs**: there is no list of sponsor APIs. What is emphasized: WASM (ink!), EVM (Solidity), ERC‑20/721, modularity, multi-chain, testnet deployment.

---

## 7. Post-Hackathon Support

The best projects (and non-winners that show commitment) can apply for ecosystem support programs: mainnet launch support, building-cost subsidies (servers, DB, infra), technical advisory (contracts, cross-chain, modular, API, **RWA data mapping, Oracle/data synchronization**, security boundaries), debugging, exposure on official channels, community growth, joint campaigns/AMAs, **liquidity incentives, trading, gas rebates**, listing in the official ecosystem directory. Opened on a milestone basis.

---

## 8. Portaldot Blockchain Technical Research (verified directly on-chain)

### 8.1 Marketing claims vs reality
The official documentation (portaldot-dev.readthedocs.io) claims: Layer0, "DHSA" 256 shards with AI scheduling, 10,000 TPS, ZKP, quantum-resistant cryptography, AI contract engine, federated learning. **None of these is visible in the V3 runtime.** What is real is below.

### 8.2 Network endpoints

| Network | Substrate WS | EVM JSON-RPC | Note |
|---|---|---|---|
| **V3 Testnet** (used by the hackathon) | `wss://test-node-v3.portaldot.dev` | `https://test-evm-rpc-v3.portaldot.dev` | EVM Chain ID **420420777** (`0x190f1ca9`), token `tPOT` |
| **V3 Live** | `wss://live-v3-node.portaldot.dev` | (not publicly found yet) | Block ~710k, spec 3001 |
| Old mainnet (V1/V2) | `wss://mainnet.portaldot.io` | — | Alive (spec `portaldot`), without Recovery/Revive pallets. *(Correction: the initial "timeout" test turned out to be a bug in the test script.)* |
| Explorer | https://node-console.portaldot.dev/ | — | A fork of **polkadot.js apps** (not an Etherscan/Subscan-style block explorer) |

### 8.3 Technical facts of the V3 Testnet runtime (query results 2026-10-20)
- **Framework**: Polkadot SDK (Substrate). `specName: portaldot-v3`, `specVersion: 3002`, node `3.0.0-dev`.
- **EVM RPC**: the official `eth-rpc` from polkadot-sdk → meaning its EVM is **pallet-revive** (the same as Polkadot Hub / Asset Hub), NOT Frontier/Moonbeam.
  - `allowEVMBytecode: true` → regular Solidity bytecode (solc) can be deployed; PolkaVM (resolc) is also supported.
  - `autoMap: true` → Substrate (SS58) accounts and H160 are mapped automatically.
  - `nativeToEthRatio: 10000` → native has 14 decimals, EVM side has 18 decimals.
  - `debug_traceBlockByNumber` (callTracer) is **supported**; `eth_getLogs` is supported.
- **Consensus**: BABE (6-second blocks, epoch of 600 blocks = 1 hour) + GRANDPA finality + BEEFY/MMR.
- **Token**: 14 decimals, SS58 prefix 42, existential deposit 0.1 POT.
- **Governance**: still controlled by **Sudo** + Technical Committee (early centralization).

### 8.4 Pallet list (these are the actual "V3 features")
This runtime is effectively a **Substrate "kitchensink" runtime** — nearly all FRAME pallets are active:

| Category | Pallets |
|---|---|
| Smart contracts | **Revive** (EVM + PolkaVM), **Contracts** (legacy ink! WASM), AssetsPrecompiles (ERC‑20 precompile for native assets), AssetsPrecompilesPermit, VestingPrecompiles |
| Assets & DeFi | Assets, PoolAssets, **AssetConversion** (native Uniswap v2-style AMM DEX), AssetConversionTxPayment (pay gas with another token), AssetRate, AssetsFreezer |
| NFT | Uniques, **Nfts** (attributes, pre-signed mint, swap, price), **NftFractionalization** (split an NFT into fungible assets — relevant to RWA) |
| Staking | Staking (NPoS), NominationPools, DelegatedStaking, FastUnstake, VoterList, ElectionProviderMultiPhase, Session, ImOnline, Offences |
| Accounts & security | Identity, **Recovery** (social recovery), Proxy, Multisig, Utility (batch, `ifElse`), **MetaTx** (gasless/meta transaction), **VerifySignature**, SkipFeelessPayment, TxPause, SafeMode |
| Data & storage | **TransactionStorage** (store raw data on-chain up to **8 MB per tx**, retention 100,800 blocks ≈ 7 days, retrieved via the RPC **`bitswap_v1_get`** — IPFS-compatible), **Statement** store (signed off-chain messages, RPC `statement_submit/subscribe`), Remark, Preimage |
| Oracle | **Oracle** (`feedValues: Vec<(u32,u128)>`, max 10 values per feed, by authorized members) |
| Network privacy | **Mixnet** (Sphinx mixnet for anonymous tx submission) — 0 mixnodes registered |
| Multi-chain | **RegistrarPara / RegistrarRelay** (parachain registration to the relay chain — only submits the code hash), **Broker** (coretime), MessageQueue. **No XCM pallet.** |
| Treasury | Treasury, Bounties, ChildBounties, **MultiAssetBounties**, Lottery, Scheduler, Vesting |

### 8.5 On-chain ecosystem state (facts, not assumptions)

| Metric | V3 Testnet | V3 Live |
|---|---|---|
| Accounts | 887 | — |
| Revive contracts (EVM/PVM) | 23 (14 unique code) | **0** |
| ink! contracts (pallet-contracts) | 0 | — |
| On-chain identities | 0 | 0 |
| DEX pools (AssetConversion) | 0 | 0 |
| Nomination pools | 0 | 0 |
| Oracle values | **empty** | empty |
| NFT collections | 1 | 0 |
| Validators | 2 | 2 |
| Mixnodes | 0 | — |
| Proxy / Multisig | — | 0 / 0 |

**Conclusion**: V3 is **totally greenfield**. Basic infrastructure usually found on other chains — EVM block explorer, indexer, oracle feed, DEX, domain names, wallet integration, faucet, validator monitoring — **does not exist yet**. All the advanced pallets (TransactionStorage, Statement, Mixnet, MetaTx, NftFractionalization, Oracle) **are not used by anyone yet**.

### 8.6 Key points for a "no backend" architecture
- The browser can talk directly to the node via WSS (polkadot.js / PAPI) and to the EVM RPC via HTTPS (viem/ethers) — no server needed.
- `TransactionStorage` + `bitswap_v1_get` = on-chain blob storage readable from the browser → an alternative to IPFS/a backend for data.
- `Statement` store = signed P2P message channel through the node → an alternative to a backend for lightweight signaling/messaging.
- `MetaTx` + `VerifySignature` = gasless relaying without a dedicated server (anyone can submit).
- A light client (smoldot) could possibly be used if a chain spec is available (the `sync_state_genSyncSpec` RPC is available).
- Risks: only 2 validators & 1–2 public nodes; endpoints have changed before (the old V3 RPC is dead).

---

## 9. Previous Hackathon: Portaldot Online Mini Hackathon S1

- Link: https://dorahacks.io/hackathon/portaldot-online-s1/detail
- Period: 4–31 May 2026 · Prize pool 3,500 USDT · 222 hackers · **47 builds**
- Chain at the time: Portaldot **pre‑V3** (Substrate + pallet-contracts, legacy ink!; "no explorer, no JS SDK" according to participants)
- Tracks: Builder Tools for Portaldot · AI-Powered Onchain Workflows · Native Onchain Apps · Onchain Identity & Coordination
- Criteria: Portaldot Native Deployment (required, POT as gas) · Demo Completion · Application Value · Presentation Quality · (Community voting separate)

### 9.1 Winners (source: X thread @PortaldotL0, 8–9 Jun 2026)

| Rank | Project | Category | Core idea |
|---|---|---|---|
| 🏆 **Champion** | **pdk — Portaldot Dev Kit** | Builder Tools | CLI (pip) — *FailLens* decodes raw module errors (`Module error: 0x06…`) into a diagnosis + fix suggestion using chain metadata; 14 dev-loop commands |
| 🥈 2nd | **PortalModeler** | Builder Tools | Node-canvas-based visual workflow builder, execution & monitoring, AI generates draft workflows |
| 🥉 3rd | **Palletman** | Builder Tools | "Postman for pallets": browse pallets, compose & submit extrinsics, estimate fees, save templates in a smart contract |
| Special | PortalHouse | Best Ecosystem Gateway | Full-stack dashboard: natural language → on-chain actions |
| Special | PortaldotProver | Best Engineering Breakthrough | Verified AI marketplace (models, inference, payments proven on-chain) |
| Special | Potdo | Best UX Innovation | AI copilot: intent → visual transaction preview (anti blind-signing) |
| Special | ProofPort | Best Product Readiness | Proof-based bounty management |
| Special | portaldot-mcp | Best AI Infrastructure | First MCP server for Portaldot (34 tools) |
| Special | PortalPilot | Best Workflow Intelligence | Natural language → transactions, simulation with real POT fees |

### 9.2 All 47 S1 submissions (to detect saturated ideas)
Equilibria, PortalPot, OriginPort AI, VERITY, Auralis (arisan [rotating savings group] + AI), PortalPay (subscriptions), PortalView/PortalReview (audit), InkPort (Solidity→ink!), Hermes (AI CLI), PNS ×2 (name service), PortalFlow ("when X do Y" automation), Flowpay, StreamDot (streaming payments ×2), PortalKubo (AI API marketplace), Sentinel Treasury Copilot, PortalPilot, PortalTrace (supply chain), ProtectedPay (refundable transfers), pdk, PortalModeler, Potdo, PORTALPROOF & PortalProof (credentials/certificates ×2), portaldot-mcp, Portaldot API Wrapper, PalletForge, World-Cup Copilot, PortalHouse, PortalProver, AutoDot, PotKit, InkWell (browser IDE), Pay-Per-UseAI, TrustGraph, ProofPort, PortalMatch, Sparrow Protocol (lending), Aggregato (ZK), PortalAI copilot, eco-sentinel, Palletman, Rush Marketplace, Polagon (prediction market), AssestDot (RWA), contract-starter-kit, Trashearn.

### 9.3 Quick patterns (full analysis: [RESEARCH-STAGE2.md](./RESEARCH-STAGE2.md))
- **The 3 top winners = developer tooling** that fixes real chain pain points (unreadable errors, hard-to-use extrinsics, workflows that are hard to debug). Judges = chain team → they reward projects that make their chain easier to use.
- Special awards dominated by **AI copilot / natural language → tx** — already heavily saturated (≥8 similar projects in S1).
- Saturated ideas in S1: AI copilot/NL→tx, name service, payment streaming/subscriptions, credential/provenance/proof, arisan/community savings, bounty platform.
- **V3 opportunity**: S1 tools were built for the pre‑V3 chain (legacy ink!, pallet-contracts). V3 replaces the foundation (Revive/EVM, new pallets) → many tooling gaps are open again, and the new pallets have not been touched by anyone.

---

## 10. Important Links
- Hackathon: https://dorahacks.io/hackathon/portaldot-hacker-house-2026/detail
- Hackathon S1: https://dorahacks.io/hackathon/portaldot-online-s1/detail
- Docs: https://portaldot-dev.readthedocs.io/en/latest/
- Node Console: https://node-console.portaldot.dev/
- Discord: https://discord.gg/G33tVtCsNW · X: https://x.com/PortaldotL0
- S1 winners: https://x.com/PortaldotL0/status/2064002749008867589 · Special awards: https://x.com/PortaldotL0/status/2064334414461677950
- Partners: https://x.com/PortaldotL0/status/2105281729439367578
- Testnet faucet: Discord ticket with a native SS58 address (starting with `5`), not 0x
