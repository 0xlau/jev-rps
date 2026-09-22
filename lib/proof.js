import { MOVES, commitmentText, outcome } from './protocol.js';

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export function historyContext(history) {
  return history.map(({ record: r }) => [r.number, r.player, r.move, r.result, r.peeked]);
}

export async function verifyProof(proof, expected, series) {
  const valid = proof && MOVES.includes(proof.move) && /^[a-f0-9]{64}$/.test(proof.nonce)
    && proof.series === series
    && ['id', 'number', 'model', 'contextHash', 'preparedAt'].every(key => proof[key] === expected[key])
    && await digest(commitmentText(proof)) === expected.commitment;
  if (!valid) throw new Error('出拳凭证核验失败：揭晓的内容与开局承诺不一致。本局已停止，请导出记录检查。');
  return true;
}

export async function verifyReceipt(result, pending, series, history) {
  await verifyProof(result.proof, pending, series);
  const r = result.receipt?.record;
  const previous = history.length ? await digest(history.at(-1).signature) : null;
  if (!r || !Object.keys(result.proof).every(key => r[key] === result.proof[key])
    || result.commitment !== pending.commitment || r.commitment !== pending.commitment
    || r.player !== pending.player || r.peeked !== pending.peeked
    || r.result !== outcome(pending.player, result.proof.move) || r.previous !== previous
    || !/^[a-f0-9]{64}$/.test(result.receipt.signature)) {
    throw new Error('结算凭证与本局不一致，战绩未写入。请导出记录检查。');
  }
}
