# Demo video script

Two cuts of the same story, each at most 3 minutes (`HACKATHON.MD` §5):
- **Check-in cut (Oct 24):** shows what runs today. If tPOT has not arrived, the on-chain segment is replaced by the publish dry run.
- **Final cut (Nov 6):** adds the deployed registry, a published manifest, and the on-chain flag.

Rules for both cuts:
- **Real data only.** Every number on screen is read live from the chains. Do not edit numbers in post.
- **Time-lapse must be labeled.** The Portaldot direct sync takes about 2.5 minutes, so speed it up and keep a small on-screen caption, e.g. "sped up 8×, real time 2 min 25 s". The Pantry overview also shows the measured time.
- **Recording setup:**
  - Chrome at 1440 × 900, light theme, 100% zoom, a fresh profile with no extensions except the wallet.
  - Hosted apps: https://wngstnr-code.github.io/potluck/pantry/ and `/wasiat/`.
- **Voice:** English, calm, one idea per sentence. The narration below is about 380 words, which fits about 2 min 45 s at a normal pace.

## Before recording

1. Open Pantry → **Overview** about 3 minutes before recording, so the history is loaded and reconciled. Record the load separately for the time-lapse.
2. Open Wasiat-lite → **Inheritance plans** and wait for "State replay" to show its full count.
3. **Pick the accounts:**
   - For **Verify account**, use one active account from "Most active accounts".
   - For **Attack demo**, use the default victim.
   - For Wasiat, pick a plan with an open attempt or an inheritor. The timeline is more interesting than a plain "Planned" one.
4. **Check-in cut only:** run the publish dry run in a terminal with a large font. On 2026-10-21 it printed 69,831 B to store, ≈ 7.02 tPOT:
   `node packages/cli/dist/index.js publish builds/portaldot-v3-testnet.unified-history/1-116549 --dry-run --from-address 5HHPEACGYoJvEerkxD9vW6L93jHM7VQKTwXxsp2L8331jfmM`

## Script

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:20 | Title card "Potluck", then the Pantry **Overview** on Portaldot V3. | Every dApp needs history: transfers, holders, who inherited what. Nodes only answer "what is the state now". So every team runs an indexer server, and users have to trust its database. Potluck removes the server. |
| 0:20–0:50 | Overview loading, time-lapsed with its caption. Tiles fill: "Indexed rows", "Accounts with history", "Account checks reconciled". | This is Portaldot's own history, native tokens plus EVM and PVM token events. It is synced from genesis inside the browser, with no backend. Each block is decoded with the runtime that executed it. Then every account is reconciled: balance before, plus every row, must equal the balance the chain stores after. All of them match. |
| 0:50–1:15 | **Verify account**: paste an active account, run it. Show "L2 · Row truth", "L3 · Reconciliation", "Verdict". | Any single account can be checked on demand. Each row is re-derived from its own block's events, and the balance is reconciled against chain state. It takes about two seconds. |
| 1:15–1:50 | **Attack demo**: run it. Show "Forged chunk passes L1", "Payment hidden", then the red L3 result and the exact difference. | Now the attack. A dishonest publisher hides one payment and recomputes every hash, so the integrity check passes. Row checks pass too, because every remaining row is real. Reconciliation catches it: one account no longer adds up, and the difference is exactly the hidden amount. That evidence is what a client posts as a flag on Portaldot. |
| 1:50–2:15 | **Check-in:** terminal dry run with fees per chunk. **Final:** Catalog → "Manifests on Portaldot", then the registry tx and the TransactionStorage `store` tx on the Portaldot explorer. | Publishers store these chunks in Portaldot's TransactionStorage, where validators must keep proving they hold the data. Their manifest goes into a Solidity registry on pallet-revive. Browsers fetch chunks over the node's bitswap, so there are no gateways and no servers. |
| 2:15–2:45 | Wasiat-lite → **Inheritance plans**, then one account's timeline, then **Set up on Portaldot**. | The same verification powers apps. Wasiat-lite reads every inheritance plan on Kusama Asset Hub's Recovery pallet. It rebuilds each account's timeline from the blocks that changed it, and checks that the timeline replays to exactly today's state. The same plan can be set up on Portaldot, signed by your own wallet. |
| 2:45–3:00 | Closing card: tagline, the two app links, and the repo. | Potluck makes Portaldot the history warehouse for the Polkadot ecosystem. Everyone brings a chunk, and every dApp gets the history. |

## Final-cut additions

When the registry is deployed:
- **1:50–2:15:** show the real `PotluckRegistry` address and the `publish` tx hash on the explorer.
- **1:15–1:50:** end the attack segment on the `flag` tx.

Record the registry address and tx hashes in the README deployment table before recording.
