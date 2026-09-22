export const MOVES = Object.freeze(['scissors', 'rock', 'paper']);
export const NAMES = Object.freeze({ scissors: 'scissors', rock: 'rock', paper: 'paper' });
export const MAX_ROUNDS = 500;

export function outcome(player, jev) {
  if (!MOVES.includes(player) || !MOVES.includes(jev)) throw new Error('Invalid move');
  if (player === jev) return 'draw';
  return { scissors: 'paper', rock: 'scissors', paper: 'rock' }[player] === jev ? 'human' : 'jev';
}

// An array fixes the field order across Node and the browser. The nonce is 256 bits.
export function commitmentText(proof) {
  return JSON.stringify(['jev-rps/v1', proof.series, proof.id, proof.number, proof.model,
    proof.contextHash, proof.move, proof.nonce, proof.preparedAt]);
}

export function statsFor(receipts, blindOnly = false) {
  const records = receipts.map(item => item.record).filter(r => !blindOnly || !r.peeked);
  const human = records.filter(r => r.result === 'human').length;
  const jev = records.filter(r => r.result === 'jev').length;
  const draws = records.filter(r => r.result === 'draw').length;
  return { total: records.length, human, jev, draws,
    humanRate: records.length ? human / records.length * 100 : null,
    jevRate: records.length ? jev / records.length * 100 : null,
    peeked: receipts.filter(item => item.record.peeked).length };
}
