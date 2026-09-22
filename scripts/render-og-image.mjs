import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'tmp', 'og-image.html');
const out2x = join(root, 'tmp', 'og-image@2x.png');

const star = (cls, color, size) =>
  `<div class="${cls}"><svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="${color}"><path d="m50 0 9 31 27-17-17 27 31 9-31 9 17 27-27-17-9 31-9-31-27 17 17-27L0 50l31-9-17-27 27 17Z"/></svg></div>`;

const handCards = ['rock', 'paper', 'scissors']
  .map(
    (name) => `
      <div class="hand-card hand-card-${name}">
        <img src="../public/art/${name}.svg" alt="" width="168" height="168" />
      </div>`
  )
  .join('');

const mascotSvg = `
<svg viewBox="0 0 200 210" fill="none" aria-hidden="true">
  <g stroke="#252522" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M84 45 78 29" /><path d="m75 10 6 9 11 1-8 7 2 11-10-5-10 5 2-11-8-7 11-1Z" fill="#f8d45a" />
    <path d="M48 115C21 101 17 128 31 136l23 5" fill="#4663ed" />
    <path d="m151 108 14-18c7-9 20-2 16 8l-14 32-16 6" fill="#4663ed" />
    <path d="m69 167-3 13c-21 2-24 17-7 18h26l7-27m29-4 3 15c22-1 27 13 11 16h-28l-4-24" fill="#252522" />
    <path d="M45 94c0-31 16-51 54-51s57 22 57 54v44c0 23-22 34-56 34s-55-11-55-35Z" fill="#4663ed" />
    <path d="M139 78c6 13 7 32 7 59 0 16-19 26-48 27" stroke="#2e45b2" stroke-width="9" />
    <path d="M62 77c6-10 18-16 32-16" stroke="#9eafff" stroke-width="5" />
    <rect x="62" y="83" width="32" height="39" rx="15" fill="#fff8e4" />
    <rect x="104" y="83" width="32" height="39" rx="15" fill="#fff8e4" />
    <ellipse cx="82" cy="103" rx="5" ry="8" fill="#252522" stroke="none" />
    <ellipse cx="124" cy="103" rx="5" ry="8" fill="#252522" stroke="none" />
    <path d="M86 139q15 16 29-2" />
    <path d="m57 131 8 2m68-2 8-2" stroke="#b6c2ff" stroke-width="4" />
  </g>
</svg>`;

const COPY = {
  en: {
    eyebrow: 'ROCK · PAPER · RIVAL',
    titleLead: 'Jev ',
    titleRival: 'RPS',
    tagline: '<b>AI moves first</b>, then you play.<br />Every round is verifiable.',
    lang: 'en',
  },
  zh: {
    eyebrow: 'ROCK · PAPER · RIVAL',
    titleLead: 'Jev ',
    titleRival: '对拳',
    tagline: '<b>AI 先出拳</b>，你再选择。<br />每一局都可核验。',
    lang: 'zh-CN',
  },
};

function renderHtml(copy) {
  return `<!DOCTYPE html>
<html lang="${copy.lang}">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Manrope';
    src: url('../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2') format('woff2');
    font-weight: 200 800;
    font-style: normal;
    font-display: block;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative;
    font-family: 'Manrope', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    color: #252522;
    background:
      radial-gradient(#25252214 1.2px, transparent 1.4px) 0 0 / 22px 22px,
      #f7f3e8;
    -webkit-font-smoothing: antialiased;
  }

  .blob-peach {
    position: absolute; left: -90px; bottom: -140px;
    width: 560px; height: 340px; background: #ffdfcd;
    border-radius: 60% 55% 48% 52% / 58% 46% 54% 42%;
    transform: rotate(-8deg);
  }
  .blob-sky {
    position: absolute; right: -70px; top: -110px;
    width: 480px; height: 320px; background: #e7ebff;
    border-radius: 46% 54% 58% 42% / 52% 44% 56% 48%;
    transform: rotate(6deg);
  }

  .frame {
    position: absolute; inset: 40px;
    background: #fffdf7;
    border: 3px solid #252522;
    border-radius: 22px;
    box-shadow: 12px 12px 0 #252522;
    overflow: hidden;
    display: flex;
  }
  .frame::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(#25252209 1px, transparent 1.4px) 0 0 / 14px 14px;
    pointer-events: none;
  }

  .copy {
    position: relative; z-index: 2;
    flex: 1 1 56%;
    padding: 64px 28px 56px 66px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .eyebrow {
    display: inline-flex; align-items: center; gap: 12px;
    align-self: flex-start;
    padding: 10px 20px;
    background: #f8d45a;
    border: 2.5px solid #252522;
    border-radius: 999px;
    box-shadow: 4px 4px 0 #252522;
    font-size: 17px; font-weight: 800; letter-spacing: .22em;
    transform: rotate(-1.5deg);
  }
  h1 {
    margin-top: 30px;
    font-size: 112px; line-height: 1.04;
    font-weight: 800; letter-spacing: -.045em;
    display: flex; align-items: baseline;
  }
  h1 .rival { position: relative; color: #ec563a; margin-left: 14px; }
  h1 .rival::after {
    content: '';
    position: absolute; left: 2%; bottom: -6px;
    width: 96%; height: 12px;
    background: #252522;
    border-radius: 50%;
    transform: rotate(-1.6deg);
  }
  .tagline {
    margin-top: 34px;
    font-size: 30px; line-height: 1.55; font-weight: 600;
    color: #4c4940;
    letter-spacing: .01em;
  }
  .tagline b { color: #252522; font-weight: 800; }

  .visual {
    position: relative; z-index: 1;
    flex: 0 0 44%;
    background: linear-gradient(104deg, #ffeadb 0 49.6%, #e9edff 50.2%);
    border-left: 3px solid #252522;
    overflow: hidden;
  }
  .visual::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(#25252212 1.2px, transparent 1.5px) 0 0 / 16px 16px;
    opacity: .5;
  }

  .stamp {
    position: absolute; left: 58%; top: 52%;
    width: 290px; height: 290px;
    margin: -145px 0 0 -145px;
    background: #f8d45a;
    border: 3px solid #252522;
    border-radius: 50%;
    outline: 2px dashed #252522;
    outline-offset: -14px;
    transform: rotate(-12deg);
    box-shadow: 8px 8px 0 #25252266;
    z-index: 1;
  }

  .hands { position: absolute; inset: 0; z-index: 2; }
  .hand-card {
    position: absolute;
    width: 190px; height: 190px;
    background: #fffdf7;
    border: 3px solid #252522;
    border-radius: 22px;
    box-shadow: 7px 8px 0 #252522;
    display: grid; place-items: center;
  }
  .hand-card img { width: 164px; height: 164px; display: block; }
  .hand-card-rock     { left: 40px;  top: 58px;  transform: rotate(-10deg); z-index: 3; }
  .hand-card-paper    { left: 168px; top: 196px; transform: rotate(4deg);   z-index: 4; }
  .hand-card-scissors { left: 48px;  top: 322px; transform: rotate(-4deg);  z-index: 5; }

  .mascot {
    position: absolute; right: -30px; bottom: -18px;
    width: 210px; height: 220px;
    transform: rotate(8deg);
    z-index: 6;
    filter: drop-shadow(5px 6px 0 #25252233);
  }
  .mascot svg { width: 100%; height: 100%; display: block; }

  .vs-badge {
    position: absolute; z-index: 7;
    right: 40px; top: 42px;
    width: 92px; height: 92px;
    background: #fffdf7;
    border: 3px solid #252522;
    border-radius: 50%;
    box-shadow: 5px 5px 0 #252522;
    display: grid; place-items: center;
    transform: rotate(-8deg);
    font-size: 36px; font-weight: 800; font-style: italic; letter-spacing: -.06em;
    color: #ec563a;
  }

  .star-a { position: absolute; left: 44%; top: 28px; z-index: 3; transform: rotate(12deg); }
  .star-b { position: absolute; right: 24px; top: 196px; z-index: 3; transform: rotate(-10deg); }
  .star-c { position: absolute; left: 22px; bottom: 18px; z-index: 3; transform: rotate(6deg); }
  .spark { position: absolute; z-index: 3; }
  .spark-1 { right: 148px; top: 30px; }
  .spark-2 { left: 26px; top: 276px; }

  .corner-dots {
    position: absolute; left: 66px; bottom: 42px; z-index: 2;
    display: flex; gap: 10px;
  }
  .corner-dots span {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid #252522;
  }
  .corner-dots span:nth-child(1) { background: #ec563a; }
  .corner-dots span:nth-child(2) { background: #4663ed; }
  .corner-dots span:nth-child(3) { background: #f8d45a; }
</style>
</head>
<body>
  <div class="blob-peach"></div>
  <div class="blob-sky"></div>

  <div class="frame">
    <section class="copy">
      <span class="eyebrow">${copy.eyebrow}</span>
      <h1>${copy.titleLead}<span class="rival">${copy.titleRival}</span></h1>
      <p class="tagline">${copy.tagline}</p>
      <div class="corner-dots"><span></span><span></span><span></span></div>
    </section>

    <section class="visual">
      <div class="stamp"></div>

      <div class="hands">${handCards}</div>

      <div class="vs-badge">VS</div>

      ${star('star-a', '#f8d45a', 56)}
      ${star('star-b', '#4663ed', 40)}
      ${star('star-c', '#ec563a', 34)}

      <svg class="spark spark-1" width="44" height="44" viewBox="0 0 100 100" fill="#f8d45a" stroke="#252522" stroke-width="5" stroke-linejoin="round"><path d="m50 6 8 28 24-15-15 24 28 8-28 8 15 24-24-15-8 28-8-28-24 15 15-24-28-8 28-8-15-24 24 15Z"/></svg>
      <svg class="spark spark-2" width="34" height="34" viewBox="0 0 100 100" fill="#ec563a" stroke="#252522" stroke-width="5" stroke-linejoin="round"><path d="m50 6 8 28 24-15-15 24 28 8-28 8 15 24-24-15-8 28-8-28-24 15 15-24-28-8 28-8-15-24 24 15Z"/></svg>

      <div class="mascot">${mascotSvg}</div>
    </section>
  </div>
</body>
</html>`;
}

mkdirSync(join(root, 'tmp'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});

for (const [locale, copy] of Object.entries(COPY)) {
  const out = locale === 'en'
    ? join(root, 'public', 'og-image.png')
    : join(root, 'public', `og-image.${locale}.png`);
  writeFileSync(htmlPath, renderHtml(copy));
  await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out2x });
  execFileSync('sips', ['-z', '630', '1200', out2x, '--out', out], { stdio: 'pipe' });
  console.log(`wrote ${out}`);
}

await browser.close();
