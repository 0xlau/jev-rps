import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import { createGameService, TYPESAFE_URL, sha256 } from '../lib/game.js';
import { MOVES, outcome, commitmentText, statsFor } from '../lib/protocol.js';
import { verifyProof, verifyReceipt } from '../lib/proof.js';
import { createHandler } from '../lib/handler.js';
import { analysisFixture } from './provider-fixture.mjs';
import { buildEvidence, moveRequest, COUNTER } from '../lib/strategy.js';

const secret = 'unit-test-only-secret-'.repeat(3);
const apiKey = 'unit-test-provider-key';
function fixture(options = {}) {
  const calls = [];
  const service = createGameService({ secret, fetchImpl: async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    if (options.throws) throw new Error('private upstream details');
    if (options.status) return new Response('private upstream details', { status: options.status });
    if (!JSON.parse(init.body).questions.move) return Response.json(options.analysis || analysisFixture());
    return Response.json(options.answer || { model: 'jev-1.13.0', answers: { move: { type: 'choice',
      choice: options.move || 'rock', probabilities: { scissors: .1, rock: .8, paper: .1 } } },
      usage: { input_tokens: 120, output_tokens: 25 } });
  } });
  const series = randomUUID();
  const prepare = history => service.prepare({ history: history || [], series, apiKey });
  return { service, calls, series, prepare };
}

test('all nine outcomes follow the rules', () => {
  const expected = [['draw', 'jev', 'human'], ['human', 'draw', 'jev'], ['jev', 'human', 'draw']];
  MOVES.forEach((a, i) => MOVES.forEach((b, j) => assert.equal(outcome(a, b), expected[i][j])));
  assert.throws(() => outcome('bad', 'rock'));
});

test('prepare calls the real API contract, hides the decision, and commits before human choice', async () => {
  const f = fixture();
  const ready = await f.prepare();
  assert.equal(f.calls[0].url, TYPESAFE_URL);
  assert.equal(f.calls[0].headers.Authorization, `Bearer ${apiKey}`);
  assert.equal(f.calls[0].body.model, 'jev-latest');
  assert.equal(f.calls[0].body.questions.regularity.type, 'score');
  assert.equal(f.calls[1].body.questions.move.type, 'choice');
  assert.deepEqual(Object.keys(f.calls[1].body.questions.move.criteria).sort(), [...MOVES].sort());
  assert.equal(f.calls[1].body.state.first_stage_jev_analysis.human_prediction, 'scissors');
  assert.deepEqual(f.calls[0].body.state.completed_rounds, []);
  assert.match(f.calls[0].body.state.current_human_move, /UNKNOWN/);
  for (const key of ['move', 'nonce', 'proof', 'probabilities', 'strategy']) assert.equal(ready[key], undefined);
  assert.equal(JSON.stringify(ready).includes(apiKey), false);
  assert.equal(Buffer.from(ready.sealedRound, 'base64url').toString().includes('preparedAt'), false);
  assert.equal(ready.commitment.length, 64);
  assert.equal(ready.contextCount, 0);
  const resolved = f.service.resolve({ sealedRound: ready.sealedRound, player: 'paper' });
  assert.equal(resolved.proof.move, 'rock');
  assert.equal(resolved.receipt.record.result, 'human');
  assert.equal(sha256(commitmentText(resolved.proof)), ready.commitment);
  await verifyReceipt(resolved, { ...ready, player: 'paper', peeked: false }, f.series, []);
  assert.equal(f.calls.length, 2, 'resolution must not call Jev again');
  assert.equal(resolved.receipt.record.usage.input, 260);
  assert.equal(resolved.receipt.record.usage.output, 75);
  assert.equal(resolved.receipt.record.usage.requests, 2);
  assert.equal(resolved.receipt.record.strategy.behavior.tilt.value, null);
  assert.equal(resolved.receipt.record.strategy.selfPredictability, null);
  assert.equal(resolved.receipt.record.strategy.exploitAlert, null);
});

test('reveal and resolve decrypt the same choice; peek label survives token upgrade', async () => {
  const f = fixture({ move: 'scissors' });
  const ready = await f.prepare();
  const reveal = f.service.reveal({ sealedRound: ready.sealedRound });
  await verifyProof(reveal.proof, ready, f.series);
  const resolved = f.service.resolve({ sealedRound: reveal.sealedRound, player: 'rock', peeked: false });
  assert.deepEqual(resolved.proof, reveal.proof);
  assert.equal(resolved.receipt.record.peeked, true);
  assert.equal(resolved.receipt.record.result, 'human');
  assert.equal(f.calls.length, 2);
});

test('client verifies against the saved commitment, not a replacement commitment from the response', async () => {
  const f = fixture();
  const ready = await f.prepare();
  const revealed = f.service.reveal({ sealedRound: ready.sealedRound });
  await assert.rejects(verifyProof({ ...revealed.proof, move: 'paper' }, ready, f.series), /does not match the opening commitment/);
  await assert.rejects(verifyProof({ ...revealed.proof, contextHash: 'f'.repeat(64) }, ready, f.series));
  await assert.rejects(verifyProof(revealed.proof, ready, randomUUID()));
  const resolved = f.service.resolve({ sealedRound: ready.sealedRound, player: 'rock' });
  resolved.receipt.record.result = 'human';
  await assert.rejects(verifyReceipt(resolved, { ...ready, player: 'rock', peeked: false }, f.series, []), /does not match this round/);
});

test('all completed rounds, including peeks and draws, enter the next context in order', async () => {
  const f = fixture();
  const history = [];
  for (const [player, peeked] of [['paper', false], ['rock', false], ['scissors', true]]) {
    const ready = await f.prepare(history);
    history.push(f.service.resolve({ sealedRound: ready.sealedRound, player, peeked }).receipt);
  }
  const next = await f.prepare(history);
  const expected = [[1, 'paper', 'rock', 'human', false], [2, 'rock', 'rock', 'draw', false], [3, 'scissors', 'rock', 'jev', true]];
  assert.deepEqual(f.calls.at(-1).body.state.completed_rounds, expected);
  assert.deepEqual(f.calls.at(-2).body.state.completed_rounds, expected);
  assert.equal(f.calls.at(-1).body.state.evidence.blind_rounds, 2);
  assert.equal(next.contextHash, sha256(JSON.stringify(expected)));
  assert.equal(next.contextCount, 3);
  assert.equal(next.number, 4);
  assert.equal(history[1].record.previous, sha256(history[0].signature));
  assert.equal(f.service.verifyHistory(history, f.series), sha256(history[2].signature));
  const edited = structuredClone(history); edited[0].record.player = 'scissors';
  await assert.rejects(f.prepare(edited), /failed verification/);
  await assert.rejects(f.prepare([history[0], history[2]]), /failed verification/);
  await assert.rejects(f.prepare([...history].reverse()), /failed verification/);
  await assert.rejects(f.service.prepare({ history, series: randomUUID(), apiKey }), /failed verification/);
});

test('mutated or foreign round tokens are rejected', async () => {
  const f = fixture();
  const { sealedRound } = await f.prepare();
  const edited = sealedRound.slice(0, 40) + (sealedRound[40] === 'A' ? 'B' : 'A') + sealedRound.slice(41);
  assert.throws(() => f.service.resolve({ sealedRound: edited, player: 'rock' }), /proof is invalid or expired/);
  assert.throws(() => f.service.reveal({ sealedRound: 'not-a-token' }), /proof is invalid or expired/);
  const other = createGameService({ secret: 'a-different-secret'.repeat(3) });
  assert.throws(() => other.reveal({ sealedRound }), /proof is invalid or expired/);
  assert.throws(() => f.service.resolve({ sealedRound, player: 'lizard' }), /Choose rock, paper, or scissors/);
});

test('provider errors never manufacture a decision or expose upstream details', async t => {
  for (const status of [401, 403, 402, 429, 529, 500]) {
    await t.test(String(status), async () => {
      const f = fixture({ status });
      await assert.rejects(f.prepare(), error => !error.message.includes('private') && !!error.code);
      assert.equal(f.calls.length, 1);
    });
  }
  await assert.rejects(fixture({ throws: true }).prepare(), error => error.code === 'PROVIDER_UNREACHABLE');
  await assert.rejects(fixture({ answer: { model: 'jev-1.13.0', answers: { move: { type: 'choice', choice: 'spock' } } } }).prepare(), /no valid rock, paper, or scissors/);
});

test('win rates include draws and can exclude peeked games', () => {
  const receipts = ['human', 'jev', 'draw', 'human'].map((result, i) => ({ record: { result, peeked: i === 3 } }));
  assert.deepEqual(statsFor(receipts), { total: 4, human: 2, jev: 1, draws: 1, humanRate: 50, jevRate: 25, peeked: 1 });
  const blind = statsFor(receipts, true);
  assert.equal(blind.total, 3); assert.ok(Math.abs(blind.humanRate - 100 / 3) < 1e-10); assert.equal(blind.jev, 1);
  assert.equal(statsFor([]).humanRate, null);
});

test('500 rounds are retained in full; the cap explicitly stops further inference', async () => {
  const f = fixture(); const history = [];
  const initial = await f.prepare();
  const template = f.service.resolve({ sealedRound: initial.sealedRound, player: 'rock' }).receipt.record;
  const signKey = createHash('sha256').update('jev-rps:history:' + secret).digest();
  for (let i = 0; i < 500; i++) {
    const record = { ...template, number: i + 1, id: randomUUID(), previous: i ? sha256(history[i - 1].signature) : null };
    const signature = createHmac('sha256', signKey).update(JSON.stringify(record)).digest('hex');
    history.push({ record, signature });
  }
  await f.prepare(history.slice(0, 499));
  assert.equal(f.calls.at(-1).body.state.completed_rounds.length, 499);
  await assert.rejects(f.prepare(history), error => error.code === 'SERIES_COMPLETE');
  assert.equal(f.calls.length, 4);
  assert.ok(Buffer.byteLength(JSON.stringify({ history, series: f.series, action: 'prepare' })) < 4_000_000);
});

test('Route Handler validates requests and strips a supplied current move before calling Jev', async () => {
  const f = fixture(); const handler = createHandler(() => f.service);
  const request = (body, headers = {}) => new Request('https://game.example/api/game', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const payload = { action: 'prepare', history: [], series: f.series, player: 'scissors', prompt: 'cheat' };
  const missing = await handler(request(payload));
  assert.equal(missing.status, 401); assert.equal(missing.headers.get('cache-control'), 'no-store');
  const valid = await handler(request(payload, { Authorization: `Bearer ${apiKey}`, Origin: 'https://game.example' }));
  assert.equal(valid.status, 200);
  assert.equal(f.calls[0].body.state.player, undefined); assert.equal(JSON.stringify(f.calls[0].body).includes('cheat'), false);
  assert.equal((await handler(request(payload, { Origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await handler(request(payload, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await handler(request(payload, { 'Content-Length': '4100000' }))).status, 413);
  assert.equal((await handler(request({ action: 'bad' }))).status, 400);
  assert.equal((await handler(request(null))).status, 400);
  assert.throws(() => createGameService({ secret: '' }), /is not configured/);
});

test('bad analysis stops before the move request; no invented behavior or move', async () => {
  const malformed = analysisFixture(); malformed.answers.tilt.score = 200;
  const f = fixture({ analysis: malformed });
  await assert.rejects(f.prepare(), error => error.code === 'INVALID_ANALYSIS');
  assert.equal(f.calls.length, 1);
});

test('online experts learn a cycle, ignore peeked targets, and adaptation changes second-stage evidence', () => {
  const rows = Array.from({ length: 30 }, (_, i) => [i + 1, ['rock', 'paper', 'scissors'][i % 3], 'rock', 'draw', false]);
  const evidence = buildEvidence(rows);
  assert.ok(evidence.human_forecast.rock > 0.8);
  assert.equal(evidence.suggested_counter, 'paper');
  const peeks = buildEvidence(rows.map(r => [...r.slice(0, 4), true]));
  assert.equal(peeks.blind_rounds, 0);
  assert.equal(peeks.strongest_experts[0].evaluated_rounds, 0);
  const analysis = { behavior: { adaptation: { value: 0 }, cunning: { value: 0 } } };
  const stable = moveRequest(rows, evidence, analysis);
  const changed = moveRequest(rows, evidence, { behavior: { adaptation: { value: 100 } } });
  assert.ok(changed.state.decision_evidence.recent_weight > stable.state.decision_evidence.recent_weight);
});

// Reproduction of the reported losing streak: Jev's own committed moves fall
// into the rock -> scissors -> paper cycle, and the human plays Jev's previous
// move every round, which is exactly how the exported 51-round match ended
// (rounds 32-51: 20 losses in a row).
function losingStreak(rounds = 30) {
  const cycle = ['rock', 'scissors', 'paper'];
  const rows = [];
  for (let i = 0; i < rounds; i++) {
    const jev = cycle[i % 3];
    const human = i === 0 ? 'rock' : rows[i - 1][2]; // copy of Jev's previous move
    rows.push([i + 1, human, jev, outcome(human, jev), false]);
  }
  return rows;
}

test('a repeating rule of Jev own moves is detected, held forward, and stopped from owning the throw', () => {
  const rows = losingStreak();
  const evidence = buildEvidence(rows);
  const alert = evidence.exploit_alert;
  assert.ok(alert, 'the exploit must be detected once Jev repeats itself and the human cashes in');
  assert.ok(evidence.jev_self_predictability >= 0.6);
  assert.ok(evidence.human_exploitation_rate >= 0.5);
  assert.equal(alert.my_next_move_if_rule_repeats, evidence.my_repeating_rule.repeats_with);
  assert.equal(alert.human_exploit_move, COUNTER[alert.my_next_move_if_rule_repeats]);
  // The ensemble had the real answer all along: the human is copying Jev's last move.
  const lastJev = rows.at(-1)[2];
  assert.equal(Object.entries(evidence.human_response_to_my_last_move)
    .reduce((a, b) => (b[1] > a[1] ? b : a))[0], lastJev);
  const analysis = { behavior: { adaptation: { value: 50 }, cunning: { value: 50 } } };
  const decision = moveRequest(rows, evidence, analysis).state.decision_evidence;
  // The discrete tactic no longer owns the forecast: the validated ensemble keeps a floor.
  assert.ok(decision.ensemble_weight >= 0.15, 'the rolling ensemble must keep a floor');
  assert.notDeepEqual(decision.human_forecast, evidence.counter_after_human_win_forecast);
  const bestJev = MOVES.reduce((a, b) => (decision.win_probability_by_jev_move[b] > decision.win_probability_by_jev_move[a] ? b : a));
  assert.equal(bestJev, COUNTER[lastJev], 'the decision must answer the copying human, not repeat the detected rule');
  assert.notEqual(bestJev, alert.my_next_move_if_rule_repeats);
});

test('predictability alone is not exploitation: a poked-at constant Jev move raises no alert', () => {
  const rows = Array.from({ length: 30 }, (_, i) => [i + 1, ['rock', 'paper', 'scissors'][i % 3], 'rock', 'draw', false]);
  const evidence = buildEvidence(rows);
  assert.ok(evidence.jev_self_predictability >= 0.6, 'Jev repeating itself is still measured');
  assert.ok(Math.abs(evidence.human_exploitation_rate - 1 / 3) < 1e-3, 'a cycling human only beats the rule by chance');
  assert.equal(evidence.exploit_alert, null);
});

test('a tactic that stops holding up loses its share of the throw', () => {
  // A human who really does counter Jev's previous move after winning: the
  // tactic keeps its weight.
  const countering = Array.from({ length: 30 }, (_, i) => [i + 1,
    i === 0 ? 'paper' : COUNTER['rock'], 'rock', i === 0 ? 'jev' : 'human', false]);
  const holding = buildEvidence(countering);
  // The reported streak: the same tactic kept predicting a counter that stopped coming.
  const streak = losingStreak();
  const evidence = buildEvidence(streak);
  assert.equal(evidence.recent_counter_after_win_samples > 0, true);
  assert.equal(evidence.recent_counter_after_win_rate, 0, 'the human stopped countering Jev, so the tactic is failing');
  assert.equal(holding.recent_counter_after_win_rate, 1);
  const failing = moveRequest(streak, evidence, { behavior: { cunning: { value: 51 } } }).state.decision_evidence;
  const held = moveRequest(countering, holding, { behavior: { cunning: { value: 51 } } }).state.decision_evidence;
  assert.ok(failing.counter_weight < held.counter_weight, 'a failing tactic must carry less weight than a held-up one');
});

test('the first-stage prediction is gated by real concentration, not by a distribution that sums to one', () => {
  const rows = Array.from({ length: 30 }, (_, i) => [i + 1, ['rock', 'paper', 'scissors'][i % 3], 'paper', 'draw', false]);
  const evidence = buildEvidence(rows);
  const sharp = moveRequest(rows, evidence, { behavior: { regularity: { value: 100 }, cunning: { value: 50 } },
    human_prediction: 'rock', human_probabilities: { rock: .9, paper: .06, scissors: .04 } }).state.decision_evidence;
  assert.ok(sharp.model_concentration > 0.7);
  assert.ok(sharp.model_weight > 0, 'a sharp first-stage prediction must reach the decision');
  const flat = moveRequest(rows, evidence, { behavior: { regularity: { value: 100 }, cunning: { value: 50 } },
    human_probabilities: { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 } }).state.decision_evidence;
  assert.equal(flat.model_concentration, 0);
  assert.equal(flat.model_weight, 0, 'a uniform first-stage prediction must stay silent');
});
