# Football Tactics Board

An interactive coach's whiteboard that runs entirely in the browser. Drag players, draw the standard coaching notation, rate individuals, make substitutions, and load real match scenarios — then export the whole thing as JSON.

One HTML file. No build step, no server, no dependencies, no tracking. Open it and it works, online or off.

**[Live demo](https://shazidaraf.github.io/Football_Tactics_Board/)**

---

## Quick start

Download `index.html` and double-click it. That's the whole installation.

The board opens as **Real Madrid vs Barcelona**, both in 4-3-3, with real squads, shirt numbers and ratings already loaded.

---

## Features

### Players and squads

- **Two full squads built in** — Real Madrid (26 players) and Barcelona (21), with names, shirt numbers, positions and per-attribute ratings
- **Eight formations** per team: 4-4-2, 4-3-3, 4-2-3-1, 4-4-2 diamond, 4-1-4-1, 3-5-2, 3-4-3, 5-3-2
- **Drag anywhere** — or Tab to a player and nudge with arrow keys (Shift for fine adjustment)
- **Save your own shapes**: move players, then hit **Save shape** to add the arrangement to both teams' formation lists
- **Show** toggles what appears on each magnet: number, name, face — any combination

### Player ratings

Click any player to open the ratings panel. Nine attributes, each 0–100, set with a slider or by typing a number:

| Attribute | Why it matters tactically |
|---|---|
| **Pace** | Your defenders' recovery speed sets how high the line can sit |
| **Stamina** | Decides whether you can press for 90 minutes or only 25 |
| **Composure** | Whether you can play out from the back under pressure |
| **Positioning** | Off-ball intelligence — keeps the block compact and the line straight |
| **Strength** | Holding the ball up, winning duels, resisting the press |
| **Aerial ability** | The direct route, defending crosses, set pieces |
| **Passing range** | Line-breaking passes and switches of play, not just accuracy |
| **Dribbling** | Beating a man when there's no space to pass into |
| **Finishing** | Converts what the structure creates |

An **OVERALL** figure updates live as their average. Copy and paste ratings between players, add a face photo, and step through the XI with the arrow buttons.

### Substitutions

The panel lists the full bench with each sub's number, natural position and rating. Click one to bring them on — the player coming off takes the bench seat, so you can reverse it.

The slot keeps its **tactical** position while the bench remembers the player's **natural** one. Bring a defensive midfielder into a CM slot and he plays CM, exactly as a real substitution works.

### The ball

The ball is a separate object, because possession is a relationship rather than a property. Drag it near a player and it attaches to his feet; drop it in space and it stays loose — which is what lets you show a pass in flight, a loose ball, or the space you want someone to run into.

The carrier gets a white collar. Move him and the ball travels with him.

### Drawing — the standard notation

| Tool | Renders as | Means |
|---|---|---|
| **RUN** | solid arrow | movement without the ball |
| **PASS** | dashed arrow | pass along the ground |
| **LOB** | arced dash-dot arrow | lofted or long pass through the air |
| **DRIBBLE** | wavy arrow | carrying the ball |
| **SHOT** | double-rail arrow | strike at goal |
| **HOLD** | arrow with an end bar | move here and hold the position |
| **MARK** | dotted line, no head | marking assignment or passing lane |
| **ZONE** | shaded box | space to attack, press or protect |
| **LINE** | barred line | defensive height or offside line |

Supporting controls:

- **Curve** (tick) — off, lines snap straight between start and end; on, they follow your hand for overlaps and bending runs. A lob always arcs, since the bow *is* the notation.
- **Sequence** (tick) — auto-numbers each movement 1, 2, 3… so a move reads in order. Zones and lines are excluded, being structure rather than steps.
- **Four inks** — convention is one colour for the attacking team's movements, another for the defending team's.
- **EDIT** — click a drawing to select it, then drag an end to extend, shorten or re-aim it, or drag the body to move it. Stretching a curve keeps its shape. Zones resize from any corner.
- **ERASE**, **UNDO** (Ctrl+Z), **CLEAR**, and **Delete** for the selected shape.

### Scenarios

Ten built-in match situations. Each one asks which team should show it — pick **RED** or **BLUE**:

| Out of possession | In possession | Set pieces |
|---|---|---|
| Low block | Build-up from the back | Defending a corner |
| Mid block | Counter-attack | Attacking a corner |
| High press | Wide overload | |
| Park the bus | Ultra attack | |

Scenarios that involve the ball hand it to the right player — build-up gives it to the keeper, the corner routine to the taker. Loading one onto a team with a squad keeps the players; only their positions change.

**Add scenario** saves whatever is currently on the board under your own name, capturing either team's shape. Your scenarios sit in the same list and travel with your exports.

### AI rendering

Ask the analyst and the answer can arrive as more than text:

- **Drawings on the board** — coaching plans render on a gold-glow *suggestion overlay*: marks, runs, passes with numbered sequence badges and short notes. Your own drawings are never touched; a new question replaces the old suggestion; **Keep** converts it into ordinary editable shapes; ✕ dismisses it.
- **Zone highlights** — "Where is the space?" shades the open (or least crowded) region, possibly non-rectangular, straight from the occupancy grid. This one is fully deterministic — it works with no model connected.
- **Heatmaps** — a second pitch appears below the board. *Pitch control* colours every area by the probability red or blue controls it; *race maps* show where a named player reaches the ball before the nearest opponent. Both are computed locally from positions and pace ratings — the model only chooses the lens — and both carry an honest caption: illustrative physics, not tracking data. The ↻ button recomputes after you move players.
- **Charts** — radar comparisons of up to three players across all nine attributes, or bar charts of team averages by unit, drawn from the board's actual ratings.

Heatmaps, space highlights and radars also render **offline**: without an API key the panel answers from the board and still draws what it can.

---

## Keyboard

| Key | Action |
|---|---|
| `Tab` | Move focus between players |
| `Arrow keys` | Nudge the focused player or ball |
| `Shift` + arrows | Fine adjustment |
| `Ctrl/Cmd + Z` | Undo the last drawing |
| `Delete` | Remove the selected drawing (in EDIT mode) |
| `Esc` | Step back: deselect → leave the drawing tool → close panels |

---

## Export format

**Export JSON** downloads the complete board state; **Import** restores it. Everything is in there — positions, ratings, faces, benches, drawings, the ball, and your saved shapes and scenarios.

Coordinates use a pitch-relative grid so a saved board means the same thing at any screen size:

- `x`: 0 = left goal line, 100 = right goal line
- `y`: 0 = top touchline, 100 = bottom touchline

```json
{
  "app": "football-tactics-board",
  "exportedAt": "2026-08-17T10:00:00.000Z",
  "coordinates": { "space": "pitch-percent", "x": "...", "y": "..." },
  "ratingScale": { "min": 0, "max": 100, "attributes": ["pace", "stamina", "..."] },
  "notation": { "run": "solid arrow — movement without the ball", "...": "..." },
  "teams": {
    "red": {
      "formation": "4-3-3",
      "squad": "Real Madrid",
      "attacking": "right",
      "players": [
        {
          "id": "red-10",
          "number": 10,
          "name": "Mbappé",
          "role": "ST",
          "position": "ST",
          "face": null,
          "x": 47,
          "y": 50,
          "onPitch": true,
          "overall": 85,
          "ratings": { "pace": 96, "finishing": 96, "...": 0 }
        }
      ]
    },
    "blue": { "...": "..." }
  },
  "bench": { "red": [{ "n": 9, "pos": "ST", "name": "Endrick", "ratings": {} }], "blue": [] },
  "ball": { "x": 47, "y": 52.4, "owner": "red-10", "inPossession": true },
  "drawings": [
    {
      "id": "s1",
      "type": "pass",
      "sequence": 1,
      "ink": "#16181b",
      "points": [{ "x": 30, "y": 20 }, { "x": 55, "y": 45 }]
    }
  ],
  "customFormations": {},
  "customScenarios": {}
}
```

`role` is the player's slot on the board; `position` is his natural one. Drawing `sequence` is `null` for zones and lines. Faces are stored as small data URLs, or `null`.

Because the format is plain JSON with documented coordinates, exports are easy to feed into your own analysis.

---

## Publishing it

The file is fully self-contained, so any static host works.

**GitHub Pages** — create a public repo, upload `index.html`, then Settings → Pages → Deploy from a branch → `main` / root. Your link appears within a minute or two at `https://USERNAME.github.io/REPO/`.

**Netlify Drop** — drag a folder containing `index.html` onto [app.netlify.com/drop](https://app.netlify.com/drop). No account needed.

**Just send the file** — it runs from disk. Zip it first, since some mail clients block `.html` attachments.

---

## Notes and limitations

- **Ratings are judgement calls**, not data. They reflect a view of 2026/27 pre-season form and are meant to be overwritten with your own.
- **Faces are not included.** Player photos are owned by picture agencies, so the board generates initials monograms instead and lets you attach your own images.
- **Squad numbers** follow each club's published list where one exists. A few Barcelona numbers were unassigned at the time of writing and are placeholders you can edit.
- **State lives in the session.** There's no database — export before closing if you want to keep a board, and import to pick it back up.

---

## Under the hood

Vanilla HTML, CSS and JavaScript in a single file — no framework, no bundler. The pitch and all drawings are SVG; players are DOM elements positioned in percentages, so the whole board scales cleanly from phone to desktop.

Covered by 10 test suites (~300 assertions) run against jsdom, spanning formations, ratings, substitutions, ball possession, every notation type, shape editing, scenarios, and the export/import round trip.

## Licence

MIT — do what you like with it.
