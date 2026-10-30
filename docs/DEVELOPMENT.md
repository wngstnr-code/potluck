# Development Guide & Handoff: Potluck

> Living document. **Update §1 and §2 at the end of every session.**
> Read together with [`../CLAUDE.md`](../CLAUDE.md) (rules) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) (design).
> Solo project: the user is the only developer and the only commit author.

---

## 1. Current status

_Last updated: 2026-10-30 (PVM registry deployed 2026-10-29; manifests 2–3 restored after expiry; landing plays the 1-minute ad; plan to code freeze in §2)._

| Area | Status |
|---|---|
| Research & ideation | ✅ Done (`HACKATHON.MD`, `RESEARCH-STAGE2.md`, `IDEAS.md`, roasts) |
| Product decision | ✅ Potluck + Wasiat-lite (option C) |
| Concept & architecture | ✅ `POTLUCK.md`, `ARCHITECTURE.md` |
| Claude Code config | ✅ `CLAUDE.md`; commit/PR attribution disabled in `.claude/settings.json` |
| Git repository | ✅ Public: https://github.com/wngstnr-code/potluck (`main`); sole contributor `wngstnr-code` |
| Dev wallet / tPOT | 🟡 Dev account created 2026-10-21 (sr25519): `5HHPEACGYoJvEerkxD9vW6L93jHM7VQKTwXxsp2L8331jfmM`, Revive H160 `0xd00d195095e69b479e681f6ac359ce96f47eb790`; its seed is the local, git-ignored `PUBLISHER_SEED`. Received 1,500 tPOT on 2026-10-21 (the first faucet batch is capped at 1,500). After the EVM deploy and the Portaldot publishes: 907.99 tPOT; 484.80 tPOT on 2026-10-27 after manifests 3 and 4. A second batch arrived by 2026-10-29 and paid for the PVM deploy (3,293.4) and the restores: 490.23 tPOT on 2026-10-30. The full AH build (≈ 6,200) needs a third batch |
| Code | 🟡 `PotluckRegistry.sol` done (21 tests, 100% coverage; EVM + PVM dry-run OK). `spec` done (23 tests). `core` done: Substrate + Revive EVM logs, range scan, reconciliation (65 offline tests on recorded real data + 5 live tests: Polkadot AH window and Portaldot genesis → head, 894/894 accounts reconcile). `cli` done: build (resumable, deterministic), verify (L1 + re-index + L3), publish (dry run tested; submission awaits tPOT), renew (dry run tested against a live stored blob: keep / renew ≈ 0.0117 tPOT / expired / restore), sync (build new blocks → verify → publish unpublished builds → renew; dry run tested on Portaldot), tamper (demo). `client` done: verified account history (coverage planning, bloom-filtered snapshot loading, L1/L2/L3, direct-sync gaps), registry/bitswap source, reconnect-proof live tail; bundles for browsers; `specHistory`/`reconcileHistory` for whole-spec loads. `theme` done (docs/DESIGN.md). `pantry` overview done: in-browser direct sync of Portaldot V3 from genesis (2,248 rows in 2 min 25 s) + L3 905/905 in 22.7 s + live tail. Verify account (L2 183/183 + L3 in 1.8 s), attack demo (forged chunk passes L1/L2, L3 catches 903/904 with the exact hidden amount) and catalog pages done. `wasiat` done: Kusama AH plans (121) / open attempts (14) / inheritors (13) from storage, per-account timelines rebuilt from the blocks their storage changed in (relay-chain block numbers mapped via `ParachainSystem.LastRelayChainBlockNumber`), state replay 133 / 133, and a `set_friend_groups` setup page for Portaldot signed by the user's wallet (fee estimate 0.0223 tPOT; Portaldot has 0 plans, `SecurityDeposit` 0). `ui` holds the shared shell. Both apps are hosted on GitHub Pages (https://wngstnr-code.github.io/potluck/pantry/ and /wasiat/, deployed by `.github/workflows/pages.yml` on every push). Missing: the PVM registry holds no manifests yet (the apps read the EVM one); the 1.5 M-block publish (tPOT); P1 items in §2; submission package (pitch deck done 2026-10-28; public video link and DoraHacks form remain) |
| Spikes | ✅ S1, S3, S4, S6, S7, S8 (EVM) done; S2 fees measured (results in `spikes/results/`). 🟡 S5 partial |
| Testnet deployment | ✅ `PotluckRegistry` (EVM) `0xef9305561eb0c34d205dfa0d9099a105f44282eb`, block #129,014, tx `0x3abb9058e1eb48628791a029de71ef11b510ebc7a5cfa81677425773ce0bc352` (`contracts/deployments/portaldot-v3-testnet.json`). Portaldot unified history published as manifest 2 (#1–#129,069; manifests 0–1 belong to the previous spec version). Pantry reads it: 3.0 s mixed sync, L3 938 / 938. Polkadot AH newest 80,000 blocks (#22,021,128–#22,101,127, 114,460 rows, 2 chunks, 3.2 MB) verified (21,384 / 21,384 and 6,916 / 6,916 accounts) and published as manifest 3 for 372.64 tPOT; S3 done (2.5 MB over bitswap in ≈ 4 s). Kusama AH recovery timeline (#17,836,634–#22,802,789, 7 rows, 2 chunks, 643 B) published as manifest 4 on 2026-10-27 (spec, chunks, manifest at #218,503–#218,507; store fees ≈ 0.44 tPOT by dry run, the balance fell ≈ 50 tPOT in total, most likely Revive storage deposits for the new spec and manifest). `PotluckRegistry` (PVM, resolc 1.4.0, 42,055 B) `0x528fc6d14a8b1cf4474d2999313f74533cf083b4`, block #236,926, tx `0x5c4b897dd32d210b2370458c5ff21e90475643bd21d9e3dfe5258c4491b4d705`, deposit 3,293.4 tPOT; `manifestCount() == 0`. Manifests 2 and 3 expired after the 7-day retention and were stored again with `renew --restore` on 2026-10-29 (#236,974–#236,987, same manifest ids). Renewable until #319,303 (manifest 4) and #337,774 (manifests 2–3): renew around 2026-11-04 so they live through demo day and voting. Balance: 490.23 tPOT (2026-10-30) |
| DoraHacks check-in (Oct 24, 12:00 UTC) | ❌ Not submitted |

## 2. Immediate next steps & blockers

**Blockers (user actions):**
1. ~~Request tPOT~~ 1,500 tPOT received 2026-10-21 via ticket `#1278-wngstnr` (first batch cap); a second batch paid for the PVM deploy (2026-10-29). Ask for a third batch (≈ 6,000) to publish the 1.5 M-block Polkadot AH build.
2. ~~Create a public GitHub repo~~ Done 2026-10-20: https://github.com/wngstnr-code/potluck. Claude pushes only when the user asks.
3. ~~Confirm the DoraHacks registration~~ Done 2026-10-21 (wallet address submitted in the organizer questions). Its screenshot goes with the faucet ticket.
4. Upload the demo video (≤ 3 min) to a public link and fill in the DoraHacks final form.

**Decided:** publish scope = progressive backfill (newest ~1.5 M blocks first, older ranges later; `ARCHITECTURE.md` §15 decision 5).

**Key spike findings to apply in M2** (details in `spikes/results/`):
- Decode block N with the runtime of N−1 (S1).
- Batch `chain_getBlockHash([n…])` and use ~128 in flight on the Parity endpoint (S6).
- Take accounts via `toHex()` (S4); apply the closed `Balances` delta rule table (S4).
- Recovery-timeline spec starts at Kusama AH #17,836,634 (S7).

**Next engineering steps (in order):**
1. ~~Finish the background builds~~ Done 2026-10-27. The newest 1.5 M Polkadot AH blocks (#20,572,285–#22,072,284, 30 chunks, 2,173,842 rows, 62 MB gzip) pass L1 and L3 in all 30 chunks (617,190 account checks) after the reconcile fix for same-block reap and recreate (`ARCHITECTURE.md` §0); publishing it needs ≈ 6,200 tPOT. The Kusama AH recovery timeline is published (manifest 4).
2. With the remaining tPOT (≈ 908):
   - ~~deploy the EVM registry, set `PORTALDOT.registry`, publish the Portaldot history, measure the snapshot load~~ done 2026-10-21;
   - ~~publish a small newest Polkadot AH range and run S3~~ done 2026-10-21 (manifest 3);
   - ~~load Polkadot AH from that snapshot in Pantry~~ done 2026-10-21 ("Polkadot AH" page: 5.6–6.4 s vs ≈ 11 min direct, per-account L2 + L3);
   - ~~publish the Kusama AH timeline~~ done 2026-10-27 (manifest 4);
   - ~~the PVM deploy~~ done 2026-10-29 with the second batch;
   - with a third batch: the 1.5 M-block AH build.
3. ~~Static hosting~~ Done 2026-10-20: GitHub Pages via Actions (approved by the user).
4. Landing page (`apps/landing`, Next.js, static): hero with a live verify trace, demo video, how it works, capabilities, use cases, proof charts and on-chain deployment facts, in the Potluck midnight palette (WCAG AA). Live at https://wngstnr-code.github.io/potluck/ since 2026-10-27: the Pages workflow exports it with the `/potluck` base path and serves it at the site root, next to /pantry/ and /wasiat/.
5. Check-in package for Oct 24: README (done, deployment rows pending), architecture diagram (README), progress notes, deployment info, a ≤ 3 min video of one core function.
6. Report to the Portaldot team: held funds can vanish on `System.KilledAccount` without a Balances event (TransactionStorage hold, block #89,388). Re-check it against the StorageFee finding (`ARCHITECTURE.md` §0) before reporting: the TransactionStorage fee is held and burned through `BurnedDebt`, which names no account.
7. P1: consolidate many small sync manifests, persistent browser cache of loaded histories, old-pallet Recovery events (Kusama AH #11,135,052–#17,836,634) for richer Wasiat timelines.

**Plan to the code freeze (agreed 2026-10-30; core modules done by Nov 4 so nothing lands in the last 24 h):**
1. ~~Refresh this status and the README dependency list~~ done 2026-10-30.
2. Re-check the `System.KilledAccount` finding and draft the report to the Portaldot team (step 6).
3. Persistent browser cache of loaded histories (client + Pantry).
4. Old-pallet Recovery events (spec + core + Wasiat), build, dry-run publish.
5. Consolidate small sync manifests (CLI + client).
6. Register the published manifests in the PVM registry without storing the blobs again; the apps read PVM first and fall back to EVM. Budget from the 490 tPOT: PVM registration ≈ 100–200 (dry run first), Recovery republish ≈ 50, consolidated manifest ≈ 50, renewals < 1, buffer ≈ 100.
7. Renew every published entry around 2026-11-04.

---

## 3. Prerequisites & environment

### 3.1 Tooling
| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 22 (local: v24.1.0) | Everything TS |
| pnpm | ≥ 9 | Workspace package manager |
| Foundry (`forge`, `cast`) | latest stable | Registry contract build/test; EVM deploy via `https://test-evm-rpc-v3.portaldot.dev` |
| resolc | version compatible with Portaldot's pallet-revive (**verify in spike**) | Compile the same Solidity to PolkaVM (PVM) |
| A Substrate wallet extension | Talisman / SubWallet / polkadot.js | Sign Substrate txs (`transactionStorage.store`, `recovery.setFriendGroups`) in apps |
| MetaMask (optional) | n/a | EVM-side interaction with the registry (chain ID 420420777) |
| gh CLI | logged in as `wngstnr-code` | Repo management (only when the user asks) |

Git identity (already configured globally): `Wangsit Nursyahada <wangsitsada1234@gmail.com>`. That email must be verified on the GitHub account so commits are attributed to `wngstnr-code`. If it is not, use the GitHub noreply address `194956703+wngstnr-code@users.noreply.github.com` in a repo-local `git config user.email`. Only the user decides this.

### 3.2 Getting tPOT (user action)
1. Install a Substrate wallet extension and create a **new development-only account**. Store the seed offline. Never reuse an account holding real assets.
2. Copy the **SS58 address starting with `5`**, not the `0x` address.
3. In the Portaldot Discord (https://discord.gg/G33tVtCsNW), open a **support ticket** with a screenshot of your DoraHacks Hacker House registration and your SS58 address. Alternatively DM admin `@titus242471` (Discord) or `@Stella707827` (DoraHacks).
4. Nobody legitimate will ask for your seed phrase.
   - Confirmed by the Discord `#dev-announcement` post of 2026-10-17: hackathon participants who entered a native address (starting with `5`) in the DoraHacks registration form get tokens in distribution batches; others open a ticket with a registration screenshot and the address.
   - The MEE6 bot warns for any link posted in a ticket, so write repo or demo references without URLs.
   - Ticket `#1278-wngstnr` was opened on 2026-10-21 asking for ≈ 8,000 tPOT.
5. For the CLI publisher, put the dev seed in a local `.env` as `PUBLISHER_SEED=...`. `.env` is git-ignored; never commit or paste it.

### 3.3 Environment variables (`.env.example` to be committed; `.env` git-ignored)
```
PORTALDOT_WS=wss://test-node-v3.portaldot.dev
PORTALDOT_EVM_RPC=https://test-evm-rpc-v3.portaldot.dev
PORTALDOT_CHAIN_ID=420420777
POLKADOT_AH_WS=wss://polkadot-asset-hub-rpc.polkadot.io
KUSAMA_AH_WS=wss://kusama-asset-hub-rpc.polkadot.io
REGISTRY_ADDRESS_PVM=
REGISTRY_ADDRESS_EVM=
PUBLISHER_SEED=            # dev-only seed, never commit
```

---

## 4. Repository layout (target)

```
potluck/
├─ CLAUDE.md
├─ README.md                 # submission-grade README (problem, demo, architecture, deploy proof)
├─ .claude/settings.json     # attribution disabled
├─ .gitignore  .env.example  package.json  pnpm-workspace.yaml  tsconfig.base.json
├─ packages/
│  ├─ spec/                  # JSON Schema, canonicalization, specHash
│  ├─ core/                  # source adapters, runtime/metadata cache, spec engine, encoder, chunker, bloom, merkle
│  ├─ client/                # browser SDK: adaptive sync, loader, verifier L1–L3, SQLite-WASM, live tail
│  └─ cli/                   # publisher: build / publish / renew / verify / tamper
├─ contracts/                # Foundry project: PotluckRegistry.sol + tests + deploy scripts (EVM + PVM)
├─ specs/                    # portaldot.unified-history.json, polkadot-ah.balance-history.json, kusama-ah.recovery-timeline.json
├─ spikes/                   # throwaway-but-committed probe scripts with recorded results (S1–S7)
├─ apps/
│  ├─ pantry/                # catalog + "try an address" + verification report + attack demo
│  └─ wasiat/                # Wasiat-lite
└─ docs/                     # this documentation set
```

---

## 5. Milestone plan

Each milestone lists tasks, a **done-when** check, and the **planned commits**. Planned commits are examples of granularity: split further if a step grows, never merge them.

### M0: Repository bootstrap
- Tasks: `git init`; `.gitignore` (node_modules, dist, .env*, !.env.example, out/, cache/, broadcast/, *.sqlite, .DS_Store); pnpm workspace; `tsconfig.base.json` (strict); lint/format config; `.env.example`; minimal `README.md`.
- Done when: `pnpm install` and `pnpm -r build` succeed on empty packages.
- Commits:
  1. `chore(repo): initialize workspace with pnpm and TypeScript base config`
  2. `chore(repo): add gitignore and env example`
  3. `docs(repo): add project docs and contributor rules`. Docs + `CLAUDE.md` + `.claude/settings.json` go in a separate commit from tooling.
  4. `chore(repo): scaffold spec, core, client and cli packages`

### M1: Spikes (de-risk before building)
| Spike | Needs tPOT | Done when | Commit |
|---|---|---|---|
| ✅ S1 multi-runtime event decoding (Polkadot AH, ≥35 versions) | no | Decodes `System.Events` correctly on both sides of 3+ runtime upgrades; metadata size/latency recorded | `test(spike): decode events across Polkadot AH runtime upgrades` |
| ✅ S4 balance reconciliation (Polkadot AH) | no | For 20 random accounts, `free+reserved` delta over a window = Σ balance-event deltas; list of required events documented; row-volume estimate replaces the ~250 MB assumption | `test(spike): validate windowed balance reconciliation` |
| ✅ S6 public RPC throughput | no | Safe sustained req/s per endpoint and the needed parallelism recorded | `test(spike): measure public RPC throughput limits` |
| ✅ S7 Recovery start block (Kusama AH) | no | First block containing the Recovery `friendGroups` storage found | `test(spike): locate Recovery pallet activation on Kusama AH` |
| S2 store 1/4/8 MB in TransactionStorage | **yes** | Real tx hashes; fees recorded; 8 MB passes block length/weight | `test(spike): store 1-8 MB blobs in TransactionStorage` |
| S3 `bitswap_v1_get` for MB blobs | **yes** (after S2) | MB blob retrieved via WSS from a browser context; latency recorded | `test(spike): fetch MB blobs via bitswap_v1_get` |
| S8 resolc → PVM deploy on Portaldot | **yes** | Trivial contract compiled with resolc and deployed; version pair recorded | `test(spike): deploy PVM contract via resolc` |

Record every result in `ARCHITECTURE.md` §0/§14 (`docs(arch): record spike S<n> results`).

### M2: `spec` + `core` (✅ done, incl. Revive EVM logs)
- Tasks:
  - JSON Schema + validator for specs; canonical spec hashing.
  - Source adapters: Substrate events (safe RPC), Revive logs (`eth_getLogs`).
  - Runtime-version map + metadata cache; event decoding; spec engine (match → row → columns).
  - Address normalization (Revive via runtime API); canonical NDJSON encoder; chunker; bloom; Merkle root.
- Done when: running each reference spec twice over the same finalized range yields identical `rawHash` values. Unit tests use recorded real fixtures.
- Commits, one per unit:
  - `feat(spec): …`
  - `feat(core): add substrate events source adapter`
  - `feat(core): add runtime version map and metadata cache`
  - `feat(core): add canonical NDJSON encoder`
  - `feat(core): add chunker with bloom and merkle root`
  - plus the matching `test(core): …` commits.

### M3: `PotluckRegistry.sol` (✅ EVM deployed 2026-10-21, PVM deployed 2026-10-29)
- Tasks: implement the interface in `ARCHITECTURE.md` §9; Foundry tests (publish, latest, flag once per address, renewal notes); deploy scripts for EVM (forge) and PVM (resolc).
- Done when: tests pass locally, and once tPOT is available both deployments are on testnet with addresses recorded in `.env.example`/README.
- Commits: `feat(contracts): add PotluckRegistry`, `test(contracts): …`, `build(contracts): add EVM and PVM deploy scripts`, `chore(contracts): record testnet deployment addresses`.

### M4: `cli` publisher (✅ build/verify/publish/renew/sync/tamper; real publish awaits tPOT)
- Tasks: `build`, `publish` (store chunks, then atomic `utility.batchAll[store(manifest), revive.call(publish)]`), `renew`, `sync`, `verify`, `tamper` (demo only).
- Done when: real manifests for all 3 specs exist on Portaldot testnet with explorer links.

### M5: `client` SDK (✅ done; local persistent cache and Recovery state replay are P1)
- Tasks: adaptive sync (≤20 s direct threshold); registry reader; bitswap loader with bloom filtering; verifier L1/L2/L3 + state-replay; SQLite-WASM (`opfs-sahpool`, Web Worker); live tail; progress events.
- Done when: a Polkadot AH account history loads cold in < 5 s from snapshots and passes L3; the tampered manifest is detected for the affected account.

### M6: Apps
- **Pantry:** catalog, try-an-address, DIRECT-vs-SNAPSHOT panel, attack demo.
- **Wasiat-lite:** Kusama AH recovery timeline with state-replay badge + `recovery.setFriendGroups` on Portaldot V3 (with the `securityDeposit = 0` warning).
- Done when: both run as static builds against live chains.

### M7: Submission package
- README (problem, why Portaldot, architecture diagram, deploy proof: addresses + tx hashes + explorer links, run instructions), pitch deck (PDF), demo video ≤ 3 min, DoraHacks final form.
- Done when: every item of the final-submission checklist (§6) is ticked **before Nov 6, 04:00 UTC**, with core modules finished well before the last 24 h.

---

## 6. Hackathon deadlines & checklists (UTC)

| Date | Event | Our deliverable |
|---|---|---|
| **Oct 24, 12:00** | Check-in submission | Progress + outstanding items; public repo with README, dev records, **architecture diagram**; testnet deployment info (**contract address, tx hash, explorer link**); demo link or ≤3 min video of one core function |
| Oct 26, 16:00 | Feedback announced | Read and adjust |
| Oct 27, 12:00 | Office-hour application | Ask about: storing ~0.6–1 GB on testnet (or a backfilled subset), `securityDeposit = 0`, resolc version, bitswap limits |
| Oct 28–29 | Office hours | n/a |
| **Nov 6, 04:00** | **Final submission / code freeze** | Everything in M7 |
| Nov 8–9 | Live demo day (Discord) | Live demo |
| Nov 9 16:00 – Nov 10 16:00 | Community Choice voting | Promote in Discord |
| Nov 11 | Winners announced | n/a |

**Final submission checklist:**
- [ ] Project name, one-sentence overview, team (solo)
- [ ] Public GitHub repo, complete README, deployment instructions, docs
- [ ] Reproducible/runnable code
- [x] Testnet deployment info: registry addresses (PVM + EVM), tx hashes, explorer links (README, `contracts/deployments/portaldot-v3-testnet.json`)
- [x] Runnable demo (static app link or local instructions): GitHub Pages + README "Run it"
- [ ] Demo video ≤ 3 min, public link: real product, core functions, Portaldot integration
- [x] Pitch deck (PDF/link): problem, why Portaldot is essential, proof of functionality, reasons for continued support (`docs/pitch/potluck-pitch.pdf`, 2026-10-28)
- [ ] ≥ 3 valid commits in the period; no last-24h core dump; open-source deps disclosed

---

## 7. Top risks (see `ARCHITECTURE.md` §12/§14 for detail)
| Risk | Mitigation |
|---|---|
| No tPOT before Oct 24 | Request today. Meanwhile build everything testable locally. Worst case, the check-in shows direct-sync demo + local contract tests |
| Large data on a shared testnet | Compression, windowed specs, coordinate with Portaldot in office hours |
| Public RPC rate limits during publishing | Bounded parallelism, multiple endpoints, resumable builds |
| Reconciliation edge cases (fees, reserves, dust, migrations) | Spike S4 first; document exactly which events are covered |
| resolc/PVM incompatibility | EVM fallback with identical ABI; client unchanged |
| Scope creep | MVP scope in `ARCHITECTURE.md` §13 is the contract; P1 only after P0 is done |

---

## 8. Reference
- Hackathon page: https://dorahacks.io/hackathon/portaldot-hacker-house-2026/detail
- Portaldot docs: https://portaldot-dev.readthedocs.io/en/latest/
- Portaldot V3 testnet guide (community): https://github.com/ItsCogumellum/portaldot-v3-testnet-guide
- Node console: https://node-console.portaldot.dev/
- Polkadot data-storage docs (Bulletin Chain / Statement Store): https://docs.polkadot.com/reference/polkadot-hub/data-storage/
- Constants and measured facts: `ARCHITECTURE.md` §0 and `CLAUDE.md` §7.

## 9. How the research numbers were produced
During planning, measurements were taken with ad-hoc Node scripts (`@polkadot/api` 16.x) in a temporary scratch directory that is **not** part of the repo. The headline numbers are:
- 5.2 s full Portaldot sync;
- ≥35 Polkadot AH runtime versions;
- Revive activation block 11,405,259;
- Kusama AH Recovery stats;
- TransactionStorage constants;
- the Revive mapping finding.

M1 re-creates the relevant probes under `spikes/` so every number in the docs becomes reproducible from the repo.
