import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

function buildCsp(nonce) {
  const dev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data: blob:", "font-src 'self'",
    `connect-src 'self'${dev ? ' ws://127.0.0.1:* ws://localhost:*' : ''}`,
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
}

export default async function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);

  const response = handleI18nRouting(request);
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|.*\\..*).*)',
};
