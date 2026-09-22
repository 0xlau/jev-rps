import '@fontsource-variable/manrope';
import '../globals.css';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '../../i18n/routing';
import GoogleAnalytics from '../google-analytics.js';
import LocaleSwitcher from './locale-switcher.js';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jev-rps.timlau.me';
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const meta = messages.Metadata;
  const ogImage = locale === 'zh' ? '/og-image.zh.png' : '/og-image.png';
  return {
    metadataBase: new URL(siteUrl),
    title: meta.title,
    description: meta.description,
    applicationName: meta.applicationName,
    alternates: {
      canonical: locale === 'en' ? '/en' : `/${locale}`,
      languages: { en: '/en', zh: '/zh' },
    },
    icons: { icon: '/icon.svg', type: 'image/svg+xml' },
    openGraph: {
      type: 'website',
      url: locale === 'en' ? '/' : `/${locale}`,
      siteName: meta.siteName,
      title: meta.siteName,
      description: meta.shortDescription,
      images: [{ url: ogImage, width: 1200, height: 630, alt: meta.ogAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.siteName,
      description: meta.shortDescription,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
    ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
  };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return (
    <html lang={locale === 'zh' ? 'zh-CN' : 'en'}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <LocaleSwitcher />
        </NextIntlClientProvider>
        <GoogleAnalytics />
      </body>
    </html>
  );
}
