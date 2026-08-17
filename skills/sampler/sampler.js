/* ============================================================================
   SAMPLER — question-driven context extraction for the tactics board
   ----------------------------------------------------------------------------
   Takes a board export (JSON) and a user question, returns only the slice of
   the board that question actually needs, rendered as compact text.

   Two rules drive the whole design:
     1. COMPUTE, DON'T DUMP.  Models are poor at geometry over raw coordinates.
        Line height, compactness and zone occupancy are calculated here and
        handed over as facts.
     2. RESOLVE REFERENCES.  A drawing endpoint at (55,45) is meaningless. It is
        resolved to the nearest player, so the model reads "pass to Yamal".

   Usage:  const {text, intent, focus, tokens} = Sampler.sample(question, board);
   ========================================================================== */
(function (root) {
  "use strict";

  const ATTR_ORDER = ["pace","stamina","composure","positioning","strength",
                      "aerial","passing","dribbling","finishing"];

  /* ── small helpers ─────────────────────────────────────────────────────── */
  const r0 = v => Math.round(v);
  const estTokens = s => Math.ceil(s.length / 4);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const deburr = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const ovr = p => {
    const r = p.ratings || {};
    const vals = ATTR_ORDER.map(k => +r[k] || 0);
    return Math.round(vals.reduce((a, b) => a + b, 0) / ATTR_ORDER.length);
  };

  /* Everything is normalised to "attacking distance": how far up the pitch a
     player is from his OWN goal, so red and blue can be reasoned about alike. */
  const up = (p, team) => team === "red" ? p.x : 100 - p.x;

  function allPlayers(board){
    const out = [];
    for (const team of ["red","blue"]){
      const t = board.teams?.[team];
      if (!t) continue;
      (t.players || []).forEach(p => out.push({...p, team, up: up(p, team)}));
    }
    return out;
  }

  /* ── computed metrics: the part worth paying for ───────────────────────── */

  function lineHeight(board, team){                 // deepest outfielder, from own goal
    const ps = (board.teams?.[team]?.players || []).slice(1);
    if (!ps.length) return null;
    return r0(Math.min(...ps.map(p => up(p, team))));
  }

  function highestMan(board, team){
    const ps = (board.teams?.[team]?.players || []).slice(1);
    if (!ps.length) return null;
    return r0(Math.max(...ps.map(p => up(p, team))));
  }

  function compactness(board, team){                 // vertical (depth) and horizontal (width)
    const ps = (board.teams?.[team]?.players || []).slice(1);
    if (!ps.length) return {depth:0, width:0};
    const ups = ps.map(p => up(p, team)), ys = ps.map(p => p.y);
    return {
      depth: r0(Math.max(...ups) - Math.min(...ups)),
      width: r0(Math.max(...ys) - Math.min(...ys))
    };
  }

  function describeHeight(h){
    return h == null ? "unknown"
         : h < 25 ? "a deep block"
         : h < 38 ? "a low-to-mid block"
         : h < 50 ? "a mid block"
         : "a high line";
  }

  /* Split the eleven into units by how far up the pitch they stand, rather than
     by their label — a "CM" pushed to x=80 is playing as a forward. */
  function units(board, team){
    const ps = (board.teams?.[team]?.players || []);
    const gk = ps[0];
    const out = [...ps.slice(1)].sort((a, b) => up(a, team) - up(b, team));
    const n = out.length;
    const cut1 = Math.round(n * 0.36), cut2 = Math.round(n * 0.73);
    return {
      keeper: gk || null,
      defence: out.slice(0, cut1),
      midfield: out.slice(cut1, cut2),
      attack: out.slice(cut2)
    };
  }

  function unitGaps(board, team){
    const u = units(board, team);
    const avg = arr => arr.length ? arr.reduce((s, p) => s + up(p, team), 0) / arr.length : null;
    const d = avg(u.defence), m = avg(u.midfield), a = avg(u.attack);
    return {
      defenceToMidfield: d != null && m != null ? r0(m - d) : null,
      midfieldToAttack:  m != null && a != null ? r0(a - m) : null
    };
  }

  /* Occupancy by third × channel — the answer to "where is the space".
     Zones are ABSOLUTE areas of the pitch (named from red's perspective), not
     per-team: red's defensive third and blue's are opposite ends, and counting
     them in the same bucket would describe a pitch that doesn't exist. */
  function occupancy(board){
    const grid = {};
    const thirds = ["red's defensive third","middle third","blue's defensive third"];
    const chans  = ["top","centre","bottom"];
    for (const t of thirds) for (const c of chans) grid[t + "|" + c] = {red:0, blue:0};

    for (const p of allPlayers(board)){
      const third = p.x < 33.4 ? thirds[0] : p.x < 66.7 ? thirds[1] : thirds[2];
      const chan  = p.y < 33.4 ? chans[0]  : p.y < 66.7 ? chans[1]  : chans[2];
      grid[third + "|" + chan][p.team]++;
    }
    return grid;
  }

  function nearest(board, target, opts = {}){
    const {team, exclude = [], count = 3} = opts;
    return allPlayers(board)
      .filter(p => (!team || p.team === team) && !exclude.includes(p.id) && p.id !== target.id)
      .map(p => ({...p, d: dist(p, target)}))
      .sort((a, b) => a.d - b.d)
      .slice(0, count);
  }

  const nameOf = p => p ? `${p.team === "red" ? "RED" : "BLUE"} #${p.number} ${p.name || p.role || "unnamed"}` : "nobody";

  /* ── entity resolution ─────────────────────────────────────────────────── */

  function nameKeys(p){
    const full = deburr(p.name || "");
    if (!full) return [];
    const parts = full.split(" ");
    return [...new Set([full, parts[parts.length - 1], parts[0]])].filter(k => k.length >= 4);
  }

  function findPlayer(board, q, teamHint){
    const nq = " " + deburr(q).replace(/[^a-z0-9# ]/g, " ") + " ";
    let best = null;
    for (const p of allPlayers(board)){
      if (!p.name) continue;
      for (const key of nameKeys(p)){
        if (nq.includes(" " + key + " ") || nq.includes(" " + key + "'")){
          if (!best || key.length > best.key.length) best = {p, key};
        }
      }
    }
    if (best) return best.p;
    const shirt = nq.match(/#(\d{1,2})\b/);            // "#10" — only with the hash, to avoid
    if (shirt){                                        // colliding with "4-3-3" or "3 nearest"
      let hits = allPlayers(board).filter(p => +p.number === +shirt[1]);
      if (teamHint) hits = hits.filter(p => p.team === teamHint) .length
                          ? hits.filter(p => p.team === teamHint) : hits;
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) return hits[0];              // both sides wear it; take the first and
    }                                                   // let the slice name who it picked
    return null;
  }

  function mentionedPlayers(board, q){
    const nq = " " + deburr(q).replace(/[^a-z0-9# ]/g, " ") + " ";
    const hits = new Map();
    for (const p of allPlayers(board)){
      if (!p.name) continue;
      if (nameKeys(p).some(k => nq.includes(" " + k + " ") || nq.includes(" " + k + "'")))
        hits.set(p.id, p);
    }
    return [...hits.values()];
  }

  function matchedIntents(q){
    const nq = deburr(q);
    return Object.keys(RX).filter(k => RX[k].test(nq));
  }

  function findTeam(board, q){
    const nq = deburr(q);
    if (/\bred\b/.test(nq)) return "red";
    if (/\bblue\b/.test(nq)) return "blue";
    for (const team of ["red","blue"]){
      const squad = deburr(board.teams?.[team]?.squad || "");
      if (squad && (nq.includes(squad) || nq.includes(squad.split(" ").pop()))) return team;
    }
    return null;
  }

  function findUnit(q){
    const nq = deburr(q);
    if (/\b(defence|defense|defenders|back ?(four|three|line)|centre ?backs?|backline)\b/.test(nq)) return "defence";
    if (/\b(midfield|midfielders|centre ?mids?|pivot)\b/.test(nq)) return "midfield";
    if (/\b(attack|forwards?|front ?(three|two)|strikers?|wingers?)\b/.test(nq)) return "attack";
    return null;
  }

  /* ── intent classification ─────────────────────────────────────────────── */

  const RX = {
    offboard:    /\b(what is|what's|whats|what does|define|explain the|meaning of|difference between)\b.*\b(false 9|gegenpress|tiki|inverted|libero|regista|offside rule|catenaccio|total football|xg|expected goals)\b|\bwhat is a\b|\bwhat does .* mean\b/,
    sequence:    /\b(sequence|this move|the move|move work|arrows?|drawings?|routine|combination|passage|pattern|the pass|these passes|what i drew|i drew)\b/,
    setpiece:    /\b(corner|free ?kick|set ?piece|throw ?in|dead ?ball)\b/,
    feasibility: /\b(high line|press|pressing|offside trap|squeeze up|push up|drop off|hold a line)\b|\bcan (we|they|red|blue|this team) (press|play|hold|sit|squeeze|push|defend|go)\b/,
    personnel:   /\b(sub|subs|substitut|bench|bring on|come on|take off|replace|selection|who should play|rotate)\b/,
    comparison:  /\b(stronger|better|compare|comparison|versus|vs\b|outnumber|overmatch|who wins|which team)\b/,
    space:       /\b(space|gap|gaps|free man|spare man|overload|exploit|where should|where can|gaps? between|open)\b/,
    shape:       /\b(shape|formation|structure|compact|weakness|vulnerab|block|balanced|too deep|too high|spacing)\b/
  };

  function classify(board, q){
    const nq = deburr(q);
    const team = findTeam(board, q);
    const player = findPlayer(board, q, team);
    const unit = findUnit(q);

    // Off-board questions get no board data at all.
    if (RX.offboard.test(nq) && !player && !unit) return {intent:"offboard", player, team, unit};

    // Order matters: a question can mention a player AND be about a substitution.
    if (RX.personnel.test(nq))   return {intent:"personnel",   player, team, unit};
    if (RX.setpiece.test(nq))    return {intent:"setpiece",    player, team, unit};
    if (RX.sequence.test(nq))    return {intent:"sequence",    player, team, unit};
    if (RX.feasibility.test(nq)) return {intent:"feasibility", player, team, unit};
    if (RX.comparison.test(nq))  return {intent:"comparison",  player, team, unit};
    if (player)                  return {intent:"player",      player, team, unit};
    if (RX.space.test(nq))       return {intent:"space",       player, team, unit};
    if (RX.shape.test(nq))       return {intent:"shape",       player, team, unit};
    return {intent:"overview", player, team, unit};
  }

  /* ── renderers ─────────────────────────────────────────────────────────── */

  const POS = p => `x=${r0(p.x)} y=${r0(p.y)}`;
  const RATINGS = p => ATTR_ORDER.map(k => (p.ratings || {})[k] ?? "?").join("/");
  const SOME = (p, keys) => keys.map(k => `${k} ${(p.ratings || {})[k] ?? "?"}`).join(", ");

  const HEADER = [
    "Pitch: x 0 (left goal line) to 100 (right goal line), y 0 (top touchline) to 100 (bottom).",
    "RED attacks towards x=100, BLUE towards x=0. Heights below are already measured from each team's OWN goal."
  ].join("\n");

  function teamTag(board, team){
    const t = board.teams?.[team] || {};
    return `${team.toUpperCase()} (${t.squad || "unnamed"}, ${t.formation || "?"})`;
  }

  function ballLine(board){
    const b = board.ball;
    if (!b) return "Ball: unknown.";
    if (!b.owner) return `Ball: loose at x=${r0(b.x)} y=${r0(b.y)}, nobody in possession.`;
    const p = allPlayers(board).find(x => x.id === b.owner);
    return `Ball: with ${nameOf(p)} at ${POS(p)}.`;
  }

  function drawingsResolved(board, filter){
    const list = (board.drawings || []).filter(filter || (() => true));
    if (!list.length) return null;
    const words = {run:"run off the ball", pass:"ground pass", lob:"lofted pass in the air",
                   dribble:"dribble with the ball", shot:"shot", hold:"move and hold",
                   link:"marking job / passing lane", zone:"shaded zone", line:"defensive line marker"};
    const who = pt => {
      const near = allPlayers(board).map(p => ({p, d: dist(p, pt)})).sort((a,b) => a.d - b.d)[0];
      return near && near.d < 8 ? nameOf(near.p) : `open space (${POS(pt)})`;
    };
    return list.map(s => {
      const a = s.points[0], b = s.points[s.points.length - 1];
      const tag = s.sequence ? `${s.sequence}. ` : "- ";
      if (s.type === "zone") return `${tag}${words.zone} covering x=${r0(a.x)}-${r0(b.x)}, y=${r0(a.y)}-${r0(b.y)}`;
      return `${tag}${words[s.type] || s.type}: ${who(a)} → ${who(b)}`;
    }).join("\n");
  }

  const SLICE = {

    /* nothing at all — the question is not about this board */
    offboard(){ return "(No board data needed for this question.)"; },

    /* one player, his immediate surroundings, and anything drawn on him */
    player(board, f){
      const p = f.player;
      const mates = nearest(board, p, {team:p.team, count:3});
      const opps  = nearest(board, p, {team:p.team === "red" ? "blue" : "red", count:3});
      const draws = drawingsResolved(board, s =>
        s.points.some(pt => dist(pt, p) < 8));
      const out = [
        HEADER, "",
        `FOCUS: ${nameOf(p)}, listed position ${p.role}${p.position && p.position !== p.role ? ` (natural ${p.position})` : ""}, at ${POS(p)}.`,
        `  ${teamTag(board, p.team)} — he stands ${r0(p.up)} units up the pitch from his own goal.`,
        `  Ratings (${ATTR_ORDER.join("/")}): ${RATINGS(p)} — overall ${ovr(p)}.`,
        "",
        "Nearest teammates:",
        ...mates.map(m => `  ${nameOf(m)} ${POS(m)} — ${r0(m.d)} units away`),
        "Nearest opponents:",
        ...opps.map(m => `  ${nameOf(m)} ${POS(m)} — ${r0(m.d)} units away, pace ${(m.ratings||{}).pace ?? "?"}`),
        "", ballLine(board)
      ];
      if (draws) out.push("", "Drawings involving him:", draws);
      return out.join("\n");
    },

    /* positions and structure only — no ratings, no bench */
    shape(board, f){
      const teams = f.team ? [f.team] : ["red","blue"];
      const out = [HEADER, ""];
      for (const team of teams){
        const u = units(board, team), g = unitGaps(board, team), c = compactness(board, team);
        const h = lineHeight(board, team);
        out.push(`${teamTag(board, team)}`);
        out.push(`  Line height ${h} from own goal — ${describeHeight(h)}. Highest man at ${highestMan(board, team)}.`);
        out.push(`  Team depth ${c.depth} units, width ${c.width} units.`);
        out.push(`  Gap defence→midfield ${g.defenceToMidfield}, midfield→attack ${g.midfieldToAttack}.`);
        for (const [label, arr] of [["Defence", u.defence], ["Midfield", u.midfield], ["Attack", u.attack]]){
          out.push(`  ${label}: ${arr.map(p => `${p.name || p.role} ${POS(p)}`).join("; ")}`);
        }
        out.push("");
      }
      out.push(ballLine(board));
      return out.join("\n");
    },

    /* the occupancy grid does the geometry the model would otherwise guess at */
    space(board){
      const grid = occupancy(board);
      const rows = Object.entries(grid).map(([k, v]) => {
        const [third, chan] = k.split("|");
        if (!v.red && !v.blue) return `  ${third}, ${chan}: EMPTY`;
        const edge = v.red === v.blue ? "even" :
                     v.red > v.blue ? `RED +${v.red - v.blue}` : `BLUE +${v.blue - v.red}`;
        return `  ${third}, ${chan} channel: red ${v.red}, blue ${v.blue} (${edge})`;
      });
      return [
        HEADER,
        "Zones below are fixed areas of the pitch: 'top' is y<33, 'bottom' is y>67.",
        "",
        `${teamTag(board,"red")} line height ${lineHeight(board,"red")} (${describeHeight(lineHeight(board,"red"))}), depth ${compactness(board,"red").depth}.`,
        `${teamTag(board,"blue")} line height ${lineHeight(board,"blue")} (${describeHeight(lineHeight(board,"blue"))}), depth ${compactness(board,"blue").depth}.`,
        "",
        "Players per zone:",
        ...rows,
        "",
        ballLine(board)
      ].join("\n");
    },

    /* drawings with both ends resolved to people */
    sequence(board){
      const d = drawingsResolved(board);
      if (!d) return [HEADER, "", "There are no drawings on the board.", ballLine(board)].join("\n");
      const involved = new Set();
      for (const s of (board.drawings || []))
        for (const pt of s.points){
          const n = allPlayers(board).map(p => ({p, d: dist(p, pt)})).sort((a,b) => a.d - b.d)[0];
          if (n && n.d < 8) involved.add(n.p.id);
        }
      const people = allPlayers(board).filter(p => involved.has(p.id));
      return [
        HEADER, "",
        "Move drawn on the board, in order:", d, "",
        "Players involved:",
        ...people.map(p => `  ${nameOf(p)} (${p.role}) ${POS(p)} — ${SOME(p, ["pace","passing","dribbling","finishing"])}`),
        "", ballLine(board)
      ].join("\n");
    },

    /* squad depth: ratings matter, positions do not */
    personnel(board, f){
      const team = f.team || (f.player ? f.player.team : "red");
      const t = board.teams?.[team] || {};
      const bench = (board.bench?.[team] || []);
      return [
        `${teamTag(board, team)} — selection question.`,
        `Ratings order: ${ATTR_ORDER.join("/")}.`,
        "",
        "On the pitch:",
        ...(t.players || []).map(p => `  #${p.number} ${p.name || p.role} (${p.role}) OVR ${ovr(p)} — ${RATINGS(p)}`),
        "",
        bench.length ? "On the bench:" : "The bench is empty.",
        ...bench.map(b => `  #${b.n} ${b.name || "unnamed"} (${b.pos || "?"}) OVR ${ovr(b)} — ${RATINGS(b)}`),
        f.player ? `\nThe question is about ${nameOf(f.player)}.` : ""
      ].join("\n");
    },

    /* both teams, narrowed to the unit in question */
    comparison(board, f){
      const out = [`Ratings order: ${ATTR_ORDER.join("/")}.`, ""];
      for (const team of ["red","blue"]){
        const u = units(board, team);
        const pick = f.unit ? u[f.unit] : [...u.defence, ...u.midfield, ...u.attack];
        out.push(`${teamTag(board, team)}${f.unit ? " — " + f.unit : ""}:`);
        out.push(...pick.map(p => `  #${p.number} ${p.name || p.role} (${p.role}) OVR ${ovr(p)} — ${RATINGS(p)}`));
        out.push("");
      }
      return out.join("\n");
    },

    /* can this defence do what is being asked of it? */
    feasibility(board, f){
      const team = f.team || "red";
      const other = team === "red" ? "blue" : "red";
      const u = units(board, team), ou = units(board, other);
      const h = lineHeight(board, team);
      return [
        HEADER, "",
        `${teamTag(board, team)} currently sits at line height ${h} from its own goal — ${describeHeight(h)}.`,
        `Team depth ${compactness(board, team).depth} units.`,
        "",
        "Their defenders (the constraint on how high the line can sit):",
        ...u.defence.map(p => `  #${p.number} ${p.name || p.role} ${POS(p)} — ${SOME(p, ["pace","positioning","stamina","composure"])}`),
        u.keeper ? `  Keeper ${u.keeper.name || "GK"} at ${POS(u.keeper)} — ${SOME(u.keeper, ["pace","positioning","composure"])}` : "  No keeper on the board.",
        "",
        "Their midfield (who must press and recover):",
        ...u.midfield.map(p => `  #${p.number} ${p.name || p.role} — ${SOME(p, ["pace","stamina","positioning"])}`),
        "",
        `Opposition forwards to be defended against (${teamTag(board, other)}):`,
        ...ou.attack.map(p => `  #${p.number} ${p.name || p.role} ${POS(p)} — ${SOME(p, ["pace","dribbling","finishing"])}`),
        "", ballLine(board)
      ].join("\n");
    },

    /* only what is inside the relevant penalty area */
    setpiece(board, f){
      const inBox = p => p.up < 22 || p.up > 78;
      const men = allPlayers(board).filter(inBox);
      const draws = drawingsResolved(board);
      return [
        HEADER, "",
        "Players in or around either penalty area:",
        ...men.map(p => `  ${nameOf(p)} (${p.role}) ${POS(p)} — ${SOME(p, ["aerial","strength","positioning"])}`),
        "",
        `Everyone else is outside both boxes (${allPlayers(board).length - men.length} players).`,
        draws ? "\nDrawings on the board:\n" + draws : "",
        "", ballLine(board)
      ].join("\n");
    },

    /* the cheap default: structure without individuals */
    overview(board){
      const out = [HEADER, ""];
      for (const team of ["red","blue"]){
        if (!(board.teams?.[team]?.players || []).length){ out.push(`${team.toUpperCase()}: no players on the board.`); continue; }
        const h = lineHeight(board, team), c = compactness(board, team), g = unitGaps(board, team);
        out.push(`${teamTag(board, team)}: line height ${h} (${describeHeight(h)}), depth ${c.depth}, width ${c.width}, ` +
                 `unit gaps ${g.defenceToMidfield}/${g.midfieldToAttack}.`);
      }
      out.push("", ballLine(board));
      const n = (board.drawings || []).length;
      out.push(n ? `${n} drawing(s) on the board — ask about the move for detail.` : "No drawings on the board.");
      return out.join("\n");
    }
  };

  /* ── public API ────────────────────────────────────────────────────────── */

  function slice(intent, board, focus = {}){
    const f = {intent, player: null, team: focus.team || null, unit: focus.unit || null};
    if (focus.player){
      f.player = typeof focus.player === "string"
        ? findPlayer(board, " " + focus.player + " ", f.team)
        : focus.player;
      if (!f.player && typeof focus.player === "string")
        return {intent, text: `No player called "${focus.player}" on the board. Players: ` +
                allPlayers(board).map(p => `${p.team} ${p.name || "#" + p.number}`).join(", ") + ".",
                tokens: 60};
    }
    const render = SLICE[intent] || SLICE.overview;
    let text;
    try { text = render(board, f); }
    catch (err) {
      try { text = SLICE.overview(board, f); }
      catch (err2) { text = "(The board could not be read.)"; }
    }
    return {intent, text, tokens: estTokens(text)};
  }

  function sample(question, board){
    const f = classify(board, question || "");
    const render = SLICE[f.intent] || SLICE.overview;
    let text;
    try { text = render(board, f); }
    catch (err) {
      try { text = SLICE.overview(board, f); }             // fall back to the cheap slice
      catch (err2) { text = "(The board could not be read.)"; }
    }
    return {
      intent: f.intent,
      focus: {
        player: f.player ? (f.player.name || `#${f.player.number}`) : null,
        team: f.team,
        unit: f.unit
      },
      text,
      tokens: estTokens(text)
    };
  }

  const Sampler = {sample, classify, slice, estTokens,
                   find: (board, name, team) => findPlayer(board, " " + name + " ", team || null),
                   mentionedPlayers, matchedIntents,
                   metrics: {lineHeight, compactness, unitGaps, occupancy, units}};

  if (typeof module !== "undefined" && module.exports) module.exports = Sampler;
  else root.Sampler = Sampler;

})(typeof globalThis !== "undefined" ? globalThis : this);
