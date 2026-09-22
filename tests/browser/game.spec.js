import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createGameService } from '../../lib/game.js';
import { createHandler } from '../../lib/handler.js';
import { STORAGE_KEY } from '../../lib/browser-store.js';

// Test fixtures only. Production has no mock mode or random fallback.
async function mockGame(page, options = {}) {
  const providerCalls = []; const requests = [];
  let resolveCount = 0;
  const service = createGameService({ secret: 'browser-tests-only-secret'.repeat(3),
    fetchImpl: async (_url, init) => {
      providerCalls.push(JSON.parse(init.body));
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      if (options.status) return new Response('', { status: options.status });
      return Response.json({ model: 'jev-1.13.0', answers: { move: { type: 'choice', choice: 'rock', probabilities: { rock: .8, paper: .1, scissors: .1 } } } });
    } });
  const handler = createHandler(() => service);
  await page.context().route('**/api/game', async route => {
    const req = route.request();
    const body = req.postDataJSON(); requests.push(body);
    if (body.action === 'resolve') {
      resolveCount++;
      if (options.failFirstResolve && resolveCount === 1) return route.abort();
    }
    const result = await handler(new Request(req.url(), { method: 'POST', headers: req.headers(), body: req.postData() }));
    const data = await result.json();
    if (options.tamper && body.action === 'resolve') data.proof.move = 'scissors';
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return { providerCalls, requests };
}
async function open(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '让 Jev 先出拳' })).toBeEnabled();
}
async function start(page) {
  await page.getByLabel('TypeSafe API Key', { exact: true }).fill('browser-test-key-not-a-real-key');
  await page.getByRole('button', { name: '让 Jev 先出拳' }).click();
  await expect(page.getByRole('button', { name: '出剪刀', exact: true })).toBeEnabled();
}
async function saved(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY); }

test('locks controls until Jev commits; resolves, verifies, and carries full history forward', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const f = await mockGame(page, { delay: 500 });
  await open(page);
  await expect(page.getByRole('button', { name: '出石头', exact: true })).toBeDisabled();
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({ path: `.impeccable/review/${info.project.name}-empty.png`, fullPage: true });
  await page.getByLabel('TypeSafe API Key', { exact: true }).fill('browser-test-key-not-a-real-key');
  await page.getByRole('button', { name: '让 Jev 先出拳' }).click();
  await expect(page.getByRole('button', { name: '出石头', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '出石头', exact: true })).toBeEnabled();
  const before = await saved(page);
  expect(before.pending.commitment).toHaveLength(64); expect(before.pending.proof).toBeNull();
  await page.screenshot({ path: `.impeccable/review/${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '出布', exact: true }).click();
  await expect(page.getByText('出拳承诺核验通过', { exact: true })).toBeVisible();
  expect((await saved(page)).history[0].record.commitment).toBe(before.pending.commitment);
  await expect(page.getByTestId('human-rate')).toHaveText('100.0%');
  await page.getByRole('button', { name: '查看第 1 局凭证' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '在浏览器重新核验' }).click();
  await expect(page.getByText('核验通过：开局承诺与最终出拳完全一致。')).toBeVisible();
  await page.getByRole('button', { name: '关闭凭证' }).click();
  await page.getByRole('button', { name: '再来一局' }).click();
  await expect(page.getByRole('button', { name: '出石头', exact: true })).toBeEnabled();
  expect(f.providerCalls[1].state.completed_rounds).toEqual([[1, 'paper', 'rock', 'human', false]]);
  await page.getByRole('button', { name: '出石头', exact: true }).click();
  await expect(page.getByTestId('human-rate')).toHaveText('50.0%');
  expect(f.providerCalls).toHaveLength(2);
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});

test('peeking survives reload, uses the same decision, and remains separate from blind wins', async ({ page }) => {
  const f = await mockGame(page); await open(page); await start(page);
  const commitment = (await saved(page)).pending.commitment;
  await page.getByRole('button', { name: '偷偷看一眼' }).click();
  await expect(page.getByText('你已揭盖，现在可以出拳', { exact: true })).toBeVisible();
  await expect(page.getByTestId('choice-cover')).toHaveClass(/lifted/);
  await page.reload();
  await expect(page.getByRole('button', { name: '出布', exact: true })).toBeEnabled();
  await expect(page.getByLabel('TypeSafe API Key', { exact: true })).toHaveValue('');
  expect((await saved(page)).pending.peeked).toBe(true);
  await page.getByRole('button', { name: '出布', exact: true }).click();
  await expect(page.getByText('出拳承诺核验通过', { exact: true })).toBeVisible();
  await expect(page.getByTestId('human-rate')).toHaveText('—');
  await page.getByRole('button', { name: '全部对局', exact: true }).click();
  await expect(page.getByTestId('human-rate')).toHaveText('100.0%');
  expect((await saved(page)).history[0].record.commitment).toBe(commitment);
  expect(f.providerCalls).toHaveLength(1);
  await page.getByLabel('TypeSafe API Key', { exact: true }).fill('another-test-key');
  await page.getByRole('button', { name: '再来一局' }).click();
  await expect(page.getByRole('button', { name: '出石头', exact: true })).toBeEnabled();
  expect(f.providerCalls[1].state.completed_rounds[0][4]).toBe(true);
});

test('failed resolution locks the human move and retries without regenerating AI', async ({ page }) => {
  const f = await mockGame(page, { failFirstResolve: true }); await open(page); await start(page);
  await page.getByRole('button', { name: '出剪刀', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '这一步还没完成' })).toBeVisible();
  await expect(page.getByRole('button', { name: '出布', exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: '重试结算', exact: true }).click();
  await expect(page.getByText('出拳承诺核验通过', { exact: true })).toBeVisible();
  expect((await saved(page)).history[0].record.player).toBe('scissors');
  expect(f.providerCalls).toHaveLength(1);
});

test('a mismatched commitment cannot create a result or update stats', async ({ page }) => {
  await mockGame(page, { tamper: true }); await open(page); await start(page);
  await page.getByRole('button', { name: '出布', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '这一步还没完成' })).toContainText('核验失败');
  expect((await saved(page)).history).toHaveLength(0);
  await expect(page.getByRole('button', { name: '出石头', exact: true })).toBeDisabled();
});

test('provider auth failure leaves no round; exports and storage never contain the key', async ({ page }) => {
  await mockGame(page, { status: 401 }); await open(page);
  await page.getByLabel('TypeSafe API Key', { exact: true }).fill('private-test-key-keep-out-of-storage');
  await page.getByRole('button', { name: '让 Jev 先出拳' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '这一步还没完成' })).toContainText('拒绝');
  await expect(page.getByRole('button', { name: '出石头', exact: true })).toBeDisabled();
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain('private-test-key');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出记录' }).click();
  const stream = await (await download).createReadStream();
  let content = ''; for await (const chunk of stream) content += chunk;
  expect(content).not.toContain('private-test-key');
  expect(JSON.parse(content).game.pending).toBeNull();
});

test('archives preserve old results and a new series sends an empty context', async ({ page }) => {
  const f = await mockGame(page); await open(page); await start(page);
  await page.getByRole('button', { name: '出布', exact: true }).click();
  await expect(page.getByText('出拳承诺核验通过', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新的一组' }).click();
  await expect(page.getByText('已开启新的一组，旧战绩已归档保留。')).toBeVisible();
  const state = await saved(page);
  expect(state.archives[0].history).toHaveLength(1); expect(state.history).toHaveLength(0);
  await page.getByRole('button', { name: '让 Jev 先出拳' }).click();
  await expect(page.getByRole('button', { name: '出石头', exact: true })).toBeEnabled();
  expect(f.providerCalls[1].state.completed_rounds).toEqual([]);
});

test('two tabs share one pending round and cannot double resolve it', async ({ page, context }) => {
  const f = await mockGame(page); await open(page); await start(page);
  const other = await context.newPage(); await other.goto('/');
  await expect(other.getByRole('button', { name: '出布', exact: true })).toBeEnabled();
  // Dispatch competing events without Playwright waiting for a now-disabled control.
  await Promise.all([page.getByRole('button', { name: '出布', exact: true }).dispatchEvent('click'), other.getByRole('button', { name: '出布', exact: true }).dispatchEvent('click')]);
  await expect(page.getByTestId('human-rate')).toHaveText('100.0%');
  await expect(other.getByTestId('human-rate')).toHaveText('100.0%');
  expect((await saved(page)).history).toHaveLength(1);
  expect(f.providerCalls).toHaveLength(1);
});

test('actual Next.js API returns controlled missing-key error and never caches it', async ({ request }) => {
  const response = await request.post('/api/game', { data: { action: 'prepare', series: crypto.randomUUID(), history: [] } });
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect((await response.json()).code).toBe('MISSING_KEY');
});
