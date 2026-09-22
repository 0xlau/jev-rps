// Frozen pre-optimization production prompt for genuine API comparisons.
export function baselineRequest(context) {
  return { model: 'jev-latest', state: {
    game: 'Rock paper scissors. You are Jev playing against a human.',
    objective: 'Win against the human. Maximize your probability of winning the next round and your win rate over this series; a draw is not a win.',
    rules: 'Rock beats scissors; scissors beats paper; paper beats rock. Equal moves draw.',
    next_round: context.length + 1,
    history_columns: ['round', 'human_move', 'jev_move', 'winner', 'human_peeked_before_playing'],
    completed_rounds: context, current_human_move: 'UNKNOWN. The human has not been allowed to choose yet.',
  }, questions: { move: { type: 'choice', instructions: [
    'Your goal is to beat the human: predict what the human is likely to play next, then choose YOUR own counter-move with the highest estimated probability of winning.',
    'Use every row in `completed_rounds`, interpreted using `history_columns`, to estimate the likelihood of the human choosing rock, paper or scissors in `next_round`.',
    'Consider overall frequencies, recent changes, repeated moves, cycles, transitions after the last move, reactions to winning, losing or drawing, and responses to your previous moves. Adapt when recent evidence suggests the human has changed strategy, and avoid assuming a pattern that the history does not support.',
    'Keep peeked rounds in context, but treat them as biased observations: the human could see your choice before playing. Give unpeeked rounds priority when predicting the human without that advantage.',
    'Compare the winning probabilities of your three actions: YOUR rock wins against human scissors; YOUR paper wins against human rock; YOUR scissors wins against human paper. Select the action with the highest estimated winning probability. For example, if rock is the most likely human move, choose paper.',
    'The current human move is unknown. Use only completed history, and commit your choice now before the human is allowed to choose. With no useful evidence or equally likely human moves, choose any valid move without inventing certainty.',
    'Return only YOUR selected action as the choice; any prediction of the human is used to select that action.',
  ].join(' '), criteria: {
    scissors: 'YOUR action is SCISSORS. Wins against human PAPER, draws against human SCISSORS, loses to human ROCK. Its winning probability is the estimated probability that the human chooses PAPER.',
    rock: 'YOUR action is ROCK. Wins against human SCISSORS, draws against human ROCK, loses to human PAPER. Its winning probability is the estimated probability that the human chooses SCISSORS.',
    paper: 'YOUR action is PAPER. Wins against human ROCK, draws against human PAPER, loses to human SCISSORS. Its winning probability is the estimated probability that the human chooses ROCK.',
  } } } };
}
