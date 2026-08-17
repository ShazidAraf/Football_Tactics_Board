const S = require('./sampler.js');
const board = JSON.parse(require('fs').readFileSync(__dirname + '/fixture.json','utf8'));
let fails = 0;
const ok = (n,c) => { console.log((c?'PASS  ':'FAIL  ')+n); if(!c) fails++; };
const sample = q => S.sample(q, board);

// ── classification ────────────────────────────────────────────────
const cases = [
  ['Is Mbappé too isolated up front?',        'player'],
  ['how is #10 doing',                        'player'],
  ['What are the weaknesses of this shape?',  'shape'],
  ['are we compact enough',                   'shape'],
  ['Where is the space?',                     'space'],
  ['can we overload the left',                'space'],
  ['Will this move work?',                    'sequence'],
  ['explain the arrows I drew',               'sequence'],
  ['Who should I bring on for Konaté?',       'personnel'],
  ['is the bench any good',                   'personnel'],
  ['Who is stronger in midfield?',            'comparison'],
  ['Can red play a high line?',               'feasibility'],
  ['should blue press higher',                'feasibility'],
  ['Is our corner setup any good?',           'setpiece'],
  ['Summarise this position',                 'overview'],
  ['What is a false 9?',                      'offboard'],
  ['what does gegenpressing mean',            'offboard'],
];
for (const [q, want] of cases) ok(`"${q}" → ${want}`, sample(q).intent === want);

// ── entity resolution ─────────────────────────────────────────────
ok('resolves an accented surname', sample('is Konaté quick enough').focus.player === 'Konaté');
ok('resolves a two-word name by surname', sample('what about Joan García').focus.player.includes('García'));
ok('resolves team by colour', sample('can red play a high line').focus.team === 'red');
ok('resolves team by club name', sample('should Barcelona press higher').focus.team === 'blue');
ok('resolves a unit', sample('who is stronger in midfield').focus.unit === 'midfield');
ok('resolves defence as a unit', sample('compare the back four').focus.unit === 'defence');
ok('no false player match on plain numbers', sample('is the 4-3-3 too narrow').focus.player === null);
ok('shirt number needs a hash', sample('summarise this position').focus.player === null);

// ── slices contain what they should, and not what they shouldn't ──
const pl = sample('is Mbappé too isolated?');
ok('player slice names the focus', pl.text.includes('Mbappé'));
ok('player slice gives his ratings', /96\/78/.test(pl.text));
ok('player slice lists nearest opponents with distance', /units away/.test(pl.text));
ok('player slice drops the rest of the squad', !pl.text.includes('Courtois'));
ok('player slice drops the bench', !pl.text.includes('Endrick'));

const sh = sample('what is wrong with this shape?');
ok('shape slice computes line height', /line height \d+/i.test(sh.text));
ok('shape slice reports unit gaps', /Gap defence→midfield/.test(sh.text));
ok('shape slice omits ratings', !/\d+\/\d+\/\d+\/\d+/.test(sh.text));

const sp = sample('where is the space?');
ok('space slice builds an occupancy grid', /defensive third, centre/.test(sp.text));
ok('space slice flags an overload', /RED \+|BLUE \+|EMPTY|even/.test(sp.text));
ok('space zones are absolute, not per-team', sp.text.includes("red's defensive third") && sp.text.includes("blue's defensive third"));
ok('space slice omits ratings', !/\d+\/\d+\/\d+\/\d+/.test(sp.text));

const sq = sample('will this move work?');
ok('sequence slice lists drawings in order', /1\. /.test(sq.text));
ok('sequence resolves endpoints to people or open space', /→/.test(sq.text));
ok('sequence names drawing types in words', /ground pass|run off the ball/.test(sq.text));

const pe = sample('who should come off the bench?');
ok('personnel slice includes the bench', /bench/i.test(pe.text));
ok('personnel slice carries full ratings', /OVR \d+ — \d+\/\d+/.test(pe.text));
ok('personnel slice omits coordinates', !/x=\d+ y=\d+/.test(pe.text));

const fe = sample('can red play a high line?');
ok('feasibility gives own defenders pace', /pace \d+/.test(fe.text));
ok('feasibility includes opposition forwards', /Opposition forwards/.test(fe.text));
ok('feasibility states current line height', /line height \d+/.test(fe.text));

const st = sample('is our corner routine good?');
ok('setpiece limits to the boxes', /penalty area/.test(st.text));
ok('setpiece uses aerial and strength', /aerial \d+/.test(st.text));

ok('offboard sends no board data', sample('what is a false 9?').text.length < 80);

// ── normalisation ─────────────────────────────────────────────────
const m = S.metrics;
ok('line height is measured from each own goal',
   m.lineHeight(board,'red') > 0 && m.lineHeight(board,'blue') > 0);
ok('both teams read alike in a mirrored setup',
   Math.abs(m.lineHeight(board,'red') - m.lineHeight(board,'blue')) < 6);
ok('units split into three groups',
   m.units(board,'red').defence.length && m.units(board,'red').midfield.length && m.units(board,'red').attack.length);
ok('occupancy counts all 22 players',
   Object.values(m.occupancy(board)).reduce((s,v)=>s+v.red+v.blue,0) === 22);

// ── budget ────────────────────────────────────────────────────────
const full = Math.ceil(JSON.stringify(board).length/4);
const sizes = cases.map(([q]) => sample(q).tokens);
ok('every slice is far smaller than the full board', Math.max(...sizes) < full/3);
ok('offboard is nearly free', sample('what is a false 9?').tokens < 30);
console.log(`\nfull board ~${full} tokens · sampled ${Math.min(...sizes)}–${Math.max(...sizes)} tokens`);

// ── robustness ────────────────────────────────────────────────────
ok('empty question does not throw', !!sample('').text);
ok('gibberish falls back to overview', sample('asdf qwer zxcv').intent === 'overview');
const stripped = JSON.parse(JSON.stringify(board));
delete stripped.drawings; delete stripped.bench;
ok('missing sections do not throw', !!S.sample('will this move work?', stripped).text);
ok('empty board does not throw', !!S.sample('where is the space?', {teams:{}}).text);


// ── programmatic API for the agent ────────────────────────────────
ok('slice() renders by explicit intent', /FOCUS: RED #10 Mbapp/.test(S.slice('player', board, {player:'Mbappé'}).text));
ok('slice() resolves "#10" with a team hint', /Lamine Yamal/.test(S.slice('player', board, {player:'#10', team:'blue'}).text));
ok('slice() teaches on a bad name', /No player called "Ronaldo"/.test(S.slice('player', board, {player:'Ronaldo'}).text));
ok('mentionedPlayers finds two names', S.mentionedPlayers(board,'compare Mbappé and Yamal').length === 2);
ok('mentionedPlayers matches first names', S.mentionedPlayers(board,'is Vinícius wide enough').some(p=>p.name.includes('Vin')));
ok('mentionedPlayers is empty on plain text', S.mentionedPlayers(board,'where is the space').length === 0);
ok('matchedIntents reports multiple hits', S.matchedIntents('can red press high and where is the space').length === 2);
ok('find() locates by surname', S.find(board,'Konaté').name === 'Konaté');

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL TESTS PASSED');
process.exit(fails ? 1 : 0);
