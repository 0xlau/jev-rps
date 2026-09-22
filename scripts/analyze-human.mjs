import fs from 'node:fs';
import { MOVES, outcome } from '../lib/protocol.js';
import { predictions, buildEvidence, COUNTER } from '../lib/strategy.js';

const source = process.argv[2] || '/Users/liupeiqiang/Downloads/jev-duel-2026-09-22.json';
const exported = JSON.parse(fs.readFileSync(source, 'utf8'));
const records = exported.game.history.map(item => item.record);
const rows = records.map(r => ({ number: r.number, human: r.player, jev: r.move, result: r.result, peeked: r.peeked }));
const argmax = p => MOVES.reduce((a, b) => p[b] > p[a] ? b : a);
const hit = (p, actual) => {
  const max = Math.max(...MOVES.map(m => p[m]));
  const ties = MOVES.filter(m => Math.abs(p[m] - max) < 1e-9);
  return ties.includes(actual) ? 1 / ties.length : 0;
};
const score = forecasts => {
  let hits = 0, logLoss = 0, brier = 0;
  forecasts.forEach(({ p, actual }) => {
    hits += hit(p, actual);
    logLoss -= Math.log(Math.max(.0001, p[actual]));
    brier += MOVES.reduce((sum, m) => sum + (p[m] - (m === actual ? 1 : 0)) ** 2, 0);
  });
  return { rounds: forecasts.length, hitRate: hits / forecasts.length, logLoss: logLoss / forecasts.length, brier: brier / forecasts.length };
};

const samples = new Map();
for (let i = 0; i < rows.length; i++) {
  const all = predictions(rows.slice(0, i));
  for (const [name, p] of Object.entries(all)) {
    if (!samples.has(name)) samples.set(name, []);
    samples.get(name).push({ p, actual: rows[i].human });
  }
  const model = records[i].strategy?.human_probabilities;
  if (model) {
    if (!samples.has('first_stage_jev')) samples.set('first_stage_jev', []);
    samples.get('first_stage_jev').push({ p: model, actual: rows[i].human });
  }
}

const metricRows = [...samples.entries()].map(([name, forecasts]) => ({ name, ...score(forecasts) }))
  .sort((a, b) => a.logLoss - b.logLoss);

const asContext = selected => selected.map(r => [r.number, r.human, r.jev, r.result, r.peeked]);
const ensembleForecasts = rows.map((r, i) => ({ p: buildEvidence(asContext(rows.slice(0, i))).human_forecast, actual: r.human }));
const recentEnsembleForecasts = rows.map((r, i) => ({ p: buildEvidence(asContext(rows.slice(0, i))).recent_human_forecast, actual: r.human }));
const mixtureForecasts = rows.map((r, i) => {
  const evidence = buildEvidence(asContext(rows.slice(0, i)));
  const adaptation = (records[i].strategy.behavior.adaptation.value ?? 0) / 100;
  const recentWeight = evidence.blind_rounds >= 8 ? 0.15 + 0.7 * adaptation : 0.15;
  return { actual: r.human, p: Object.fromEntries(MOVES.map(m => [m,
    (1 - recentWeight) * evidence.human_forecast[m] + recentWeight * evidence.recent_human_forecast[m]])) };
});
const actionFor = p => COUNTER[argmax(p)];
const replay = policy => rows.map((r, i) => {
  const p = policy(rows.slice(0, i), records[i]);
  const move = actionFor(p);
  return { round: i + 1, move, result: outcome(r.human, move), forecast: argmax(p), actual: r.human };
});
const resultSummary = replayed => ({
  rounds: replayed.length,
  wins: replayed.filter(r => r.result === 'jev').length,
  draws: replayed.filter(r => r.result === 'draw').length,
  losses: replayed.filter(r => r.result === 'human').length,
  winRate: replayed.filter(r => r.result === 'jev').length / replayed.length,
});
const counterAfterWin = prefix => {
  const last = prefix.at(-1);
  if (!last || last.result !== 'human') return predictions(prefix).uniform;
  return predictions(prefix).counter_last_jev;
};
const policies = {
  ensemble: prefix => buildEvidence(asContext(prefix)).human_forecast,
  recentEnsemble: prefix => buildEvidence(asContext(prefix)).recent_human_forecast,
  counterPreviousJev: prefix => predictions(prefix).counter_last_jev,
  transition2: prefix => predictions(prefix).transition2,
  winThenCounter: counterAfterWin,
  winThenCounterElseTransition2: prefix => prefix.at(-1)?.result === 'human'
    ? predictions(prefix).counter_last_jev : predictions(prefix).transition2,
  counterTransitionMix: prefix => {
    const a = predictions(prefix).counter_last_jev, b = predictions(prefix).transition2;
    return Object.fromEntries(MOVES.map(m => [m, .5 * a[m] + .5 * b[m]]));
  },
};

const transitions = rows.slice(1).map((r, i) => ({ prev: rows[i], r }));
const rate = (items, predicate) => items.length ? items.filter(predicate).length / items.length : null;
const segment = (from, to) => {
  const part = rows.slice(from, to);
  return {
    rounds: part.length,
    results: Object.fromEntries(['jev', 'draw', 'human'].map(result => [result, part.filter(r => r.result === result).length])),
    jevWinRate: part.filter(r => r.result === 'jev').length / part.length,
    modelHitRate: score(part.map((r, i) => ({ p: records[from + i].strategy.human_probabilities, actual: r.human }))).hitRate,
  };
};

const output = {
  source, rounds: rows.length,
  outcome: Object.fromEntries(['jev', 'draw', 'human'].map(result => [result, rows.filter(r => r.result === result).length])),
  humanMoves: Object.fromEntries(MOVES.map(m => [m, rows.filter(r => r.human === m).length])),
  behavior: {
    switchRate: rate(transitions, x => x.r.human !== x.prev.human),
    counterPreviousJevRate: rate(transitions, x => x.r.human === ({ rock: 'paper', paper: 'scissors', scissors: 'rock' })[x.prev.jev]),
    copyPreviousJevRate: rate(transitions, x => x.r.human === x.prev.jev),
    loseToPreviousJevRate: rate(transitions, x => x.r.human === ({ rock: 'scissors', paper: 'rock', scissors: 'paper' })[x.prev.jev]),
    switchAfterHumanLoss: rate(transitions.filter(x => x.prev.result === 'human'), x => x.r.human !== x.prev.human),
    switchAfterJevLoss: rate(transitions.filter(x => x.prev.result === 'jev'), x => x.r.human !== x.prev.human),
  },
  segments: [segment(0, 10), segment(10, 20), segment(20, 30), segment(30, 40)],
  forecasts: metricRows,
  ensembleComparisons: {
    longTermEnsemble: score(ensembleForecasts),
    recentEnsemble: score(recentEnsembleForecasts),
    currentProductionMixture: score(mixtureForecasts),
  },
  policyReplays: Object.fromEntries(Object.entries(policies).map(([name, policy]) => [name, resultSummary(replay(policy))])),
  ensemble_rounds: ensembleForecasts.map((x, i) => ({ round: i + 1, actual: x.actual, probability: x.p[x.actual], p: x.p })),
  rounds_detail: rows.map((r, i) => {
    const model = records[i].strategy.human_probabilities;
    return { round: r.number, human: r.human, jev: r.jev, result: r.result,
      predicted: argmax(model), predicted_probability: model[r.human],
      counter_previous_jev: i > 0 && r.human === ({ rock: 'paper', paper: 'scissors', scissors: 'rock' })[rows[i - 1].jev] };
  }),
};
console.log(JSON.stringify(output, null, 2));
