import { defineRouting } from 'next-intl/routing';

export const locales = ['en', 'zh'];
export const defaultLocale = 'en';

export const routing = defineRouting({
  locales,
  defaultLocale,
  // 'always' avoids as-needed's internal rewrite (`/` → `/en`), which Next.js 16
  // proxy re-processes into a `/en` → `/` redirect loop.
  localePrefix: 'always',
});
