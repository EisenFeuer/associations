# Method, schema, and sourcing rules

## What this research is

Seed data for a corkboard visualization: **nodes** (people, organizations, places, works, events, affiliation hubs) and **typed edges** (the strings).

It is not an argument that anyone secretly runs anything. Overlapping strings are what a dense social world looks like: families hire each other, lovers share studios, colleagues sign the same letter, congregants sit in the same pews.

## Edge types (map 1:1 onto string color)

| Type | Color | Include when |
| --- | --- | --- |
| `romantic` | red | Marriage, divorce, long partnership, or affair named in a reliable source |
| `ancestry` | brown | Blood, legal adoption, parent/child, sibling, cousin |
| `religion` | gold | Documented affiliation (person → affiliation hub). Shared-religion person–person strings are derived from the hub, not invented as “they plotted together” |
| `political_ideology` | navy | Party, committee, campaign, public ideology, HUAC alignment |
| `organization` | forest | Same company, studio, gallery, guild, school, club |
| `documented_communications` | ivory | A specific letter, telegram, testimony, court filing, memoir passage, published email/text entered in court |

## Confidence

- **high** — primary document, court filing, contemporaneous news, or a standard biographical fact with independent corroboration
- **medium** — reputable secondary (NYT obituary, Britannica, museum, major biography) without the primary in hand
- **low** — plausible but one-source or memoir-only; still on the board only if the source is named

Anything weaker goes under **Uncertainties**, not onto an edge.

## What was deliberately not done

- No “six degrees of Kevin Bacon” padding. A person is in a web only if they have a sourced edge to someone already in it.
- No blood-libel, “Jewish Hollywood cabal,” or Q-style framing. Jewish, Catholic, Dutch Reformed, Scientologist, etc. are affiliation facts, same as any other religion string.
- No secret-child or secret-affair claims without a named high-quality source.
- Living children’s private details (schools, addresses) are omitted; already-public names are used.

## Three example webs (why these)

1. **Entertainment industry** — densest public graph in American popular culture: dynasties (ancestry), affairs (red), guilds/studios (green), HUAC and the Waldorf Statement (navy + ivory), immigrant Catholic/Jewish affiliation (gold).
2. **Elon Musk** — a contemporary romantic/kinship graph with court-filed communications and company overlap.
3. **Ruth Kligman / Abstract Expressionism** — a small downtown world where the same people are lovers, rivals, Club members, and co-signers of the 1950 Met protest letter.

## Files

| Path | Role |
| --- | --- |
| `research/01-entertainment-industry.md` | Narrative + tables |
| `research/02-elon-musk.md` | Narrative + tables |
| `research/03-ruth-kligman-abex.md` | Narrative + tables |
| `data/webs/*.json` | Loadable graphs |
| `data/schema.json` | Node/edge schema |
