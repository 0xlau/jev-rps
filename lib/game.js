import { createHash, createHmac, randomBytes, randomUUID, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { MOVES, MAX_ROUNDS, outcome, commitmentText } from './protocol.js';
import { GameError, requestJev } from './jev.js';
import { twoStageDecision } from './strategy.js';

export { TYPESAFE_URL, MODEL, GameError } from './jev.js';
export const sha256 = value => createHash('sha256').update(value).digest('hex');

const fail = (status, code, message) => { throw new GameError(status, code, message); };
const isId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);

export function createGameService({ secret, fetchImpl = fetch, clock = () => new Date().toISOString() }) {
  if (typeof secret !== 'string' || secret.length < 32) {
    fail(503, 'SETUP_REQUIRED', '服务端凭证密钥尚未配置，请联系网站维护者。');
  }
  const sealKey = createHash('sha256').update('jev-rps:seal:' + secret).digest();
  const signKey = createHash('sha256').update('jev-rps:history:' + secret).digest();
  const sign = record => createHmac('sha256', signKey).update(JSON.stringify(record)).digest('hex');

  function seal(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', sealKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  function unseal(token) {
    try {
      if (typeof token !== 'string' || token.length > 24000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
      const data = Buffer.from(token, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', sealKey, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      const value = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
      if (value.version !== 1 || !MOVES.includes(value.proof?.move)) throw new Error();
      return value;
    } catch { fail(400, 'INVALID_ROUND', '本局凭证无效或已过期，无法改变或重新生成本局出拳。请导出记录后开启新的一组。'); }
  }

  function verifyHistory(history, series) {
    if (!Array.isArray(history) || history.length > MAX_ROUNDS) fail(400, 'INVALID_HISTORY', '战绩格式不正确或超出单组上限。');
    let previous = null;
    const ids = new Set();
    for (const [index, item] of history.entries()) {
      const r = item?.record;
      if (!r || typeof item.signature !== 'string' || !/^[a-f0-9]{64}$/.test(item.signature)
          || !timingSafeEqual(Buffer.from(sign(r), 'hex'), Buffer.from(item.signature, 'hex'))
          || r.series !== series || r.number !== index + 1 || r.previous !== previous || ids.has(r.id)) {
        fail(400, 'INVALID_HISTORY', '战绩凭证校验失败，可能被修改或缺少某一局。请先导出记录，再开启新的一组。');
      }
      previous = sha256(item.signature);
      ids.add(r.id);
    }
    return previous;
  }

  async function prepare({ history, series, apiKey }) {
    if (!isId(series)) fail(400, 'INVALID_SERIES', '对局编号无效，请刷新页面。');
    if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 512 || /[^\x21-\x7e]/.test(apiKey)) {
      fail(401, 'MISSING_KEY', '请填写有效的 TypeSafe API Key 后再开始。');
    }
    const previous = verifyHistory(history, series);
    if (history.length >= MAX_ROUNDS) fail(400, 'SERIES_COMPLETE', '本组已完成 500 局。开启新的一组后，旧战绩仍保留在本机并可导出。');
    // Every completed round is included, including peeked rounds and draws. No truncation.
    const context = history.map(({ record: r }) => [r.number, r.player, r.move, r.result, r.peeked]);
    const contextHash = sha256(JSON.stringify(context));
    const started = Date.now();
    // Both requests share one deadline inside Vercel's 60-second invocation.
    const signal = AbortSignal.timeout(48000);
    let evaluated;
    try {
      evaluated = await twoStageDecision(context, body => requestJev(body, { apiKey, fetchImpl, signal }));
    } catch (error) {
      if (error instanceof GameError) throw error;
      fail(502, 'INVALID_ANALYSIS', 'Jev 没有返回有效的行为分析，本局没有开始，请重试。');
    }
    const result = evaluated.second;
    const answer = result?.answers?.move;
    if (answer?.type !== 'choice' || !MOVES.includes(answer.choice) || typeof result.model !== 'string'
        || !/^jev[-a-zA-Z0-9.]{1,70}$/.test(result.model)) {
      fail(502, 'INVALID_ANSWER', 'Jev 没有返回有效的剪刀、石头或布。本局没有开始，请重试。');
    }
    const proof = { series, id: randomUUID(), number: history.length + 1, model: result.model,
      contextHash, move: answer.choice, nonce: randomBytes(32).toString('hex'), preparedAt: clock() };
    const commitment = sha256(commitmentText(proof));
    const probabilities = Object.fromEntries(MOVES.map(move => [move,
      Number.isFinite(answer.probabilities?.[move]) ? answer.probabilities[move] : null]));
    // Keep a compact analysis with the sealed round, then reveal it only after
    // resolution. Full past history is already in signed receipts, not duplicated.
    const { evidence, ...analysis } = evaluated.strategy;
    const strategy = { ...analysis, blindRounds: evidence.blind_rounds,
      humanForecast: evidence.human_forecast, strongestExperts: evidence.strongest_experts,
      afterLoss: evidence.after_human_loss, distributionShift: evidence.recent_distribution_shift };
    const tokenTotal = field => [evaluated.first, result].every(r => Number.isSafeInteger(r.usage?.[field]))
      ? evaluated.first.usage[field] + result.usage[field] : null;
    const decision = { version: 1, proof, commitment, previous, peeked: false, probabilities, strategy,
      latencyMs: Date.now() - started,
      usage: { input: tokenTotal('input_tokens'), output: tokenTotal('output_tokens'), requests: 2 } };
    return { sealedRound: seal(decision), id: proof.id, number: proof.number, model: proof.model,
      commitment, contextHash, contextCount: history.length, preparedAt: proof.preparedAt, latencyMs: decision.latencyMs };
  }

  function reveal({ sealedRound }) {
    const decision = unseal(sealedRound);
    decision.peeked = true;
    return { proof: decision.proof, commitment: decision.commitment, sealedRound: seal(decision) };
  }

  function resolve({ sealedRound, player, peeked = false }) {
    if (!MOVES.includes(player) || typeof peeked !== 'boolean') fail(400, 'INVALID_MOVE', '请选择剪刀、石头或布。');
    const decision = unseal(sealedRound);
    const record = { ...decision.proof, commitment: decision.commitment, player,
      result: outcome(player, decision.proof.move), peeked: decision.peeked || peeked,
      previous: decision.previous, resolvedAt: clock(), probabilities: decision.probabilities,
      latencyMs: decision.latencyMs, usage: decision.usage,
      ...(decision.strategy ? { strategy: decision.strategy } : {}) };
    return { receipt: { record, signature: sign(record) }, proof: decision.proof, commitment: decision.commitment };
  }

  return { prepare, reveal, resolve, verifyHistory };
}
