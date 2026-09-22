import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { baselineRequest } from './baseline.js';
import { twoStageDecision, STRATEGY_VERSION, COUNTER } from '../lib/strategy.js';
import { requestJev } from '../lib/jev.js';
import { MOVES, outcome } from '../lib/protocol.js';

// The secret arrives through a non-echoing TTY, never argv, files or logs.
async function readSecret() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  if (!process.stdin.isTTY) throw new Error('Use a TTY or TYPESAFE_API_KEY.');
  process.stdout.write('TypeSafe key (hidden): ');
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = chunk => {
      for (const c of chunk.toString()) {
        if (c === '\x03') { process.stdin.setRawMode(false); process.exit(130); }
        if (c === '\r' || c === '\n') {
          process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause();
          process.stdout.write('\n');
          if (!value.trim()) reject(new Error('Missing key')); else resolve(value.trim());
          return;
        }
        if (c === '\x7f') value = value.slice(0, -1); else value += c;
      }
    };
    process.stdin.on('data', onData);
  });
}

const seedRandom = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

export function simulatedHuman(kind, history, rng) {
  const t = history.length, last = history.at(-1), r = rng();
  const randomMove = MOVES[Math.floor(r * 3)];
  if (kind === 'random') return randomMove;
  if (kind === 'cycle') return ['rock', 'paper', 'scissors'][t % 3];
  if (kind === 'biased') return r < 0.72 ? 'rock' : r < 0.88 ? 'paper' : 'scissors';
  if (kind === 'reactive') return !last ? 'rock' : r < 0.12 ? randomMove : last[3] === 'human' ? last[1] : COUNTER[last[1]];
  if (kind === 'counter') return !last ? 'paper' : r < 0.15 ? randomMove : COUNTER[last[2]];
  if (kind === 'switching') {
    if (t < 12) return r < 0.82 ? 'rock' : randomMove;
    return !last ? 'paper' : r < 0.15 ? randomMove : COUNTER[last[2]];
  }
  throw new Error('Unknown simulated opponent');
}

function summarize(records) {
  const wins = records.filter(r => r.result === 'jev').length, draws = records.filter(r => r.result === 'draw').length;
  const n = records.length;
  return { rounds: n, wins, draws, losses: n - wins - draws, winRate: n ? wins / n : null };
}

let active = 0; const queue = [];
async function limit(fn) {
  if (active >= 4) await new Promise(resolve => queue.push(resolve));
  active++;
  try { return await fn(); } finally { active--; queue.shift()?.(); }
}

async function runGroup({ name, mode, opponents, seeds, apiKey }) {
  const group = { name, mode, strategy: mode === 'baseline' ? 'original-production' : STRATEGY_VERSION,
    budget: 100, requests: 0, inputTokens: 0, outputTokens: 0, requestsLog: [], episodes: [] };
  const request = body => limit(async () => {
    if (group.requests >= 100) throw new Error('Request budget exhausted');
    const number = ++group.requests, start = Date.now();
    try {
      const result = await requestJev(body, { apiKey });
      const usage = result.usage || {};
      group.inputTokens += usage.input_tokens || 0; group.outputTokens += usage.output_tokens || 0;
      group.requestsLog.push({ number, stage: body.questions.move ? 'move' : 'analysis', model: result.model,
        latencyMs: Date.now() - start, usage, status: 'ok' });
      if (number % 20 === 0) console.log(`${name}: ${number}/100 requests`);
      return result;
    } catch (e) {
      group.requestsLog.push({ number, latencyMs: Date.now() - start, status: e.code || 'error' });
      throw e;
    }
  });
  group.episodes = await Promise.all(opponents.map(async (opponent, i) => {
    const history = [], records = [], rng = seedRandom(seeds[i]);
    const episode = { opponent, seed: seeds[i], records };
    try {
      for (let t = 0; t < 25; t++) {
        // Human commits in PRIVATE before requests. Neither move nor simulator
        // identity, seed, future moves or rules enter either Jev request.
        const human = simulatedHuman(opponent, history, rng);
        const context = structuredClone(history);
        const decision = mode === 'baseline' ? { second: await request(baselineRequest(context)) }
          : await twoStageDecision(context, request);
        const answer = decision.second?.answers?.move;
        if (answer?.type !== 'choice' || !MOVES.includes(answer.choice)) throw new Error('Invalid real Jev choice');
        const jev = answer.choice, result = outcome(human, jev);
        records.push({ round: t + 1, human, jev, result,
          strategy: decision.strategy, moveProbabilities: answer.probabilities });
        history.push([t + 1, human, jev, result, false]);
      }
    } catch (e) { episode.error = e.code || e.message; }
    episode.summary = summarize(records);
    episode.first10 = summarize(records.slice(0, 10)); episode.last10 = summarize(records.slice(-10));
    console.log(JSON.stringify({ group: name, opponent, ...episode.summary, error: episode.error }));
    return episode;
  }));
  group.summary = summarize(group.episodes.flatMap(e => e.records));
  group.meanLatencyMs = Math.round(group.requestsLog.reduce((s, r) => s + r.latencyMs, 0) / group.requests);
  return group;
}

const suite = process.argv[2] || 'train';
const apiKey = await readSecret();
const opponents = suite === 'train' ? ['cycle', 'reactive', 'switching', 'random'] : ['cycle', 'biased', 'counter', 'random'];
const seeds = suite === 'train' ? [119, 228, 337, 446] : [941, 1052, 1163, 1274];
const label = `${suite}-${STRATEGY_VERSION}`;
const configs = suite === 'refine' ? [
  { name: `${label}-adaptation`, mode: 'optimized', opponents: ['reactive', 'switching'], seeds: [228, 337] },
] : [
  { name: `${label}-baseline`, mode: 'baseline', opponents, seeds },
  { name: `${label}-a`, mode: 'optimized', opponents: opponents.slice(0, 2), seeds: seeds.slice(0, 2) },
  { name: `${label}-b`, mode: 'optimized', opponents: opponents.slice(2), seeds: seeds.slice(2) },
];
const started = new Date().toISOString();
console.log(`Starting ${label}: ${configs.length} groups × 100 API requests; two-stage groups contain 50 rounds each.`);
const groups = [];
await mkdir('benchmarks', { recursive: true });
const source = await readFile(new URL('../lib/strategy.js', import.meta.url), 'utf8');
await writeFile(`benchmarks/${label}-strategy.txt`, source);
const writeReport = () => writeFile(`benchmarks/${label}.json`, JSON.stringify({ started, finished: new Date().toISOString(),
  strategySourceSha256: createHash('sha256').update(source).digest('hex'),
  protocol: '25 sequential rounds per opponent. Same seeds per variant; reactive humans respond to each variant own completed history. Uniform random control. Win rate includes draws. No retries; failed calls count toward budget.', groups }, null, 2));
await Promise.all(configs.map(async config => {
  const group = await runGroup({ ...config, apiKey }); groups.push(group); await writeReport();
}));
await writeReport();
console.log(JSON.stringify({ report: `benchmarks/${label}.json`, groups: groups.map(g => ({ name: g.name, requests: g.requests, ...g.summary,
  inputTokens: g.inputTokens, outputTokens: g.outputTokens, meanLatencyMs: g.meanLatencyMs })) }, null, 2));
