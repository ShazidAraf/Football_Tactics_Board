# ⚽ Football Tactics Board

An interactive football tactics board modelled on a physical magnetic whiteboard — with **multi-phase animated tactics**, football-aware drawing rules, and a built-in **AI analyst**. The whole application is a single self-contained HTML file with zero external dependencies.

**Live:** https://shazidaraf.github.io/Football_Tactics_Board/

---

## The board

- Drag-and-drop pitch with 22 player magnets and a draggable ball
- Preset squads (**Real Madrid**, **Barcelona**) with ratings across nine attributes, eight formations per team, substitutions from the bench
- Toggle **Number / Name / Face** display per magnet — photos supported
- The ball can be picked up and assigned to any player at any time, in any mode
- **Reset** returns to the default match-up (Real Madrid 4-3-3 v Barcelona 4-3-3) at kickoff positions

## Drawing tactics

Tools: **RUN · PASS · LOB · THROUGH · LOB THRU · DRIBBLE · SHOT · MARK · ZONE**, with a 12-colour ink dropdown (purple by default), freehand curve toggle, and per-team sequence badges.

The board enforces real football grammar:

| Rule | Meaning |
|---|---|
| Possession | Pass / lob / dribble / shot can only start from the player with the ball |
| Receivers | A pass or lob must end on a teammate (auto-snapped to the closest) |
| Through balls | **THROUGH / LOB THRU** play into space — the closest teammate is auto-assigned a run to receive |
| One ball action per phase | Receive-then-play is always two phases |
| Off-ball | Runs must start from a player; the ball carrier dribbles, he doesn't "run" |
| Marking | A mark must pair a player with an **opposite-team** player |
| Zones | Auto-numbered Z1, Z2… with their own id series |

Click any drawing to edit it directly — drag its ends or body, press **Delete** to remove. No separate edit/erase tools needed.

## Phases — tactics that unfold

A tactic isn't one frozen picture. Draw the first moment, press **NEXT PHASE**, and the move *executes*: players glide along their runs, the ball travels the pass chain, and you draw what happens next on the resulting picture.

- Movers appear as solid magnets at their new positions (matching your Number/Name/Face settings); their originals hide so the board reads as one picture
- The ball follows passes automatically, settling at the receiver's feet
- Step back and forth, or press **play** to animate the whole move
- Earlier phases linger faintly as a trail

## Play-by-play

Every player action is narrated under the board, split by team side:

> *1. Yamal (10) passes to Raphinha (11).*
> *2. Raphinha (11) runs onto it.*

Click a sentence to highlight its arrow on the board (jumping to the right phase); click an arrow to highlight its sentence.

## Scenarios

Fifteen built-in match situations — low block, high press, **suffocating press**, gegenpress, positional attack (3-2-5), offside trap, long goal-kick battle, corners and more — plus your own saved scenarios. Everything exports/imports as JSON, phases included.

## The ANALYST

An in-app AI analyst (Claude, bring your own API key) that answers tactical questions **and draws on the board**:

- A three-path deterministic router decides how much board context the model needs — none, a sampled slice, or full agentic tool access — before the model is ever called
- The **Sampler** skill extracts only the relevant slice of the board per question instead of dumping raw JSON
- Fourteen tools, including four render tools: phased purple coaching arrows with per-team letter badges, zone highlights (Z-ids), locally-computed heatmaps, radar/bar charts
- The analyst knows each team's **direction of play**, is barred from drawing own-goal shots, and obeys the same one-ball-action-per-phase rule you do
- Suggestions land on an overlay with **Keep / Dismiss** — Keep converts them into your own editable drawings, phases intact
- All rendering degrades gracefully offline

## Architecture notes

- **Single file.** Everything — styles, logic, the inlined Sampler skill — ships in `index.html`
- **Context efficiency over completeness.** The model receives computed facts and sampled slices, never the full board dump
- **Deterministic routing before LLM autonomy.** Rules decide the autonomy level; agentic tool-calling is reserved for genuinely complex questions
- Tested with jsdom test suites (~300+ assertions)

## License

**All rights reserved.** This project may not be shared, re-uploaded, re-hosted, or reused. Only can be used with the author's hosting.
See [LICENSE](LICENSE).

---

*Built by Md Shazid Islam as a study tool for learning football tactics.*
