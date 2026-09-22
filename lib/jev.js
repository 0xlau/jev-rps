export const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
export const MODEL = 'jev-latest';

export class GameError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function requestJev(body, { apiKey, fetchImpl = fetch, signal = AbortSignal.timeout(45000) }) {
  let response;
  try {
    response = await fetchImpl(TYPESAFE_URL, { method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal, redirect: 'error' });
  } catch { throw new GameError(504, 'PROVIDER_UNREACHABLE', 'No word from Jev. Network may have timed out — retry shortly. Nothing counted.'); }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new GameError(401, 'INVALID_KEY', 'TypeSafe rejected this key. Check the API key and account permissions.');
    if (response.status === 402) throw new GameError(402, 'NO_CREDIT', 'TypeSafe account balance is low. Top up or switch keys.');
    if ([429, 529].includes(response.status)) throw new GameError(429, 'RATE_LIMITED', 'TypeSafe is busy or rate-limited. Wait a moment and retry.');
    throw new GameError(502, 'PROVIDER_ERROR', `TypeSafe returned an error (${response.status}). Round has not started — retry later.`);
  }
  let result;
  try { result = await response.json(); } catch { throw new GameError(502, 'INVALID_ANSWER', 'Jev returned unreadable data. Round did not start.'); }
  if (typeof result.model !== 'string' || !/^jev[-a-zA-Z0-9.]{1,70}$/.test(result.model)) {
    throw new GameError(502, 'INVALID_ANSWER', 'Jev returned no valid model info. Round did not start.');
  }
  return result;
}
