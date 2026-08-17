---
name: sampler
description: "Extract only the relevant slice of a football tactics board export for a given question, instead of sending the whole JSON to a model. Use when answering questions about a board state — player positioning, team shape, available space, a drawn pass sequence, substitutions, squad comparisons, high-line feasibility, or set-piece setups. Also use to decide when a question needs NO board data at all."
---

# Sampler

Turns a question plus a board export into the smallest context that can still answer it.

The board export runs to ~3,000 tokens and grows with faces, saved formations and scenarios. Almost none of it is relevant to any single question. Sampling cuts a typical request to 120–420 tokens, and — more importantly — removes the noise that makes a model answer about the wrong thing.

```js
const {text, intent, focus, tokens} = Sampler.sample(question, boardJSON);
```

## Two rules that matter more than the size saving

**1. Compute, don't dump.** Models reason poorly over raw coordinate lists. "Where is the space?" answered from 22 `{x, y}` pairs asks the model to do geometry. Answered from a pre-computed occupancy grid, it is reading a fact. The sampler computes line height, depth, width, unit gaps and zone occupancy before anything is sent.

**2. Resolve references.** A drawing is `{"type":"pass","points":[{x:30,y:20},{x:55,y:45}]}`. Sampled, it becomes `1. ground pass: BLUE #8 Pedri → BLUE #10 Yamal`. The model should never have to work out who was standing at a coordinate.

## Question → slice mapping

| Intent | Triggered by | Included | Deliberately excluded |
|---|---|---|---|
| `player` | a player named or `#n` | his full record, 3 nearest teammates and 3 nearest opponents with distances, drawings within 8 units of him, ball | the other 15 players, both benches |
| `shape` | shape, formation, compact, weakness, vulnerable, block, too deep | all 22 positions grouped into units, line heights, depth, width, unit gaps | every rating, benches, drawings |
| `space` | space, gap, overload, exploit, free man, where should | occupancy grid by third × channel, both line heights, ball | ratings, benches, names |
| `sequence` | sequence, move, arrows, drawing, routine, combination | every drawing in order with both endpoints resolved to players, plus only the players involved and their relevant attributes | the other players, benches |
| `personnel` | sub, bench, bring on, replace, selection, rotate | that team's XI and bench with full ratings | positions, opponent, drawings |
| `comparison` | stronger, better, compare, versus, outnumber | both teams narrowed to the named unit, with ratings | everyone outside that unit, drawings |
| `feasibility` | high line, press, offside trap, can we, squeeze up | own defenders' pace/positioning/stamina, keeper's sweeping attributes, midfield stamina, **opponent forwards' pace**, current line height | own attack, benches, drawings |
| `setpiece` | corner, free kick, set piece, throw in | only players inside either penalty area, aerial/strength/positioning only, drawings | the ~60% of players outside the boxes, all other attributes |
| `overview` | anything unmatched | line heights, depth, width, unit gaps, ball, drawing count | every individual detail |
| `offboard` | "what is a…", "what does X mean", named concepts | **nothing** | the entire board |

`offboard` matters more than it looks. "What is a false 9?" needs no board at all, and sending one invites the model to answer about the wrong thing.

Order of precedence when a question matches several patterns: `offboard → personnel → setpiece → sequence → feasibility → comparison → player → space → shape → overview`. Personnel outranks player because "should I sub Konaté?" is a squad question that merely names someone.

## Normalisation

Red attacks towards x=100 and blue towards x=0, so raw x means opposite things per team. Every height in the output is `up` — distance from that team's **own** goal — so "line height 16" reads the same for either side.

Zone occupancy is the exception: it uses absolute pitch areas labelled *red's defensive third / middle third / blue's defensive third*, because the two teams' defensive thirds are opposite ends of the pitch and counting them in one bucket would describe a pitch that does not exist.

## Reference points given to the model

Supplied so it interprets numbers consistently rather than inventing thresholds:

- line height under 25 = deep block; 25–38 = low-to-mid; 38–50 = mid block; over 50 = high line
- team depth under 25 units = compact
- a drawing endpoint within 8 units of a player is treated as belonging to him, otherwise it is "open space"

## Programmatic API — how the agent uses this

Besides `sample(question, board)` the module exports:

- `slice(intent, board, focus)` — render a named slice directly, no question text. `focus.player` accepts a name, `"#"+shirt`, or a player object; unknown names return a teaching message listing the roster instead of failing.
- `find(board, name, teamHint)` — resolve one player.
- `mentionedPlayers(board, question)` — every distinct player a question names (full name, surname, or first name of four letters or more).
- `matchedIntents(question)` — which intent patterns fired, used to detect multi-part questions.

The board's analyst builds an agentic pipeline on these. A deterministic router picks the route; the model picks the tools within the agent route:

| Route | When | What happens |
|---|---|---|
| `none` | off-board question | one model call, no tools, no board data |
| `slice` | exactly one intent matched, at most one player named | the sampled slice is injected and the model answers in a single call — no tools |
| `agent` | two or more intents, two or more players, or nothing matched | the model receives ten tools (each wrapping a slice, plus `measure` for distances and lane threats) and calls what it needs; capped at four tool rounds, six calls, then a forced final answer |

The router is deterministic rather than model-driven on purpose: it is testable, free, and wrong routing degrades gracefully — a slice-routed question that needed more simply gets a narrower answer, and an agent-routed simple question costs one extra round trip.

## Extending it

Add an intent by adding a regex to `RX`, a branch in `classify`, and a renderer to `SLICE`. A renderer receives `(board, focus)` and returns a string. If it throws, `sample` falls back to the overview slice rather than failing.

Two directions worth considering:

- **Model-routed classification.** Replace the regex classifier with a cheap model call returning an intent label. More robust to phrasing, at the cost of latency and a second request. The regex version is right until misclassification actually shows up in use.
- **Deltas.** Send a full slice on the first turn, then only what changed. Worth it for long sessions, unnecessary for the current cost profile.

## Files

- `sampler.js` — the implementation. Runs in a browser or under Node (`module.exports`).
- `sampler.test.js` — the test suite.
- `fixture.json` — a real board export used by the tests.

The same code is inlined into `index.html`, since the board ships as a single self-contained file. If you change the logic, change both.
