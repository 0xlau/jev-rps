import { randomBytes } from 'node:crypto';
import { createGameService, GameError } from './game.js';

function defaultService() {
  let secret = process.env.GAME_SECRET;
  if (!secret && process.env.NODE_ENV === 'development') {
    globalThis.__jevDevSecret ??= randomBytes(48).toString('hex');
    secret = globalThis.__jevDevSecret;
  }
  return createGameService({ secret });
}

export function createHandler(serviceFactory = defaultService) {
  const send = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  return async function POST(request) {
    try {
      const origin = request.headers.get('origin');
      const host = request.headers.get('host') || new URL(request.url).host;
      if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== host)) {
        return send(403, { error: 'Cross-site requests are not accepted.' });
      }
      if (!request.headers.get('content-type')?.includes('application/json')) return send(415, { error: 'Request body must be JSON.' });
      if (Number(request.headers.get('content-length')) > 4_000_000) return send(413, { error: 'Request too large.' });
      const reader = request.body?.getReader();
      if (!reader) return send(400, { error: 'Request body cannot be empty.' });
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4_000_000) { await reader.cancel(); return send(413, { error: 'Request too large.' }); }
        chunks.push(value);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return send(400, { error: 'Invalid JSON.' }); }
      if (!data || Array.isArray(data) || typeof data !== 'object') return send(400, { error: 'Invalid request shape.' });
      if (!['prepare', 'reveal', 'resolve'].includes(data.action)) return send(400, { error: 'Unknown action.' });
      const service = serviceFactory();
      let result;
      if (data.action === 'prepare') {
        // Whitelist fields so a current human move can never enter the provider request.
        result = await service.prepare({ history: data.history, series: data.series,
          apiKey: request.headers.get('authorization')?.replace(/^Bearer /, '') });
      } else if (data.action === 'reveal') result = service.reveal({ sealedRound: data.sealedRound });
      else result = service.resolve({ sealedRound: data.sealedRound, player: data.player, peeked: data.peeked });
      return send(200, result);
    } catch (error) {
      // Never log bodies, credentials, or upstream errors.
      if (error instanceof GameError) return send(error.status, { code: error.code, error: error.message });
      return send(500, { code: 'INTERNAL_ERROR', error: 'That step did not finish. Sealed throws are kept — retry.' });
    }
  };
}
