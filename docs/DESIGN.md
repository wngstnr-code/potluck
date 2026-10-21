# Potluck design system

Canonical design reference for `apps/pantry` and `apps/wasiat`. Tokens live in [`packages/theme/tokens.css`](../packages/theme/tokens.css), fonts in [`packages/theme/fonts.css`](../packages/theme/fonts.css).

## 1. Direction

A colorful analytics dashboard with soft depth, full screen, filled with real chain data.

- **Shell:** navy rail on the left (collapsible: labels ↔ icons only, state remembered), pale-blue page, white panels with a soft two-layer shadow and a 1 px top highlight.
- **Color carries meaning:**
  - solid tiles (white, white, yellow, blue) for headline numbers;
  - series colors for data;
  - green/red only for direction (+ credit, − debit) and verification state.
- **Every number is real.** Values come from the chains or from the user's own build/verification. A value that cannot exist yet (e.g. snapshot load time before the first publish) is shown as unavailable, never invented.

## 2. Rules from design review (do not break)

| Rule | Instead |
|---|---|
| No tinted pills (pale background + same-hue text, e.g. light-blue chip with blue text). Applies to tags, icon wells, table headers, list icons | Solid fills with contrast-picked text, or plain text |
| No decorative dots (status dots, dot legends, dot bullets) | Text labels, solid tags, bars |
| No outer "app card" frame | Full-screen shell: rail + main fill the viewport |
| No empty space | Layout locked to the viewport; tables scroll inside their panel; the last panel in a column stretches with useful content (e.g. a chart) |
| No filler UI (dead "⋮" action columns, AI sparkle icons, vague copy) | Only controls that do something; product-specific copy |
| No violet/blue gradients as decoration | Gradients only on the rail, primary button, blue tile and proof bar |

## 3. Palette

| Token | Value | Use |
|---|---|---|
| `--page` | `oklch(0.955 0.018 255)` | page background |
| `--surface` | white | panels, tiles, inputs |
| `--ink` / `--muted` | `oklch(0.22 0.05 262)` / `oklch(0.5 0.03 262)` | text |
| `--navy` | `oklch(0.31 0.11 264)` | rail, primary button, proof bar |
| `--blue` | `oklch(0.55 0.17 258)` | blue tile, charts |
| `--yellow` | `oklch(0.93 0.16 108)` | logo, "ready" tile, proof button |
| `--green` / `--red` | `oklch(0.52 0.13 150)` / `oklch(0.55 0.19 25)` | + credit / − debit, pass / fail |
| `--series-1…9` | blue, yellow, navy, coral, teal, violet, orange, green, slate | row kinds; tags use the same color as their chart series |

Kind tags: solid `--series-N` fill, text `--on-series-N`. Text colors were picked by measured contrast; all pairs are ≥ 4.5:1 (lowest: violet/white 4.55, blue/white 4.94).

## 4. Typography

**IBM Plex**, self-hosted via `@fontsource` (no runtime font CDN).

- **Plex Sans** for UI.
- **Plex Mono** (tabular numerals) for every block number, hash, address, amount and kind tag.
- **Plex Serif** for Wasiat-lite headings only.

Scale: 11 (tags, axis) · 12 (meta) · 13 (table) · 14 (body) · 16 (panel titles) · 26 (page title) · 32 (tile numbers). Three weights: 400, 500, 600.

## 5. Logo

Three marks, chosen with the user on 2026-10-21. Files in [`brand/`](./brand/).

| Mark | File | Use |
|---|---|---|
| **p monogram**: a navy lowercase p whose bowl holds four chunks (blue, coral, teal, and one in tile yellow) | `brand/potluck-mark.svg` | favicon, app rail (`PotluckMark` in `packages/ui`), anywhere at 48 px or smaller |
| **Pot of chunks**: a navy pot holding chunks with one more dropping in ("everyone brings a chunk") | `brand/potluck-pot.svg` | large placements: README header, pitch deck, video title and closing cards |
| **Wasiat-lite key**: a navy key whose bow holds four friend chunks (the p's chunk grid); the key is the account control that passes to the inheritor | `brand/wasiat-mark.svg` | Wasiat-lite favicon and rail (`WasiatMark`, `mark="wasiat"` on `Shell`) |

- Potluck marks sit on the yellow `--yellow` tile, the Wasiat-lite key on the teal `--series-5` tile so the two favicons differ in a tab bar. Corner radius ≈ 31% of the side (20 / 64; the rail tile is 14 / 44).
- Colors are the theme tokens: navy `--navy`, chunks `--blue`, `--series-4` (coral), `--series-5` (teal).
- The wordmark is "potluck" in lowercase IBM Plex Sans 600, set as live text next to the mark, never outlined into the files.
- Do not recolor the tile, add gradients or outlines, or use the pot below 48 px (its chunks blur).

## 6. Components

- **Tile:** label (13, muted) → big mono number (32) → sub line or mini chart, bottom-aligned.
- **Panel:** title row (16/600 + muted hint right) and content.
- **Table:**
  - sticky plain header (muted text on white, no tint);
  - rows show a square identicon (solid hue from the account hash, white pattern), mono address, kind tag, signed colored amount;
  - all rows, virtualized.
- **Proof bar:** navy gradient at the bottom of the rows panel, yellow action button.
- **Verification list:** solid green check squares, L1/L2/L3 with mono results.
- **Motion:**
  - `--ease-out` everywhere;
  - rail collapse 260 ms;
  - hover lifts of 1–2 px;
  - no bounce.

## 7. References

- **Layout reference:** a soft colorful clinical dashboard supplied by the user (rail with active highlight, colored KPI tiles, queue table, gauge, summary bar).
- **Earlier explorations (rejected):** "evidence ledger" paper (receipts, CAD title blocks) and a flat neutral dashboard. The user preferred a colorful dashboard.
