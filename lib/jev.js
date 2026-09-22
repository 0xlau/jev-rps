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
  } catch { throw new GameError(504, 'PROVIDER_UNREACHABLE', '暂时没有收到 Jev 的判断。网络可能超时，请稍后重试；本次没有计入战绩。'); }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new GameError(401, 'INVALID_KEY', 'TypeSafe 拒绝了这个密钥，请检查 API Key 和账户权限。');
    if (response.status === 402) throw new GameError(402, 'NO_CREDIT', 'TypeSafe 账户余额不足，请充值或更换密钥。');
    if ([429, 529].includes(response.status)) throw new GameError(429, 'RATE_LIMITED', 'TypeSafe 当前繁忙或请求达到限额，请稍等再试。');
    throw new GameError(502, 'PROVIDER_ERROR', `TypeSafe 返回错误（${response.status}）。本局尚未开始，可以稍后重试。`);
  }
  let result;
  try { result = await response.json(); } catch { throw new GameError(502, 'INVALID_ANSWER', 'Jev 返回的数据无法读取，本局没有开始。'); }
  if (typeof result.model !== 'string' || !/^jev[-a-zA-Z0-9.]{1,70}$/.test(result.model)) {
    throw new GameError(502, 'INVALID_ANSWER', 'Jev 没有返回有效的模型信息，本局没有开始。');
  }
  return result;
}
