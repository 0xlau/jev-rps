'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '../../i18n/navigation.js';

export default function LocaleSwitcher() {
  const t = useTranslations('Nav');
  const tLocale = useTranslations('Locale');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const next = locale === 'en' ? 'zh' : 'en';

  return (
    <button
      type="button"
      className="locale-switcher"
      aria-label={t('localeSwitch')}
      onClick={() => router.replace(pathname, { locale: next })}
    >
      {tLocale(next)}
    </button>
  );
}
