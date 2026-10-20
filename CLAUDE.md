# CLAUDE.md: Potluck (Portaldot Hacker House 2026)

Read this file fully at the start of every session, then read `docs/DEVELOPMENT.md` §1 (current status) before doing anything.

## 1. Language rules (strict)
- **Every file is written in English**: code, comments, docs, commit messages, PR text, config, test names, UI copy.
- **Chat with the user in Indonesian (Bahasa Indonesia).**
- If you find non-English text in a repo file, translate it as part of your change.

## 2. Who is building this
- **Solo project.** The user (GitHub: `wngstnr-code`) is the only developer and the only author.
- There is no team: do not write "we decided with the team", do not assign roles, and do not plan for parallel humans.

## 3. Git & commit rules (strict)
1. **The user is the only author and contributor.**
   - Never add `Co-Authored-By:` trailers, "Generated with Claude Code", 🤖 lines, or any AI attribution to commits, PR bodies, tags, release notes, code comments, README, or docs. Attribution is also disabled in `.claude/settings.json`; keep it that way.
   - Never change `git config user.name/user.email`, never use `--author`, and never commit as another identity.
2. **Never** push, create the GitHub repo, open PRs, force-push, rewrite published history, or delete branches unless the user explicitly asks in this session.
3. **Split commits.** One logical, self-contained change per commit; never bundle unrelated changes.
   - Commit after each verified step (build/typecheck/tests pass for the touched package).
   - Stage explicit paths (`git add <paths>`), never a blind `git add -A` / `git add .`.
   - Before committing, run `git status` and `git diff --staged` and confirm only intended files are staged.
4. **Format:** Conventional Commits, `type(scope): imperative summary` (subject ≤ 72 chars, no trailing period). Add a body explaining *why* when the change is non-trivial.
   - Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
   - Scopes: `repo`, `spec`, `core`, `client`, `cli`, `contracts`, `specs`, `pantry`, `wasiat`, `docs`, `spike`.
   - Examples:
     - `feat(core): add runtime-version map via binary search`
     - `test(contracts): cover flag deduplication per address`
     - `docs(arch): record Revive address-mapping finding`
5. **Hackathon compliance** (see `docs/HACKATHON.MD` §5):
   - Code must be produced during **Oct 14 – Nov 6, 2026**, with at least 3 valid commits.
   - **Final versions of core modules must NOT be committed all at once within the last 24 h before Nov 6, 04:00 UTC.** Keep a steady, incremental history.
   - After the code freeze (Nov 6, 04:00 UTC): no substantial changes. Critical fixes only, reported to the organizer.
6. **Never commit secrets:** `.env*` (except `.env.example`), seed phrases, private keys, `PUBLISHER_SEED`. Check `git diff --staged` for them.

## 4. What we are building (one paragraph)
**Potluck**: on-chain history for any dApp, loaded in seconds in the browser, with no servers, stored and guaranteed by Portaldot.
- A publisher runs a declarative JSON *spec* against a source chain (Polkadot Asset Hub, Kusama Asset Hub, or Portaldot V3 itself), producing canonical NDJSON chunks.
- The publisher stores the gzip chunks in Portaldot's **TransactionStorage** pallet and registers a manifest in **`PotluckRegistry.sol`** on Portaldot's **pallet-revive**.
- Browsers fetch chunks via the node RPC **`bitswap_v1_get`**, verify them against the *source chain* (L1 integrity, L2 row truth, L3 windowed balance reconciliation), store them in SQLite-WASM (OPFS), and live-tail new blocks.
- An adaptive sync uses direct sync when cheap (Portaldot today) and snapshots when expensive.
- Demo app **Wasiat-lite** shows real inheritance/recovery timelines from Kusama Asset Hub's Recovery pallet.
- Target track: **Modular Cloud & Middleware** (also aiming at the Grand Prize).

## 5. Documentation map
| Doc | Status | Use it for |
|---|---|---|
| `docs/DEVELOPMENT.md` | **Canonical, living** | Current status, prerequisites, milestone plan, commit plan, session protocol |
| `docs/ARCHITECTURE.md` | **Canonical** | Detailed design, formats, contract interface, MVP scope, spikes, decisions |
| `docs/POTLUCK.md` | **Canonical** | Product concept, demo script, rubric mapping, business model, judge Q&A |
| `docs/HACKATHON.MD` | Reference | Rules, rubric weights, deadlines, submission requirements, verified chain facts |
| `docs/RESEARCH-STAGE2.md` | Background | Past winners, competitor repos, untouched V3 primitives, market |
| `docs/IDEAS.md`, `docs/ROAST.md`, `docs/ROAST-WASIAT.md` | Historical | How we got here; do not treat as current design |
| `docs/README.md` | Index | Doc index |

If two docs disagree: `DEVELOPMENT.md` (status) > `ARCHITECTURE.md` (design) > `POTLUCK.md` (concept) > others.

## 6. Decisions already made (do not re-open without new evidence)
- **Product:** Potluck (indexer) + Wasiat-lite (demo consumer). Option C. Chosen 2026-10-20.
- **Reframe:** Portaldot is the *data layer* (TransactionStorage + Revive registry) for heavy chains' history. Portaldot itself is a first-class source via adaptive sync.
- **Polkadot Asset Hub window:** from block **11,405,259** (Revive activation, 2026-01-27T10:59:24Z).
- **Contracts:** one Solidity source, dual-deployed on Revive: **PVM via resolc (primary)** and **EVM via solc (fallback)**, identical ABI. No ink!.
- **Specs are declarative JSON only** (no arbitrary handler code in the MVP).
- **Verification = reconciliation against the source chain**, not random sampling.
- **Snapshots are an optional accelerator**; the client must always work via direct sync.
- **Publish scope = progressive backfill:** publish the newest ~1.5 M Polkadot AH blocks first (~90–140 MB), older ranges later as extra manifests; the client merges manifests, shows coverage, and direct-syncs gaps (`docs/ARCHITECTURE.md` §15 decision 5).

## 7. Hard technical facts (measured; full list in `docs/ARCHITECTURE.md` §0)
- Portaldot V3 testnet:
  - Substrate WS `wss://test-node-v3.portaldot.dev`, EVM RPC `https://test-evm-rpc-v3.portaldot.dev`.
  - EVM chain ID `420420777`; token `tPOT`, 14 decimals, SS58 prefix 42.
  - Explorer: https://node-console.portaldot.dev/
- Portaldot V3 live: `wss://live-v3-node.portaldot.dev`.
- TransactionStorage: max 8,388,608 B per tx, retention 100,800 blocks (~7 days), permissionless. **Real cost ≈ 100 tPOT per MB** (transaction length fee; `byteFee` 10 planck/byte is negligible) (S2). Normal block length is 14,942,208 B. Upload blobs with a ≥ 90 s request timeout.
- `bitswap_v1_get(CID)` works on the public Portaldot node.
- **Revive address mapping must come from runtime API `ReviveApi.address` / `ReviveApi.accountId` + `revive.originalAccount`.** Never compute it locally: the keccak rule fails for 851 `map_account` accounts.
- Portaldot native has 14 decimals, EVM side 18 (`nativeToEthRatio` 10000).
- **`state_queryStorage` is blocked ("unsafe") on Polkadot public nodes.** Use safe RPCs only (`chain_getBlockHash` + `state_getStorage` per block, `archive_v1_*`).
- Polkadot AH & Kusama AH public nodes are archive nodes. Polkadot AH has ≥35 runtime versions, with metadata v14 from block 1000.
- Full Portaldot testnet event sync takes ~5.2 s (9,202 events). The Polkadot AH Revive window (~10.65 M blocks) takes **~2–4 days** to sync naively in a browser. The publisher needs ~12 h at ~250 blocks/s with batched `chain_getBlockHash([n…])` (S6). Only the Parity Asset Hub endpoint is reliable.
- **Decode a block's events with the runtime that executed it (parent state's runtime version)**, never the block's post-state version, which fails on `set_code` blocks (S1).
- Take accounts from codecs via `toHex()`. `toJSON()` yields SS58 strings and silently breaks storage keys (S4).
- Balance reconciliation is exact (319/319 accounts, S4). Balance-history volume over the Revive window is ~0.6–1 GB gzip, hence progressive backfill (decision 5).
- Kusama AH Recovery inheritance API starts at block **17,836,634** (S7).
- **Pass raw byte payloads to `@polkadot/api` as hex strings, never `Uint8Array`.** A `Uint8Array` for `Bytes` is treated as already SCALE-encoded and silently truncated (S8).
- Revive storage deposits: `depositPerByte` 0.06 tPOT, `depositPerItem` 0.15 tPOT. Deploying the registry costs ≈ 433 tPOT (EVM) / ≈ 3,293 tPOT (PVM) (S8 dry-run).
- EVM logs are `Revive.ContractEmitted` events in `System.Events`; one pipeline covers both VMs. ERC-20/ERC-721 `Transfer` share a selector (differ by indexed count).
- The public Portaldot WSS drops connections every ~60 s; always use `connectWs` + `withRetry` (auto-reconnect, ~15 s retry window).
- `System.KilledAccount` can erase held funds without a Balances event; specs model it as an `effect: "reset"` row.
- Portaldot `recovery.securityDeposit = 0` (Kusama AH uses ~0.17 KSM).

## 8. Engineering conventions
- TypeScript (strict), ESM, pnpm workspaces, Node ≥ 22 (local: v24). Foundry for contracts (+ resolc for PVM). Vite + React for apps.
- **Zero servers:** deployables are static files + contracts + on-chain data. Never introduce a backend, database server, cron service, or API key dependency.
- **No mock data or mock features.** Everything shown reads real chains. Unit tests may use recorded real fixtures (committed with their source block numbers). Integration tests hit live RPCs and are tagged so they can be skipped offline.
- **Determinism:**
  - canonical NDJSON (key order = spec `columns`, bigints as decimal strings, addresses as hex, rows sorted by `(block, eventIndex, logIndex)`);
  - `rawHash` = blake2b-256 over uncompressed NDJSON;
  - only finalized blocks.
- Keep packages small and focused (`spec`, `core`, `client`, `cli`). Shared logic lives in `core` and is used by both the CLI and the browser.
- Secrets live only in a local, git-ignored `.env` (e.g. `PUBLISHER_SEED`). Never print or log seeds.
- Definition of done for a change: it builds, typechecks, its tests pass, docs are updated if behavior or decisions changed, and it is committed as a focused commit.

## 9. Session protocol
1. **Start:** read this file and `docs/DEVELOPMENT.md` §1–§2. Check `git log --oneline -15` and `git status`.
2. **Work:** follow the milestone plan in `docs/DEVELOPMENT.md` §5. Prefer small verified steps, each followed by a focused commit.
3. **New measured facts or decisions:** record them in `docs/ARCHITECTURE.md` (facts/decisions) and the status table in `docs/DEVELOPMENT.md` §1.
4. **End:** update `docs/DEVELOPMENT.md` §1 (status, next step, blockers) and commit it as `docs(dev): update status`.
