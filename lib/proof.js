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
  if (!valid) throw new Error('Throw proof failed: revealed content does not match the opening commitment. Round stopped — export and inspect.');
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
    throw new Error('Settle proof does not match this round. Nothing written. Export and inspect.');
  }
}
