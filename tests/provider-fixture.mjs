export function analysisFixture() {
  return { model: 'jev-1.13.0', answers: {
    ...Object.fromEntries(['regularity', 'cunning', 'tilt', 'adaptation'].map(name => [name,
      { type: 'score', score: 2, confidence: 0.8, probabilities: { 0: 0, 1: 0.1, 2: 0.8, 3: 0.1, 4: 0 } }])),
    human_prediction: { type: 'choice', choice: 'scissors', probabilities: { scissors: 0.8, rock: 0.1, paper: 0.1 }, confidence: 0.8 },
  }, usage: { input_tokens: 140, output_tokens: 50 } };
}
