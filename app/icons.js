export function Icon({ name, size = 20, ...props }) {
  const paths = {
    sound: <path d="M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />,
    mute: <path d="M11 4 6 8H3v8h3l5 4ZM16 9l5 6m0-6-5 6" />,
    spark: <path d="m13 2-9 12h7l-1 8L21 9h-8Z" />,
    trophy: <path d="M7 3h10v6a5 5 0 0 1-10 0Zm5 11v6m-5 1h10M7 5H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5" />,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" /></>,
    plus: <path d="M12 4v16M4 12h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" /></>,
    key: <><circle cx="8" cy="9" r="5" /><path d="m12 13 8 8m-5-5 3-3m0 6 3-3" /></>,
    github: <path fill="currentColor" stroke="none" d="M12 2C6.48 2 2 6.58 2 12.25c0 4.52 2.87 8.35 6.84 9.71.5.09.68-.22.68-.5 0-.24-.01-.89-.01-1.75-2.78.62-3.37-1.37-3.37-1.37-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.12.63-1.37-2.22-.26-4.55-1.14-4.55-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 7.07c.85 0 1.7.12 2.5.35 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.5A10.04 10.04 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export function Hand({ move, size = 100, className = '', ...props }) {
  return <img className={`hand-art ${className}`} src={`/art/${move || 'rock'}.svg`} width={size} height={size} alt="" draggable="false" {...props} />;
}

export function Mascot({ mood = 'idle', className = '', ...props }) {
  return <svg className={`mascot mascot-${mood} ${className}`} viewBox="0 0 200 210" fill="none" aria-hidden="true" {...props}>
    <g stroke="#252522" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M84 45 78 29" /><path d="m75 10 6 9 11 1-8 7 2 11-10-5-10 5 2-11-8-7 11-1Z" fill="#f8d45a" />
      <path d="M48 115C21 101 17 128 31 136l23 5" fill="#4663ed" />
      <path className="mascot-arm" d="m151 108 14-18c7-9 20-2 16 8l-14 32-16 6" fill="#4663ed" />
      <path d="m69 167-3 13c-21 2-24 17-7 18h26l7-27m29-4 3 15c22-1 27 13 11 16h-28l-4-24" fill="#252522" />
      <path d="M45 94c0-31 16-51 54-51s57 22 57 54v44c0 23-22 34-56 34s-55-11-55-35Z" fill="#4663ed" />
      <path d="M139 78c6 13 7 32 7 59 0 16-19 26-48 27" stroke="#2e45b2" strokeWidth="9" />
      <path d="M62 77c6-10 18-16 32-16" stroke="#9eafff" strokeWidth="5" />
      <g className="mascot-eyes">
        <rect x="62" y="83" width="32" height="39" rx="15" fill="#fff8e4" />
        <rect x="104" y="83" width="32" height="39" rx="15" fill="#fff8e4" />
        <ellipse className="mascot-pupil" cx="82" cy="103" rx="5" ry="8" fill="#252522" stroke="none" />
        <ellipse className="mascot-pupil" cx="124" cy="103" rx="5" ry="8" fill="#252522" stroke="none" />
      </g>
      {mood === 'lose' ? <path d="M89 143q10-9 21 0" /> : mood === 'thinking' ? <ellipse cx="101" cy="142" rx="6" ry="4" fill="#252522" /> : <path d="M86 139q15 16 29-2" />}
      <path d="m57 131 8 2m68-2 8-2" stroke="#b6c2ff" strokeWidth="4" />
    </g>
  </svg>;
}

export function Star({ className = '', ...props }) {
  return <svg className={className} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" {...props}><path d="m50 0 9 31 27-17-17 27 31 9-31 9 17 27-27-17-9 31-9-31-27 17 17-27L0 50l31-9-17-27 27 17Z" /></svg>;
}
