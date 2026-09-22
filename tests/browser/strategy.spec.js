import { test, expect } from '@playwright/test';
import { createGameService } from '../../lib/game.js';
import { createHandler } from '../../lib/handler.js';
import { analysisFixture } from '../provider-fixture.mjs';

test('previous result stays in the action area while preparing, choosing and reloading', async ({ page }) => {
  const calls = [];
  const service = createGameService({ secret: 'strategy-browser-fixture-only'.repeat(3), fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    await new Promise(resolve => setTimeout(resolve, 160));
    return Response.json(body.questions.move
      ? { model: 'jev-1.13.0', answers: { move: { type: 'choice', choice: 'rock', probabilities: { rock: 0.8, paper: 0.1, scissors: 0.1 } } } }
      : analysisFixture());
  } });
  const handler = createHandler(() => service);
  await page.route('**/api/game', async route => {
    const req = route.request();
    const response = await handler(new Request(req.url(), { method: 'POST', headers: req.headers(), body: req.postData() }));
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect Jev to start' }).click();
  await page.getByLabel('Your TypeSafe API Key', { exact: true }).fill('fixture-only-key');
  await page.getByRole('button', { name: 'Connect and let Jev throw first' }).click();
  const paper = page.getByRole('button', { name: 'Paper, 3', exact: true });
  await expect(paper).toBeEnabled(); await paper.click();
  const recap = page.getByTestId('previous-round');
  await expect(recap).toContainText('You threw Paper'); await expect(recap).toContainText('Jev threw Rock');
  await expect(recap).toContainText('You win');
  await page.getByRole('button', { name: 'One more' }).click();
  await expect(recap).toBeVisible(); await expect(paper).toBeDisabled();
  await expect(paper).toBeEnabled(); await expect(recap).toContainText('You win');
  expect(calls).toHaveLength(4);
  expect(calls[2].state.completed_rounds).toEqual([[1, 'paper', 'rock', 'human', false]]);
  expect(calls[3].state.first_stage_jev_analysis.human_prediction).toBe('scissors');
  await page.reload(); await expect(recap).toContainText('Jev threw Rock');
  await expect(paper).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
