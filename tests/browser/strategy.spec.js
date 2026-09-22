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
  await page.getByRole('button', { name: '连接 Jev，开始对局' }).click();
  await page.getByLabel('你的 TypeSafe API Key', { exact: true }).fill('fixture-only-key');
  await page.getByRole('button', { name: '连接，让 Jev 先出拳' }).click();
  const paper = page.getByRole('button', { name: '出布，快捷键 3', exact: true });
  await expect(paper).toBeEnabled(); await paper.click();
  const recap = page.getByTestId('previous-round');
  await expect(recap).toContainText('你出布'); await expect(recap).toContainText('Jev 出石头');
  await expect(recap).toContainText('你赢了');
  await page.getByRole('button', { name: '再来一局' }).click();
  await expect(recap).toBeVisible(); await expect(paper).toBeDisabled();
  await expect(paper).toBeEnabled(); await expect(recap).toContainText('你赢了');
  expect(calls).toHaveLength(4);
  expect(calls[2].state.completed_rounds).toEqual([[1, 'paper', 'rock', 'human', false]]);
  expect(calls[3].state.first_stage_jev_analysis.human_prediction).toBe('scissors');
  await page.reload(); await expect(recap).toContainText('Jev 出石头');
  await expect(paper).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
