'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
export const analyticsEnabled = /^G-[A-Z0-9]+$/.test(measurementId || '');

// Queues an event even before gtag.js has loaded, and never throws: measurement
// must not be able to interrupt a round. Only outcome-level data belongs here —
// never the TypeSafe API key, a sealed round token, a commitment, or either
// player's move.
export function track(event, params) {
  if (!analyticsEnabled || typeof window === 'undefined') return;
  try {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
    }
    window.gtag('event', event, params || {});
  } catch { /* measurement is never allowed to break the game */ }
}

export default function GoogleAnalytics({ pageTitle }) {
  const pathname = usePathname();

  // The default config page_view only fires once per document, so a client-side
  // locale switch (/en -> /zh) would be invisible. Send one page_view per URL,
  // with the title from the server because document.title lands a tick later.
  useEffect(() => {
    if (!analyticsEnabled) return;
    track('page_view', { page_path: pathname, page_location: window.location.href,
      page_title: pageTitle || document.title });
  }, [pathname, pageTitle]);

  if (!analyticsEnabled) return null;

  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
    <Script id="google-analytics" strategy="afterInteractive">
      {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${measurementId}',{send_page_view:false,anonymize_ip:true})`}
    </Script>
  </>;
}
