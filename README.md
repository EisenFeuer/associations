# Associations

A corkboard-style association map: people, organizations, and places as pins; documented ties as colored strings.

This is a **sourced affiliation graph**, not a conspiracy theory. A string means a relationship is documented (a marriage, a shared congregation, a signed letter). It does not mean a secret plot.

## Edge colors (the strings)

| Color | Type | Meaning |
| --- | --- | --- |
| Red `#C41E3A` | `romantic` | Marriage, divorce, partnership, documented affair |
| Brown `#8B5A2B` | `ancestry` | Parent/child, sibling, cousin, legal adoption |
| Gold `#C9A227` | `religion` | Shared religious affiliation or membership |
| Navy `#2E5A88` | `political_ideology` | Shared party, campaign, committee, or public ideology |
| Forest `#2F6B4F` | `organization` | Same studio, gallery, company, guild, school, hangout-as-institution |
| Ivory `#E8DCC8` | `documented_communications` | A specific letter, telegram, testimony, court filing, published correspondence |

## Example webs (research seed)

1. **Entertainment industry** — Hollywood dynasties (Coppola, Fonda, Huston) cross-tied to the 1947 blacklist / Committee for the First Amendment / New Hollywood.
2. **Elon Musk** — family, marriages, partners, children, companies, and court-documented messages.
3. **Ruth Kligman and Abstract Expressionism** — Cedar Tavern / The Club / Irascibles letter / Pollock–Krasner–de Kooning triangle.

Research notes live in [`research/`](research/). Loadable graph JSON lives in [`data/webs/`](data/webs/). Schema: [`data/schema.json`](data/schema.json).

## Viewer

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Two views:

- **Board** — time-agnostic. Highest-degree people/orgs sit at the center. Pins are cylinders; ties are straight rectangular prisms.
- **Time** — the same XY layout, **Z = years**. Cylinders extrude for each lifespan. Long ties (marriages, ancestry, membership) are slabs thick in Z; letters and other moments are thin prisms at that year.

Controls: **middle-drag** pans XY, **scroll** zooms (board) or moves in Z (time; ctrl-scroll still zooms), **drag a pin** to reposition it (edges follow). Background color is in the legend. Keys: `b`/`t` views, `1`/`2`/`3` webs, `[`/`]` scrub year.

## Rules for this dataset

- Every edge has at least one URL.
- Gossip, rumor, and “everybody knows” stay in an `uncertainties` list, never on the board.
- Religious and ethnic affiliation is demographic/membership data, same as Catholicism for the Coppolas or Judaism for several Hollywood Ten writers. It is **not** a cabal marker.
- Children of living people are included only where already widely published; the graph stores public names, not private addresses.
