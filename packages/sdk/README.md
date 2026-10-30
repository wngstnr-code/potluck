# potluck-sdk

Verified on-chain history for any dApp, loaded in the browser in seconds, with no server.

Publishers index a chain with a declarative JSON spec and store the result on [Portaldot](https://portaldot.io): the chunks in TransactionStorage, the manifest in the `PotluckRegistry` contract (PVM and EVM builds). This SDK finds those snapshots, fetches them over Portaldot's `bitswap_v1_get`, syncs whatever is not published directly from the source chain, and verifies everything against that source chain before you see it:

- **L1 integrity**: every chunk hashes to its manifest, and the manifest to the registry.
- **L2 row truth**: the account's rows are re-derived from the source chain's own events.
- **L3 reconciliation**: the account's balance at each window edge matches chain state exactly.

Nothing the SDK reads (registry, node, snapshot) is trusted. A forged snapshot that passes L1 and L2 is caught by L3.

Live demo: [Pantry](https://wngstnr-code.github.io/potluck/pantry/) · [SDK example](https://wngstnr-code.github.io/potluck/example/) · [Source](https://github.com/wngstnr-code/potluck)

## Install

```bash
npm install potluck-sdk
```

Or with no install and no bundler, straight from a URL:

```html
<script type="module">
  import { createPotluck } from "https://wngstnr-code.github.io/potluck/sdk/potluck.js";
</script>
```

## Use

```ts
import { createPotluck } from "potluck-sdk";

const potluck = await createPotluck(); // Portaldot V3 testnet preset: endpoints, registries, known specs

const history = await potluck.accountHistory({
  spec: "polkadot-ah.balance-history", // preset name, 0x spec hash, or a Spec object
  account: "15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5", // SS58, AccountId32 or H160
});
history.rows; // the account's rows, in block order
history.verified; // L1 + L2 + L3 passed against the source chain
history.uncovered; // ranges neither published nor short enough to sync directly

// Live tail: new finalized rows for the same account
const stop = await potluck.follow({
  spec: "polkadot-ah.balance-history",
  account: "15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5",
  afterBlock: history.head,
  onRows: (rows) => console.log(rows),
});
```

| Call | What it does |
|---|---|
| `potluck.specs()` | Every spec registered on chain, fetched from TransactionStorage and hash-checked |
| `potluck.spec(ref)` | One spec by preset name or hash |
| `potluck.accountHistory({ spec, account })` | One account's history, verified (L1, L2, L3) |
| `potluck.specHistory({ spec, onRows })` | Every row of a spec, streamed (L1 on snapshots) |
| `reconcileHistory(history, source)` | L3 for a whole loaded history |
| `potluck.follow({ spec, account, onRows })` | Follows new finalized blocks |
| `potluck.close()` | Closes every connection |

Options of `createPotluck`: `network` (preset name or a `PotluckNetwork`), `endpoints` (archive RPC per source chain), `metadataStore` and `blobCache` (persist runtime metadata and fetched blobs between visits; both are re-checked when read).

Published specs on the testnet preset: `portaldot-v3-testnet.unified-history` (native and EVM/PVM token transfers on Portaldot), `polkadot-ah.balance-history` (Polkadot Asset Hub balances), `kusama-ah.recovery-timeline` (Recovery pallet inheritance events). To index something else, write a spec and publish it with the CLI in the [repository](https://github.com/wngstnr-code/potluck).

The lower-level functions (`accountHistory`, `specHistory`, `followHistory`, `PortaldotSource`, `planCoverage`, `parseSpec`, `specHash`, `connectWs`) are exported too.

## Requirements

A browser with ES2023, or Node.js 22+ (global `WebSocket`).

## License

MIT
