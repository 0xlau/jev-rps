import { MOVES } from './protocol.js';

export const STRATEGY_VERSION = 'behavior-v4';
export const COUNTER = Object.freeze({ rock: 'paper', paper: 'scissors', scissors: 'rock' });
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const ORDER = ['rock', 'paper', 'scissors'];
const uniform = () => Object.fromEntries(MOVES.map(m => [m, 1 / 3]));
const round = n => Math.round(n * 10000) / 10000;
const best = p => MOVES.reduce((a, b) => p[b] > p[a] ? b : a);
const rate = (n, d) => d ? round(n / d) : null;
const distribution = (values, prior = 0.6) => {
  const counts = Object.fromEntries(MOVES.map(m => [m, prior]));
  for (const m of values) counts[m]++;
  const total = values.length + prior * 3;
  return Object.fromEntries(MOVES.map(m => [m, counts[m] / total]));
};
const point = m => m ? Object.fromEntries(MOVES.map(x => [x, x === m ? 0.55 : 0.225])) : uniform();
const rotate = (m, shift) => ORDER[(ORDER.indexOf(m) + shift + 3) % 3];
const shift = (a, b) => (ORDER.indexOf(b) - ORDER.indexOf(a) + 3) % 3;
const rounded = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, round(v)]));
const roundedDistribution = p => {
  const result = rounded(p);
  const drift = round(1 - MOVES.reduce((sum, m) => sum + result[m], 0));
  const target = best(result);
  result[target] = round(result[target] + drift);
  return result;
};

// Completed blind transitions: what actually happened from one round to the next.
const transitionsOf = rows => rows.slice(1).map((r, i) => ({ prev: rows[i], next: r })).filter(x => !x.next.peeked);

// What the human actually does against the move Jev just played. Unlike a fixed
// assumption about the human, this is re-estimated from recent matching rounds,
// so it also catches a human who copies or waits on Jev's own last move.
const responseToLastJev = (rows, window) => {
  const last = rows.at(-1);
  if (!last) return uniform();
  return distribution(rows.slice(1).map((r, i) => ({ prev: rows[i], next: r }))
    .filter(x => !x.next.peeked && x.prev.jev === last.jev).slice(-window).map(x => x.next.human));
};

// Jev's own committed moves are public, so a repeating rule of Jev's is a
// liability: a human who learns it can beat the rule instead of the model.
// Estimate the modal next move for each previous Jev move, from completed
// transitions only, and return null when that previous move was never repeated.
const ruleFrom = transitions => previous => {
  if (!previous) return null;
  const counts = Object.fromEntries(MOVES.map(m => [m, 0]));
  for (const { prev, next } of transitions) if (prev.jev === previous) counts[next.jev]++;
  const ranked = MOVES.filter(m => counts[m] > 0).sort((a, b) => counts[b] - counts[a]);
  return ranked[0] ?? null;
};

// Every expert is scored BEFORE it sees the next completed human move. Replaying
// this process from signed history keeps learning deterministic and auditable.
export function predictions(rows) {
  const blind = rows.filter(r => !r.peeked);
  const last = rows.at(-1);
  const p = { frequency: distribution(blind.map(r => r.human)), recent8: distribution(blind.slice(-8).map(r => r.human)),
    recent20: distribution(blind.slice(-20).map(r => r.human)) };
  const matched = (length, byJev = false) => {
    if (rows.length < length) return [];
    const field = byJev ? 'jev' : 'human';
    const suffix = rows.slice(-length).map(r => r[field]).join(',');
    return rows.filter((r, i) => i >= length && !r.peeked
      && rows.slice(i - length, i).map(x => x[field]).join(',') === suffix).map(r => r.human);
  };
  const responseAfter = previousResult => {
    if (!last || last.result !== previousResult) return distribution([]);
    const relevant = rows.slice(0, -1).filter(r => rows[rows.indexOf(r) + 1]
      && !rows[rows.indexOf(r) + 1].peeked && r.result === previousResult).map(r => {
      const targetIndex = rows.indexOf(r) + 1;
      return rows[targetIndex].human;
    });
    return distribution(relevant);
  };
  p.transition1 = distribution(matched(1));
  p.transition2 = distribution(matched(2));
  p.response_to_jev = distribution(matched(1, true));
  p.response_after_human_win = responseAfter('human');
  p.response_after_jev_win = responseAfter('jev');
  p.response_after_draw = responseAfter('draw');
  // The human's live response to the move Jev just played, over the last 12 and
  // the last 4 matching rounds. Scored and weighted like every other expert.
  p.response_to_last_jev = responseToLastJev(rows, 12);
  p.recent_response_to_last_jev = responseToLastJev(rows, 4);
  const ownShifts = [], jevShifts = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].peeked || rows[i - 1].result !== last?.result) continue;
    ownShifts.push(rotate(last.human, shift(rows[i - 1].human, rows[i].human)));
    jevShifts.push(rotate(last.jev, shift(rows[i - 1].jev, rows[i].human)));
  }
  p.after_result = distribution(ownShifts);
  p.after_result_vs_jev = distribution(jevShifts);
  for (let lag = 1; lag <= 5; lag++) p['repeat_lag' + lag] = point(rows.at(-lag)?.human);
  p.rotate_up = point(last && COUNTER[last.human]);
  p.rotate_down = point(last && BEATS[last.human]);
  p.counter_last_jev = point(last && COUNTER[last.jev]);
  p.copy_last_jev = point(last?.jev);
  p.lose_to_last_jev = point(last && BEATS[last.jev]);
  // Model the next level of counter-play: the human may expect Jev to punish
  // their previous counter and play the move that beats that punishment.
  p.anti_counter_last_jev = point(last && COUNTER[BEATS[last.jev]]);
  p.anti_copy_last_jev = point(last && COUNTER[last.jev]);
  p.anti_lose_to_last_jev = point(last && last.jev);
  const lastJevShift = rows.length > 1 ? shift(rows.at(-2).jev, last.jev) : null;
  p.continue_jev_rotation = point(last && lastJevShift !== null && rotate(last.jev, lastJevShift));
  const lastHumanShift = rows.length > 1 ? shift(rows.at(-2).human, last.human) : null;
  p.continue_own_rotation = point(last && lastHumanShift !== null && rotate(last.human, lastHumanShift));
  p.win_stay_lose_up = point(last && (last.result === 'human' ? last.human : COUNTER[last.human]));
  p.win_stay_lose_down = point(last && (last.result === 'human' ? last.human : BEATS[last.human]));
  p.uniform = uniform();
  return p;
}

export function buildEvidence(context) {
  const rows = context.map(([number, human, jev, result, peeked]) => ({ number, human, jev, result, peeked }));
  const scores = Object.fromEntries(Object.keys(predictions([])).map(k => [k, { loss: 0, fastLoss: 0, hits: 0, recentHits: [], n: 0 }]));
  const prefix = [];
  for (const row of rows) {
    const before = predictions(prefix);
    if (!row.peeked) {
      for (const [name, p] of Object.entries(before)) {
        const s = scores[name];
        s.loss = s.loss * 0.94 - Math.log(Math.max(0.01, p[row.human]));
        s.fastLoss = s.fastLoss * 0.7 - Math.log(Math.max(0.01, p[row.human]));
        const max = Math.max(...Object.values(p));
        const ties = MOVES.filter(m => Math.abs(p[m] - max) < 1e-9);
        const hit = ties.includes(row.human) ? 1 / ties.length : 0;
        s.hits += hit; s.recentHits.push(hit); if (s.recentHits.length > 6) s.recentHits.shift();
        s.n++;
      }
    }
    prefix.push(row);
  }
  const next = predictions(rows);
  const minLoss = Math.min(...Object.values(scores).map(s => s.loss));
  const weights = Object.fromEntries(Object.entries(scores).map(([name, s]) => [name, Math.exp(-0.9 * (s.loss - minLoss))]));
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const ensemble = Object.fromEntries(MOVES.map(m => [m, Object.keys(next).reduce((sum, k) => sum + next[k][m] * weights[k] / totalWeight, 0)]));
  const minFast = Math.min(...Object.values(scores).map(s => s.fastLoss));
  const fastWeights = Object.fromEntries(Object.entries(scores).map(([name, s]) => [name, Math.exp(-1.2 * (s.fastLoss - minFast))]));
  const fastTotal = Object.values(fastWeights).reduce((a, b) => a + b, 0);
  const fastEnsemble = Object.fromEntries(MOVES.map(m => [m, Object.keys(next).reduce((sum, k) => sum + next[k][m] * fastWeights[k] / fastTotal, 0)]));
  const counterAfterWin = rows.at(-1)?.result === 'human' ? next.counter_last_jev : null;
  const experts = Object.entries(next).map(([name, p]) => ({ name, human_probabilities: roundedDistribution(p),
    weight: round(weights[name] / totalWeight), prior_prediction_accuracy: rate(scores[name].hits, scores[name].n),
    recent6_accuracy: rate(scores[name].recentHits.reduce((a, b) => a + b, 0), scores[name].recentHits.length),
    recent_weight: round(fastWeights[name] / fastTotal),
    evaluated_rounds: scores[name].n, discounted_log_loss: round(scores[name].loss) }))
    .sort((a, b) => b.weight - a.weight).slice(0, 5);
  const blind = rows.filter(r => !r.peeked);
  const changes = rows.slice(1).map((r, i) => ({ r, prev: rows[i] })).filter(x => !x.r.peeked && !x.prev.peeked);
  const counterRate = rate(changes.filter(x => x.r.human === COUNTER[x.prev.jev]).length, changes.length);
  const switchRate = rate(changes.filter(x => x.r.human !== x.prev.human).length, changes.length);
  const observedCunning = counterRate === null ? 0 : Math.max(0, (counterRate - 1 / 3) / (2 / 3));
  const tacticalSwitching = switchRate === null ? 0 : Math.max(0, (switchRate - 0.5) / 0.5);
  const after = result => {
    const pairs = changes.filter(x => x.prev.result === result);
    return { samples: pairs.length, switch_rate: rate(pairs.filter(x => x.r.human !== x.prev.human).length, pairs.length),
      moves: rounded(distribution(pairs.map(x => x.r.human))),
      counter_previous_jev_rate: rate(pairs.filter(x => x.r.human === COUNTER[x.prev.jev]).length, pairs.length) };
  };
  // Exploitation check. Jev's own moves are public, so once they fall into a
  // repeating rule the human can beat the rule instead of the model. Both
  // numbers are held forward: every judged round is compared against a rule
  // estimated only from transitions that happened before it.
  const transitions = transitionsOf(rows);
  let ruleHits = 0, ruleCounters = 0, judgedRounds = 0;
  for (const { prev, next: later } of transitions.slice(-6)) {
    const predicted = ruleFrom(transitions.filter(x => x.next.number < later.number))(prev.jev);
    if (!predicted) continue;
    judgedRounds++;
    if (later.jev === predicted) ruleHits++;
    if (later.human === COUNTER[predicted]) ruleCounters++;
  }
  const selfPredictability = rate(ruleHits, judgedRounds);
  const ruleExploitationRate = rate(ruleCounters, judgedRounds);
  const repeatingRule = rows.length ? ruleFrom(transitions)(rows.at(-1).jev) : null;
  const recentAfterWin = changes.filter(x => x.prev.result === 'human').slice(-12);
  const recentCounterAfterWinRate = rate(recentAfterWin.filter(x => x.r.human === COUNTER[x.prev.jev]).length, recentAfterWin.length);
  const exploitAlert = judgedRounds >= 5 && (selfPredictability ?? 0) >= .6 && (ruleExploitationRate ?? 0) >= .5;
  const old = distribution(blind.slice(-20, -8).map(r => r.human));
  const recent = distribution(blind.slice(-8).map(r => r.human));
  const drift = MOVES.reduce((s, m) => s + Math.abs(old[m] - recent[m]), 0) / 2;
  let losses = 0;
  for (const r of [...rows].reverse()) { if (r.result !== 'jev' || r.peeked) break; losses++; }
  return { blind_rounds: blind.length, peeked_rounds: rows.length - blind.length,
    all_time_human_frequencies: rounded(distribution(blind.map(r => r.human))),
    last8_human_frequencies: rounded(recent),
    human_switch_rate: rate(changes.filter(x => x.r.human !== x.prev.human).length, changes.length),
    counter_previous_jev_rate: counterRate,
    observed_cunning_index: round(Math.min(1, (0.75 * observedCunning + 0.25 * tacticalSwitching)
      * Math.min(1, changes.length / 12))),
    after_human_win: after('human'), after_human_loss: after('jev'), after_draw: after('draw'),
    consecutive_human_losses: losses, recent_distribution_shift: blind.length >= 16 ? round(drift) : null,
    evidence_reliability: round(Math.min(1, blind.length / 30)),
    jev_self_predictability: selfPredictability,
    human_exploitation_rate: ruleExploitationRate,
    recent_counter_after_win_rate: recentCounterAfterWinRate,
    recent_counter_after_win_samples: recentAfterWin.length,
    human_response_to_my_last_move: roundedDistribution(next.response_to_last_jev),
    recent_human_response_to_my_last_move: roundedDistribution(next.recent_response_to_last_jev),
    human_response_to_my_last_move_accuracy: rate(scores.response_to_last_jev.recentHits.reduce((a, b) => a + b, 0), scores.response_to_last_jev.recentHits.length),
    my_repeating_rule: repeatingRule ? { after: rows.at(-1).jev, repeats_with: repeatingRule } : null,
    exploit_alert: exploitAlert ? { judged_rounds: judgedRounds, jev_self_predictability: selfPredictability,
      human_exploitation_rate: ruleExploitationRate, my_next_move_if_rule_repeats: repeatingRule,
      human_exploit_move: repeatingRule ? COUNTER[repeatingRule] : null } : null,
    expert_validation: 'Rolling predictions scored before observing their targets; two timescales: forgetting 0.94 and 0.7. recent6_accuracy measures the last six held-forward forecasts. Peeked targets are never scored. These are not guaranteed future win rates.',
    strongest_experts: experts, human_forecast: roundedDistribution(ensemble),
    transition2_forecast: roundedDistribution(next.transition2),
    recent_human_forecast: roundedDistribution(fastEnsemble),
    counter_after_human_win_forecast: roundedDistribution(counterAfterWin || uniform()),
    recent_experts: Object.keys(next).map(name => ({ name,
      human_probabilities: roundedDistribution(next[name]), weight: round(fastWeights[name] / fastTotal),
      recent6_accuracy: rate(scores[name].recentHits.reduce((a, b) => a + b, 0), scores[name].recentHits.length) }))
      .sort((a, b) => b.weight - a.weight).slice(0, 3),
    counter_adaptation_lift: counterRate,
    suggested_counter: COUNTER[best(ensemble)],
    win_probability_by_jev_move: roundedDistribution(Object.fromEntries(MOVES.map(m => [m, ensemble[BEATS[m]]]))) };
}

function state(context, evidence) {
  return { game: 'Rock-paper-scissors. You are Jev. Human plays only AFTER your decision is committed.',
    objective: 'Maximize Jev wins divided by ALL rounds, including draws. Learn from completed history; do not aim for draws.',
    next_round: context.length + 1, history_columns: ['round', 'human_move', 'jev_move', 'winner', 'human_peeked_before_playing'],
    completed_rounds: context, current_human_move: 'UNKNOWN: unavailable until after commitment.', evidence };
}

const scoreQuestion = (question, criteria) => ({ type: 'score', instructions: question
  + ' Use only observed game behavior and `evidence`; this is NOT a claim about actual thoughts or mental health. Fewer than 8 blind rounds or insufficient relevant samples means level 0 (insufficient evidence). Peeking is not evidence of skill. Do not infer intensity merely from a loss streak.', criteria });

export function analysisRequest(context, evidence = buildEvidence(context)) {
  return { model: 'jev-latest', state: state(context, evidence), questions: {
    regularity: scoreQuestion('How reliably predictable is the HUMAN next move? Check the strongest experts, their evaluated rounds and prior prediction accuracy.',
      ['Unknown or no demonstrated predictability above chance', 'Weak tendency, little repeatable evidence', 'Moderate repeatable pattern, some deviations', 'Strong stable or result-conditioned pattern repeatedly predicted correctly', 'Very consistent pattern repeatedly predicted correctly across many rounds']),
    cunning: scoreQuestion('How much evidence of HUMAN counter-adaptation to Jev is present? Look for repeated responses to prior Jev moves and strategy changes; mere randomness or alternating moves does not prove cunning.',
      ['Unknown or no demonstrated counter-adaptation', 'Occasional counter to previous Jev move', 'Repeated response to Jev, but simple and exploitable', 'Repeated switching of tactics that disrupts previously successful Jev forecasts', 'Strong sustained counter-adaptation across several observed tactic changes']),
    tilt: scoreQuestion('Rate HUMAN loss-triggered behavioral instability (game label: tilt). Compare after_human_loss with after_human_win and after_draw; require at least 4 loss transitions. Emotional state itself is unobservable.',
      ['Unknown or no reliable loss-related change', 'Small change after losses', 'Repeated loss-linked switching or repetition unlike normal play', 'Large consistent loss-linked behavior change', 'Extreme repeated loss-linked shift with substantial evidence, not simply many losses']),
    adaptation: scoreQuestion('How strongly should older behavior be discounted because HUMAN behavior recently changed? Compare recent_experts, recent6_accuracy, recent_human_forecast and recent_distribution_shift. An old predictor with high lifetime accuracy but low recent6_accuracy is failing now. Several recent correct response-to-Jev predictions can expose a new tactic. Do not assume every human is adaptive.',
      ['Unknown or stable behavior', 'Small recent deviation', 'Moderate recent change with some supporting observations', 'Clear recent strategy change with multiple supporting rounds', 'Persistent recent regime change invalidating old habits']),
    human_prediction: { type: 'choice', instructions: 'Predict the HUMAN next move, not your action. Prefer the statistically strongest validated forecast. If strong old experts have low recent6_accuracy and recent_experts repeatedly succeed, prefer the recent_human_forecast. Use recent result-conditioned evidence when supported. Do not invent psychological stories or assume the human changes a successful pattern without evidence.',
      criteria: Object.fromEntries(MOVES.map(m => [m, `The human will choose ${m}.`])) },
  } };
}

export function readAnalysis(result, evidence) {
  const behavior = {};
  for (const name of ['regularity', 'cunning', 'tilt', 'adaptation']) {
    const a = result?.answers?.[name];
    if (a?.type !== 'score' || !Number.isFinite(a.score) || a.score < 0 || a.score > 4
      || !Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1) throw new Error('Invalid behavior score');
    const enough = evidence.blind_rounds >= 8 && (name !== 'tilt' || evidence.after_human_loss.samples >= 4);
    behavior[name] = { value: enough ? Math.round(a.score * 25) : null, model_concentration: round(a.confidence),
      evidence_reliability: enough ? evidence.evidence_reliability : 0 };
  }
  const a = result?.answers?.human_prediction;
  if (a?.type !== 'choice' || !MOVES.includes(a.choice) || !MOVES.every(m => Number.isFinite(a.probabilities?.[m]) && a.probabilities[m] >= 0 && a.probabilities[m] <= 1)
      || Math.abs(MOVES.reduce((s, m) => s + a.probabilities[m], 0) - 1) > 0.02) throw new Error('Invalid human forecast');
  return { behavior, human_prediction: a.choice, human_probabilities: a.probabilities,
    note: 'Scores 0-100 estimate behavior only; null means insufficient evidence. Model concentration is not correctness. Human choice probabilities are model beliefs, not validated frequencies.' };
}

export function moveRequest(context, evidence, analysis) {
  const adaptation = (analysis.behavior?.adaptation?.value ?? 0) / 100;
  const cunning = (analysis.behavior?.cunning?.value ?? 0) / 100;
  const regularity = (analysis.behavior?.regularity?.value ?? 0) / 100;
  const modelPrediction = analysis.human_probabilities || uniform();
  // Concentration is excess mass over a uniform guess. Summing a distribution
  // that already sums to one always returned 1 and silently zeroed the gate.
  const modelConcentration = MOVES.reduce((sum, m) => sum + Math.max(0, (modelPrediction[m] || 0) - 1 / 3), 0) / (2 / 3);
  // Keep the first-stage model as a small, confidence-gated signal. A sharp
  // prediction is useful only when it agrees with held-forward statistics;
  // otherwise it is evidence of overconfidence and must not drive the action.
  const modelWeight = regularity >= .65
    ? Math.max(0, Math.min(.10, .08 * modelConcentration * (1 + regularity)))
    : 0;
  // Actual first-stage judgment changes how strongly recent observations count,
  // while the final committed move remains Jev's second-stage choice verbatim.
  const recentWeight = evidence.blind_rounds >= 8 ? 0.15 + 0.7 * adaptation : 0.15;
  const adaptive = Object.fromEntries(MOVES.map(m => [m,
    (1 - recentWeight) * evidence.human_forecast[m] + recentWeight * evidence.recent_human_forecast[m]]));
  // A discrete tactic has to keep earning its share: it is scaled by how often
  // the same hypothesis actually held up in recent comparable rounds, so a
  // tactic that missed every time loses influence instead of dictating a throw.
  const counterReliability = evidence.recent_counter_after_win_samples ? evidence.recent_counter_after_win_rate : .5;
  const exploit = evidence.exploit_alert;
  const counterApplies = context.at(-1)?.[3] === 'human' && evidence.after_human_win.samples >= 1;
  const counterWeight = counterApplies
    ? Math.min(.75, .35 + .4 * cunning) * (.2 + .8 * counterReliability) * (exploit ? .25 : 1) : 0;
  // The tactic forecast is deliberately discrete: after a human win, counter
  // the move Jev just played; otherwise use the validated two-step transition.
  const tacticForecast = counterApplies ? evidence.counter_after_human_win_forecast : evidence.transition2_forecast;
  let tacticShare = counterWeight, modelShare = modelWeight;
  // The rolling ensemble is the floor: a discrete tactic and the first-stage
  // model may never take more than 85% of the throw between them. The human's
  // measured response to Jev's last move reaches the decision through that
  // ensemble (response_to_last_jev) instead of overriding it with a thin sample.
  const extra = tacticShare + modelShare;
  if (extra > .85) { const scale = .85 / extra; tacticShare *= scale; modelShare *= scale; }
  const ensembleShare = 1 - tacticShare - modelShare;
  const forecast = Object.fromEntries(MOVES.map(m => [m, ensembleShare * adaptive[m]
    + tacticShare * tacticForecast[m] + modelShare * modelPrediction[m]]));
  const decisionEvidence = { recent_weight: round(recentWeight), counter_weight: round(tacticShare),
    ensemble_weight: round(ensembleShare), model_weight: round(modelShare), model_concentration: round(modelConcentration),
    human_response_to_my_last_move: evidence.human_response_to_my_last_move,
    my_repeating_rule: exploit ? evidence.my_repeating_rule : null, exploit_alert: exploit,
    human_forecast: roundedDistribution(forecast), win_probability_by_jev_move: roundedDistribution(Object.fromEntries(MOVES.map(m => [m, forecast[BEATS[m]]]))) };
  return { model: 'jev-latest', state: { ...state(context, evidence), first_stage_jev_analysis: analysis, decision_evidence: decisionEvidence },
    questions: { move: { type: 'choice', instructions: [
      'Choose YOUR Jev move to WIN. You already evaluated the human in a separate request; its actual output is in first_stage_jev_analysis.',
      'Treat decision_evidence as the required action-selection evidence. Scores are behavioral hints only; do not override a validated forecast with a subjective story. The small model_weight is confidence-gated and must not overpower the rolling evidence.',
      'High regularity supports exploiting the pattern. Cunning only supports a counter-counter when actual history demonstrates it. Tilt supports a result-conditioned forecast only with sufficient loss transitions. Adaptation supports recent evidence, not arbitrary switching.',
      'Compare decision_evidence.win_probability_by_jev_move. It combines validated long/recent patterns with a counter-after-human-win forecast when cunning is demonstrated. Choose the move with strictly the highest value. Only when values are exactly tied may you choose among the tied moves; never mistake your own action for the predicted human action.',
      'Exploitation check: decision_evidence.exploit_alert means the human has been beating a repeating rule in YOUR OWN committed moves (my_repeating_rule). Do not repeat that rule. Judge the human from human_response_to_my_last_move, and if the highest win-probability move is exactly the move your repeating rule would play, take a different move when its win probability is within 0.05 of the best — a throw the human already predicts is worth less than its raw probability.',
      'If the human is predicted to play rock choose PAPER; if paper choose SCISSORS; if scissors choose ROCK. Draws do not count as wins. Commit now without access to the current human move.',
    ].join(' '), criteria: Object.fromEntries(MOVES.map(m => [m, `YOUR ${m} beats HUMAN ${BEATS[m]}. Choose it if the human is most likely to play ${BEATS[m]}.`])) } } };
}

export async function twoStageDecision(context, request) {
  const evidence = buildEvidence(context);
  const first = await request(analysisRequest(context, evidence));
  const analysis = readAnalysis(first, evidence);
  const second = await request(moveRequest(context, evidence, analysis));
  return { first, second, strategy: { version: STRATEGY_VERSION, analysis_model: first.model,
    ...analysis, evidence } };
}
