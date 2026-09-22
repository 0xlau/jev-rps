import '@fontsource-variable/manrope';
import './globals.css';
import GoogleAnalytics from './google-analytics.js';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jev-rps.vercel.app';
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Jev 对拳 · 剪刀、石头、布',
  description: 'AI 先出拳，你再选择。每一局都可核验。',
  applicationName: 'Jev 对拳',
  alternates: { canonical: '/' },
  icons: { icon: '/icon.svg', type: 'image/svg+xml' },
  openGraph: {
    type: 'website', url: '/', siteName: 'Jev 对拳', title: 'Jev 对拳',
    description: 'AI 先出拳，你再选择。', images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Jev 对拳' }],
  },
  twitter: { card: 'summary_large_image', title: 'Jev 对拳', description: 'AI 先出拳，你再选择。', images: ['/og-image.png'] },
  robots: { index: true, follow: true },
  ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
};

export default function RootLayout({ children }) {
  return <html lang="zh-CN"><body>{children}<GoogleAnalytics /></body></html>;
}
