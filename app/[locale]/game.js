'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation.js';
import { MOVES, NAMES, MAX_ROUNDS, statsFor, commitmentText } from '../../lib/protocol.js';
import { digest, historyContext, verifyProof, verifyReceipt } from '../../lib/proof.js';
import { STORAGE_KEY, LOCK_KEY, freshState, readState, writeState } from '../../lib/browser-store.js';
import { Icon, Hand, Mascot, Star } from '../icons.js';
import { createSoundPlayer } from '../../lib/sound.js';
import { track } from '../google-analytics.js';

const EMPTY = { history: [], archives: [], pending: null };
const percent = value => value === null ? '—' : `${value.toFixed(1)}%`;
const ONBOARDING_STEPS = [0, 1, 2];

function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function codedError(code, fallback) {
  const error = new Error(fallback);
  error.code = code;
  return error;
}

export default function Game() {
  const t = useTranslations();
  const locale = useLocale();
  const [game, setGame] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [filter, setFilter] = useState('blind');
  const [proof, setProof] = useState(null);
  const [proofStatus, setProofStatus] = useState('');
  const [historyLimit, setHistoryLimit] = useState(12);
  const [archiveId, setArchiveId] = useState('current');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [soundOn, setSoundOn] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [systemReduced, setSystemReduced] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const onboardingButtonRef = useRef(null);
  const busyRef = useRef(false);
  const keyRef = useRef(null);
  const proofRef = useRef(null);
  const proofTrigger = useRef(null);
  const settingsRef = useRef(null);
  const settingsTrigger = useRef(null);
  const startAfterSetup = useRef(false);
  const soundRef = useRef(null);
  const soundEnabled = useRef(false);
  const soundAttempt = useRef(0);
  const firstMoveRef = useRef(null);
  const mainButtonRef = useRef(null);
  const focusIntent = useRef(null);

  const moveName = (move) => (move ? t(`Moves.${move}`) : '');
  const showErr = (e) => {
    if (e?.code && t.has(`Errors.${e.code}`)) return t(`Errors.${e.code}`, { status: e.status ?? '' });
    return e?.message || t('Errors.generic');
  };

  async function callApi(body, key) {
    let response;
    try {
      response = await fetch('/api/game', { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(body), signal: AbortSignal.timeout(55000),
      });
    } catch { throw codedError('network', t('Errors.network')); }
    let data;
    try { data = await response.json(); } catch { throw codedError('badJson', t('Errors.badJson')); }
    if (!response.ok) {
      const err = codedError(data.code || 'generic', data.error || t('Errors.generic'));
      err.status = response.status;
      throw err;
    }
    return data;
  }

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        if (!crypto.subtle || !navigator.locks) throw codedError('insecureBrowser', t('Errors.insecureBrowser'));
        await navigator.locks.request(LOCK_KEY, async () => {
          const value = readState() || writeState(freshState());
          if (mounted) setGame(value);
        });
      } catch (e) { if (mounted) { setError(showErr(e)); setFatal(true); } }
    };
    initialize();
    const sync = event => {
      if (event.key === STORAGE_KEY || event.key === null) {
        try {
          const state = readState();
          if (!state) throw codedError('clearedOtherTab', t('Errors.clearedOtherTab'));
          setGame(state); setNotice(t('Notices.tabSync'));
        } catch (e) { setError(showErr(e)); setFatal(true); }
      }
    };
    window.addEventListener('storage', sync);
    return () => { mounted = false; window.removeEventListener('storage', sync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (proof) proofRef.current?.showModal();
    else proofRef.current?.close();
  }, [proof]);

  useEffect(() => {
    if (settings) { settingsRef.current?.showModal(); keyRef.current?.focus(); }
    else settingsRef.current?.close();
  }, [settings]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    update(); media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
      soundEnabled.current = false;
      soundAttempt.current += 1;
      soundRef.current?.close().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!game || game.history.length || localStorage.getItem('jev:rps:onboarding/v1')) return;
    setOnboardingStep(0);
    setShowOnboarding(true);
  }, [game]);

  useEffect(() => {
    if (!showOnboarding) return;
    onboardingButtonRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [showOnboarding, onboardingStep]);

  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 800);
    return () => clearTimeout(timer);
  }, [celebration]);

  useEffect(() => {
    if (!busy && focusIntent.current && !settings && !proof) {
      const target = focusIntent.current === 'choose' ? firstMoveRef.current : mainButtonRef.current;
      target?.focus({ preventScroll: true });
      focusIntent.current = null;
    }
  }, [busy, game, settings, proof]);

  function playSound(event) {
    if (soundEnabled.current) { try { soundRef.current?.play(event); } catch {} }
  }

  function wakeSound() {
    if (soundEnabled.current) { try { soundRef.current?.resume().catch(() => {}); } catch {} }
  }

  async function toggleSound() {
    const enabled = !soundEnabled.current;
    const attempt = ++soundAttempt.current;
    soundEnabled.current = enabled; setSoundOn(enabled);
    try {
      if (!enabled) { soundRef.current?.mute(true); return; }
      soundRef.current ||= createSoundPlayer();
      soundRef.current.mute(false);
      await soundRef.current.resume();
      if (attempt === soundAttempt.current && soundEnabled.current) playSound('click');
    } catch {
      if (attempt === soundAttempt.current) {
        soundEnabled.current = false; setSoundOn(false);
        setNotice(t('Notices.soundUnavailable'));
      }
    }
  }

  function openSettings(event, start = false) {
    settingsTrigger.current = event?.currentTarget || document.activeElement;
    startAfterSetup.current = start;
    setConnectionError(''); setSettings(true);
  }

  function closeSettings() {
    settingsRef.current?.close(); setSettings(false); setShowKey(false);
    settingsTrigger.current?.focus({ preventScroll: true });
  }

  function finishOnboarding() {
    localStorage.setItem('jev:rps:onboarding/v1', 'done');
    setShowOnboarding(false);
  }

  function advanceOnboarding() {
    if (onboardingStep === ONBOARDING_STEPS.length - 1) finishOnboarding();
    else setOnboardingStep(step => step + 1);
  }

  function submitConnection(event) {
    event.preventDefault();
    if (apiKey.trim().length < 8) {
      setConnectionError(t('Errors.keyRequired')); keyRef.current?.focus(); return;
    }
    closeSettings();
    track('jev_connect', { mode: startAfterSetup.current ? 'connect_and_start' : 'save_key' });
    if (startAfterSetup.current) prepare();
    else setNotice(t('Notices.keySaved'));
  }

  function save(value) {
    const next = writeState(value);
    setGame(next);
    return next;
  }

  async function operate(kind, operation) {
    if (busyRef.current || fatal) return;
    busyRef.current = true; setBusy(kind); setError(''); setNotice('');
    try {
      await navigator.locks.request(LOCK_KEY, { ifAvailable: true }, async lock => {
        if (!lock) throw codedError('lockedOtherTab', t('Errors.lockedOtherTab'));
        const current = readState();
        if (!current) throw codedError('localCleared', t('Errors.localCleared'));
        setGame(current);
        await operation(current);
      });
    } catch (e) { setError(showErr(e)); }
    finally { busyRef.current = false; setBusy(''); }
  }

  function prepare(event) {
    event?.preventDefault();
    if (apiKey.trim().length < 8) { openSettings(event, true); return; }
    wakeSound(); setCelebration(null);
    operate('prepare', async current => {
      if (current.pending) return;
      const result = await callApi({ action: 'prepare', history: current.history, series: current.series }, apiKey.trim());
      const expectedContext = await digest(JSON.stringify(historyContext(current.history)));
      if (result.number !== current.history.length + 1 || result.contextCount !== current.history.length
        || result.contextHash !== expectedContext || !/^[a-f0-9]{64}$/.test(result.commitment)
        || typeof result.sealedRound !== 'string' || typeof result.id !== 'string' || typeof result.model !== 'string') {
        throw codedError('roundMismatch', t('Errors.roundMismatch'));
      }
      save({ ...current, pending: { ...result, peeked: false, player: null, proof: null } });
      // Outcome-level only: the sealed token, the commitment and Jev's move stay local.
      track('jev_round_prepared', { round_number: result.number, latency_ms: result.latencyMs });
      focusIntent.current = 'choose'; playSound('ready');
    });
  }

  function reveal() {
    wakeSound();
    operate('reveal', async current => {
      if (!current.pending || current.pending.player || current.pending.proof) return;
      current = save({ ...current, pending: { ...current.pending, peeked: true } });
      const result = await callApi({ action: 'reveal', sealedRound: current.pending.sealedRound });
      await verifyProof(result.proof, current.pending, current.series);
      if (result.commitment !== current.pending.commitment || typeof result.sealedRound !== 'string') {
        throw codedError('revealInvalid', t('Errors.revealInvalid'));
      }
      save({ ...current, pending: { ...current.pending, proof: result.proof, sealedRound: result.sealedRound } });
      focusIntent.current = 'choose'; playSound('reveal');
    });
  }

  function choose(move) {
    wakeSound();
    operate('resolve', async current => {
      if (!current.pending) return;
      if (current.pending.player && current.pending.player !== move) return;
      current = save({ ...current, pending: { ...current.pending, player: move } });
      playSound('click');
      const result = await callApi({ action: 'resolve', sealedRound: current.pending.sealedRound,
        player: current.pending.player, peeked: current.pending.peeked });
      await verifyReceipt(result, current.pending, current.series, current.history);
      save({ ...current, history: [...current.history, result.receipt], pending: null });
      // Never the moves, never the key: just who won and whether the cover was lifted.
      track('jev_round_resolved', { round_number: result.receipt.record.number,
        result: result.receipt.record.result, peeked: result.receipt.record.peeked });
      setCelebration({ id: result.receipt.record.id, result: result.receipt.record.result });
      focusIntent.current = 'next'; playSound(result.receipt.record.result);
    });
  }

  function newSeries() {
    operate('archive', async current => {
      if (current.pending) throw codedError('finishFirst', t('Errors.finishFirst'));
      if (!current.history.length) return;
      const archived = { series: current.series, history: current.history, archivedAt: new Date().toISOString() };
      save({ ...freshState(), archives: [...current.archives, archived] });
      track('jev_series_started', { archived_rounds: archived.history.length });
      setArchiveId('current'); setHistoryLimit(12); setNotice(t('Notices.newSeries'));
    });
  }

  function exportHistory() {
    try {
      const value = readState();
      downloadJson({ format: 'jev-duel-export/v1', exportedAt: new Date().toISOString(),
        verification: 'SHA-256 of UTF-8 JSON.stringify(["jev-rps/v1",series,id,number,model,contextHash,move,nonce,preparedAt])',
        game: value }, `jev-duel-${new Date().toISOString().slice(0, 10)}.json`);
      track('jev_history_exported', { rounds: value.history.length, archives: value.archives.length });
    } catch { downloadJson({ raw: localStorage.getItem(STORAGE_KEY) }, 'jev-duel-recovery.json'); }
  }

  function inspect(record, event) {
    proofTrigger.current = event.currentTarget; setProofStatus(''); setProof(record);
    track('jev_proof_opened', { round_number: record.number, peeked: record.peeked });
  }
  function closeProof() { setProof(null); proofTrigger.current?.focus(); }
  async function recheck() {
    try {
      await verifyProof(proof, proof, proof.series);
      setProofStatus(t('Proof.ok'));
      track('jev_proof_reverified', { verified: true });
    } catch (e) { setProofStatus(showErr(e)); track('jev_proof_reverified', { verified: false }); }
  }

  const current = game || EMPTY;
  const pending = current.pending;
  const previousRound = current.history.at(-1)?.record;
  const last = !pending ? previousRound : null;
  const roundNumber = pending?.number || last?.number || 1;
  const canChoose = !!pending && !pending.player && !busy && !fatal;
  const revealedMove = pending?.proof?.move || last?.move;
  const playerMove = pending?.player || last?.player;
  const stats = statsFor(current.history, filter === 'blind');
  const capReached = current.history.length >= MAX_ROUNDS;
  const archived = current.archives.find(a => a.series === archiveId);
  const history = archived?.history || current.history;
  const disabled = !game || !!busy || fatal;
  const ready = !!pending && !pending.player;
  const hasKey = apiKey.trim().length >= 8;
  const quietMotion = systemReduced || reducedMotion;
  const phase = busy === 'prepare' ? 1 : pending ? (pending.player ? 3 : 2) : last ? 3 : 0;
  const status = busy === 'prepare' ? t('Status.preparing') : busy === 'resolve' ? t('Status.resolving')
    : busy === 'reveal' ? t('Status.revealing') : pending?.player ? t('Status.lockedRetry')
    : pending?.proof ? t('Status.peekedGo') : ready ? t('Status.yourTurn')
    : last ? t(`Results.${last.result}`) : t('Status.firstRound');
  const mainLabel = busy === 'prepare' ? t('Main.preparing') : busy === 'resolve' ? t('Main.resolving')
    : pending?.player ? t('Main.retryResolve') : capReached ? t('Main.newSeries') : last ? t('Main.again')
    : hasKey ? t('Main.start') : t('Main.connect');
  const jevMood = busy === 'prepare' ? 'thinking' : last?.result === 'human' ? 'lose' : 'idle';
  const nextNumber = busy === 'prepare' ? current.history.length + 1 : roundNumber;
  const stepLabels = [t('Round.steps.jev'), t('Round.steps.you'), t('Round.steps.reveal')];

  function advance(event) {
    if (pending?.player) choose(pending.player);
    else if (capReached) newSeries();
    else prepare(event);
  }

  useEffect(() => {
    const onKey = event => {
      if (showOnboarding) {
        if (event.key === 'Escape') finishOnboarding();
        else if (event.key === 'Enter' || event.key === 'ArrowRight') { event.preventDefault(); advanceOnboarding(); }
        else if (event.key === 'ArrowLeft' && onboardingStep > 0) { event.preventDefault(); setOnboardingStep(step => step - 1); }
        return;
      }
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing
        || document.querySelector('dialog[open]')
        || event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const move = MOVES[Number(event.key) - 1];
      if (canChoose && move) { event.preventDefault(); choose(move); }
      else if (event.key === 'Enter' && !disabled && (!pending || pending.player)
        && !event.target.closest?.('button, a, summary, [role="button"]')) {
        event.preventDefault(); advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const slide = t.raw(`Onboarding.slides.${onboardingStep}`);

  return (
    <div className={`site-shell ${quietMotion ? 'reduced-motion' : ''}`}>
      <a className="skip-link" href="#play">{t('Skip.play')}</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label={t('Brand.homeAria')}><img className="brand-mark" src="/icon.svg" alt="" /><span>{t('Brand.name')}<small>{t('Brand.tagline')}</small></span></Link>
        <nav aria-label={t('Nav.primary')}><a className="history-link" href="#history">{t('Nav.history')}<Icon name="arrow" size={16} /></a><a className="github-link" href="https://github.com/0xlau/jev-rps" target="_blank" rel="noopener noreferrer"><Icon name="github" size={17} /><span>{t('Nav.github')}</span></a><button className={`connection-button ${hasKey ? 'has-key' : ''}`} onClick={event => openSettings(event)}><Icon name="key" size={17} /><span>{hasKey ? t('Nav.keyReady') : t('Nav.connect')}</span></button></nav>
      </header>
      <main>
        <section className="intro" aria-labelledby="game-title">
          <div><h1 id="game-title">{t('Intro.titleA')}<span>{t('Intro.titleB')}</span><Star className="title-star" /></h1></div>
          <div className="intro-stamp" aria-label={t('Intro.stampAria')}><Icon name="shield" size={23} /><strong>{t('Intro.stampTop')}<br />{t('Intro.stampBottom')}</strong></div>
        </section>
        <div className="game-layout">
          <section className={`play-panel phase-${phase}`} id="play" aria-label={t('Court.label')} aria-busy={!!busy}>
            <div className="round-bar"><span className="round-number">{t('Round.label')} <strong>{String(nextNumber).padStart(2, '0')}</strong></span><ol className="round-steps" aria-label={t('Round.progress')}>{stepLabels.map((label, i) => <li key={label} className={phase === i + 1 ? 'current' : phase > i + 1 ? 'done' : ''} aria-current={phase === i + 1 ? 'step' : undefined}><span>{phase > i + 1 ? <Icon name="check" size={12} /> : i + 1}</span>{label}</li>)}</ol></div>
            <div className={`court ${last ? 'outcome-' + last.result : ''}`}>
              <div className="opponent human-side">
                <div className="opponent-label"><span className="player-badge">{t('Court.youBadge')}</span><strong>{t('Court.you')}</strong><small>{t('Court.youFlair')}</small></div>
                <motion.div className={`hand-stage human-hand ${playerMove ? 'chosen' : ''}`} initial={quietMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, ease: [.2, .8, .2, 1] }}>
                  <span className="stage-orbit" aria-hidden="true" />
                  <Hand move={playerMove} size={190} key={playerMove || 'waiting'} />
                  {!playerMove && <span className="question-doodle" aria-hidden="true">?</span>}
                  <span className="hand-label">{playerMove ? moveName(playerMove) : t('Court.waiting')}</span>
                </motion.div>
              </div>
              <div className="versus" aria-hidden="true"><Star /><span>{t('Court.versus')}</span></div>
              <div className="opponent jev-side">
                <div className="opponent-label"><span className="player-badge">{t('Court.jevBadge')}</span><strong>{t('Court.jev')}</strong><small>{t('Court.jevFlair')}</small></div>
                <motion.div className={`hand-stage jev-hand ${revealedMove ? 'is-revealed' : ''}`} initial={quietMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, ease: [.2, .8, .2, 1] }}>
                  <span className="stage-orbit" aria-hidden="true" />
                  {revealedMove && <><Hand move={revealedMove} size={190} /><span className="hand-label">{moveName(revealedMove)}</span></>}
                  <motion.div className={`choice-cover ${revealedMove ? 'lifted' : ''}`} data-testid="choice-cover" aria-hidden={!!revealedMove} initial={false} animate={revealedMove ? { opacity: 0, rotateX: -95, y: -8 } : { opacity: 1, rotateX: 0, y: 0 }} transition={{ duration: quietMotion ? 0 : .42, ease: [.2, .8, .2, 1] }}>
                    <span className="cover-seal"><Icon name="lock" size={12} />{pending ? t('Cover.locked') : busy === 'prepare' ? t('Cover.thinking') : t('Cover.ready')}</span>
                    <Mascot mood={jevMood} />
                    <strong>{pending ? t('Cover.lockedLine') : busy === 'prepare' ? t('Cover.thinkingLine') : t('Cover.readyLine')}</strong>
                    <button className="peek-button" type="button" onClick={reveal} disabled={!canChoose || !!revealedMove} tabIndex={revealedMove ? -1 : 0}><Icon name="eye" size={16} />{busy === 'reveal' ? t('Cover.peeking') : pending?.peeked ? t('Cover.peekAgain') : t('Cover.peek')}<Icon name="chevron" size={13} /></button>
                  </motion.div>
                </motion.div>
              </div>
              {celebration && <motion.div className={'result-burst burst-' + celebration.result} key={celebration.id} aria-hidden="true" initial={quietMotion ? false : { opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: quietMotion ? 0 : .22 }}>{Array.from({ length: 8 }, (_, i) => <Star key={i} style={{ '--i': i }} />)}</motion.div>}
            </div>
            <div className="play-controls">
              {previousRound && <motion.div className="previous-round" data-testid="previous-round" aria-label={`${t('Round.previous')} #${previousRound.number}`} initial={quietMotion ? false : { opacity: 0, y: -7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: quietMotion ? 0 : .22 }}>
                <span className="previous-round-title">{t('Round.previous')} <b>#{previousRound.number}</b></span>
                <span className="previous-move"><Hand move={previousRound.player} size={25} />{t('Round.youThrew', { move: moveName(previousRound.player) })}</span>
                <span className="previous-move"><Hand move={previousRound.move} size={25} />{t('Round.jevThrew', { move: moveName(previousRound.move) })}</span>
                <strong className={`result-label ${previousRound.result}`}>{previousRound.result === 'draw' ? t('Results.draw') : t(`Results.${previousRound.result}`)}</strong>
                {previousRound.peeked && <small>{t('History.peeked')}</small>}
              </motion.div>}
              <div className={`round-message ${last && !busy ? 'result-' + last.result : ''}`} role="status" aria-atomic="true">
                <strong>{busy ? <span className="spinner" /> : last ? <Icon name={last.result === 'draw' ? 'refresh' : 'trophy'} size={24} /> : null}{status}</strong>
                <AnimatePresence mode="wait">
                  <motion.p key={status} initial={quietMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={quietMotion ? undefined : { opacity: 0, y: -5 }} transition={{ duration: quietMotion ? 0 : .18 }}>{busy === 'prepare' ? t('Status.analyzing') : last ? t('Status.roundDetail', { player: moveName(last.player), move: moveName(last.move) }) : pending?.peeked ? t('Status.peekedCounted') : pending ? t('Status.usedHistory') : t('Status.lockThenPlay')}</motion.p>
                </AnimatePresence>
              </div>
              <div className={`move-choices ${canChoose ? 'choices-ready' : ''}`} aria-label={t('Court.label')}>
                {MOVES.map((move, index) => <motion.button ref={index === 0 ? firstMoveRef : undefined} key={move} type="button" className={`move-button move-${move} ${playerMove === move ? 'selected' : ''}`} onClick={() => choose(move)} disabled={!canChoose} aria-label={`${moveName(move)}, ${index + 1}`} aria-keyshortcuts={String(index + 1)} whileHover={quietMotion ? undefined : { y: -5 }} whileTap={quietMotion ? undefined : { y: 3, scale: .98 }} transition={{ type: 'spring', stiffness: 430, damping: 24 }}><kbd aria-hidden="true">{index + 1}</kbd><Hand move={move} size={100} /><span>{moveName(move)}</span><small>{t('MovesBeats.' + move)}</small>{playerMove === move && <Icon className="selection-check" name="check" size={17} />}</motion.button>)}
              </div>
              {(!pending || pending.player) ? <div className="next-action"><button ref={mainButtonRef} className="primary-button" type="button" onClick={advance} disabled={disabled} aria-keyshortcuts="Enter">{busy ? <span className="spinner" /> : <Icon name={pending?.player ? 'refresh' : hasKey || last ? 'spark' : 'key'} size={20} />}{mainLabel}<Icon className="button-arrow" name="arrow" size={20} /></button><span className="action-hint">{capReached ? t('Hints.capReached') : last ? t('Hints.again') : t('Hints.needKey')}<kbd>{t('Hints.enter')}</kbd></span></div>
                : <p className="choice-hint"><span className="status-dot" />{t('Hints.yourTurn')}<span className="keyboard-hint">{t.rich('Hints.shortcuts', { key: chunks => <kbd>{chunks}</kbd> })}</span></p>}
              {error && <div className="error-message" role="alert"><Icon name="help" size={20} /><div><strong>{t('ErrorBanner.title')}</strong><p>{error}</p>{!pending && !fatal && <button className="text-button" onClick={event => openSettings(event)}>{t('ErrorBanner.fixKey')}<Icon name="arrow" size={14} /></button>}</div></div>}
              {previousRound?.strategy && <details className="behavior-readout"><summary>{t('Behavior.title')} <Icon name="chevron" size={13} /></summary>
                <div className="behavior-values">{[['regularity', t('Behavior.regularity')], ['cunning', t('Behavior.cunning')], ['tilt', t('Behavior.tilt')], ['adaptation', t('Behavior.adaptation')]].map(([key, label]) => {
                  const estimate = previousRound.strategy.behavior[key];
                  return <div key={key}><span>{label}</span><strong>{estimate.value === null ? t('Behavior.pending') : `${estimate.value}/100`}</strong></div>;
                })}</div><p>{t('Behavior.note', { number: previousRound.number, blind: previousRound.strategy.blindRounds })}</p>
              </details>}
            </div>
            <div className="commitment-strip"><Icon name="shield" size={17} />
              {pending ? <><span>{t('Commitment.sealed')} <code>{pending.commitment.slice(0, 10)}…</code></span><details className="commitment-details"><summary>{t('Commitment.view')}</summary><p>{t('Commitment.explain')}</p><code>{pending.commitment}</code><p>{t('Commitment.usedContext', { count: pending.contextCount, model: pending.model })}</p><code>{t('Commitment.contextHash', { hash: pending.contextHash })}</code></details></>
                : last ? <><span>{t('Commitment.passed')}</span><button className="text-button" onClick={event => inspect(last, event)}>{t('Commitment.viewProof')}<Icon name="arrow" size={14} /></button></>
                : <><span>{t('Commitment.blurb')}</span><a href={`#${t('Fairness.id')}`}>{t('Commitment.rules')}<Icon name="arrow" size={14} /></a></>}
            </div>
          </section>
          <aside className="sidebar">
            <section className="scoreboard" aria-label={t('Scoreboard.subtitle')}>
              <div className="ticket-heading"><Icon name="trophy" size={19} /><span>{t('Scoreboard.heading')}</span><span>No. {String(current.archives.length + 1).padStart(3, '0')}</span></div>
              <div className="section-title"><h2>{t('Scoreboard.title')}</h2><span>{t('Scoreboard.subtitle')}</span></div>
              <div className="segmented" aria-label={t('Scoreboard.scope')}><button onClick={() => setFilter('blind')} aria-pressed={filter === 'blind'}>{t('Scoreboard.blind')}</button><button onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>{t('Scoreboard.all')}</button></div>
              <div className="score-tally"><div><span>{t('Scoreboard.you')}</span><strong>{stats.human}</strong><small>{t('Scoreboard.wins')}</small></div><span className="score-colon">:</span><div><span>{t('Scoreboard.jev')}</span><strong>{stats.jev}</strong><small>{t('Scoreboard.wins')}</small></div></div>
              <div className="score-line human-score"><div><span><i />{t('Scoreboard.yourRate')}</span><strong data-testid="human-rate">{percent(stats.humanRate)}</strong></div><meter min="0" max="100" value={stats.humanRate ?? 0} aria-label={t('Scoreboard.yourRate')} /></div>
              <div className="score-line jev-score"><div><span><i />{t('Scoreboard.jevRate')}</span><strong data-testid="jev-rate">{percent(stats.jevRate)}</strong></div><meter min="0" max="100" value={stats.jevRate ?? 0} aria-label={t('Scoreboard.jevRate')} /></div>
              <div className="score-footnote"><span>{t('Scoreboard.total')}<b>{stats.total}</b></span><span>{t('Scoreboard.draws')}<b>{stats.draws}</b></span><span>{t('Scoreboard.peeks')}<b>{stats.peeked}</b></span></div>
              <p className="fine-print">{t('Scoreboard.finePrint')}</p>
              <div className="ticket-perforation" aria-hidden="true" />
              <div className="recent-rounds"><span>{t('Scoreboard.recent')}</span><div>{current.history.length ? current.history.slice(-5).map(({ record }) => <button key={record.id} className={'recent-dot ' + record.result} onClick={event => inspect(record, event)} aria-label={t('Scoreboard.recentAria', { number: record.number, result: t(`Results.${record.result}`), peeked: record.peeked ? t('Scoreboard.peekedSuffix') : '' })}>{t(`ResultsShort.${record.result}`)}{record.peeked && <Icon name="eye" size={9} />}</button>) : <span className="no-rounds">{t('Scoreboard.noRounds')}</span>}</div></div>
            </section>
            <section className="rival-note" aria-label={t('Rival.aria')}><div><span className="eyebrow">{t('Rival.eyebrow')}</span><h2>{t('Rival.titleA')}<br />{t('Rival.titleB')}</h2></div><Mascot mood={jevMood} /><span className="note-scribble" aria-hidden="true">{t('Rival.scribble')}</span></section>
            <div className="comfort-controls" aria-label={t('Comfort.aria')}><button onClick={toggleSound} aria-pressed={soundOn}><Icon name={soundOn ? 'sound' : 'mute'} size={17} />{soundOn ? t('Comfort.soundOn') : t('Comfort.soundOff')}</button><button onClick={() => setReducedMotion(!reducedMotion)} aria-pressed={quietMotion} disabled={systemReduced} title={systemReduced ? t('Comfort.motionSystem') : undefined}><Icon name="spark" size={16} />{quietMotion ? t('Comfort.motionQuiet') : t('Comfort.motionReduce')}</button></div>
          </aside>
        </div>
        {notice && <p className="notice" role="status"><Icon name="check" size={16} />{notice}</p>}
        <section className="history-section" id="history">
          <div className="history-heading"><div><span className="eyebrow">{t('History.eyebrow')}</span><h2>{t('History.title')}</h2></div><div className="history-actions"><button className="secondary-button" onClick={exportHistory} disabled={!game && !fatal}><Icon name="download" size={17} />{t('History.export')}</button><button className="secondary-button" onClick={newSeries} disabled={disabled || !!pending || !current.history.length}><Icon name="plus" size={17} />{t('History.newSeries')}</button></div></div>
          {current.archives.length > 0 && <label className="archive-filter">{t('History.filter')}<select value={archiveId} onChange={event => { setArchiveId(event.target.value); setHistoryLimit(12); }}><option value="current">{t('History.optionCurrent', { count: current.history.length })}</option>{current.archives.map((archive, index) => <option value={archive.series} key={archive.series}>{t('History.optionArchive', { index: index + 1, count: archive.history.length, date: new Date(archive.archivedAt).toLocaleDateString(locale) })}</option>)}</select></label>}
          <div className="history-table-wrap"><table><caption className="sr-only">{t('History.caption')}</caption><thead><tr><th scope="col">{t('History.colNumber')}</th><th scope="col">{t('History.colPlayer')}</th><th scope="col">{t('History.colJev')}</th><th scope="col">{t('History.colResult')}</th><th scope="col">{t('History.colMode')}</th><th scope="col">{t('History.colProof')}</th></tr></thead><tbody>{[...history].reverse().slice(0, historyLimit).map(({ record }) => <tr key={record.id}><td className="number-cell">{String(record.number).padStart(2, '0')}</td><td><span className="table-move"><Hand move={record.player} size={23} />{moveName(record.player)}</span></td><td><span className="table-move"><Hand move={record.move} size={23} />{moveName(record.move)}</span></td><td><span className={`result-label ${record.result}`}>{t(`Results.${record.result}`)}</span></td><td><span className="play-mode">{record.peeked ? <Icon name="eye" size={15} /> : <Icon name="lock" size={14} />}{record.peeked ? t('History.peeked') : t('History.blind')}</span></td><td><button className="proof-button" onClick={event => inspect(record, event)} aria-label={t('History.viewProofAria', { number: record.number })}><Icon name="shield" size={17} /><span>{t('History.view')}</span></button></td></tr>)}</tbody></table></div>
          {!history.length && <div className="history-empty"><span className="empty-symbol"><Hand move="scissors" size={27} /><Hand move="rock" size={27} /><Hand move="paper" size={27} /></span><strong>{t('History.emptyTitle')}</strong><p>{t('History.emptyBody')}</p></div>}
          {history.length > historyLimit && <button className="load-more" onClick={() => setHistoryLimit(historyLimit + 25)}>{t('History.loadMore', { count: Math.min(25, history.length - historyLimit) })}</button>}
          <p className="history-note">{t('History.note', { max: MAX_ROUNDS })}</p>
        </section>
        <section className="fairness-section" id={t('Fairness.id')}><details><summary><span><Icon name="shield" size={21} />{t('Fairness.question')}</span><span className="summary-label">{t('Fairness.summary')} <Icon name="plus" size={18} /></span></summary><div className="fairness-content"><p><b>{t('Fairness.p1Title')}</b>{t('Fairness.p1')}</p><p><b>{t('Fairness.p2Title')}</b>{t('Fairness.p2')}</p><p><b>{t('Fairness.p3Title')}</b>{t('Fairness.p3')}</p><p><b>{t('Fairness.p4Title')}</b>{t('Fairness.p4')}</p></div></details></section>
      </main>
      <footer><span className="footer-brand">{t('Footer.brand')}</span><span>{t('Footer.bye')}</span><a className="footer-github" href="https://github.com/0xlau/jev-rps" target="_blank" rel="noopener noreferrer"><Icon name="github" size={15} />github.com/0xlau/jev-rps</a></footer>
      <AnimatePresence>
        {showOnboarding && <motion.div className="onboarding-backdrop" data-testid="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" initial={quietMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={quietMotion ? undefined : { opacity: 0 }} transition={{ duration: quietMotion ? 0 : .2 }}>
          <motion.section className="onboarding-card" key={onboardingStep} initial={quietMotion ? false : { opacity: 0, y: 14, rotate: onboardingStep % 2 ? 1 : -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={quietMotion ? undefined : { opacity: 0, y: -10 }} transition={{ duration: quietMotion ? 0 : .28, ease: [.2, .8, .2, 1] }}>
            <button className="skip-onboarding" type="button" onClick={finishOnboarding}>{t('Onboarding.skip')}</button>
            <div className={`onboarding-visual onboarding-visual-${onboardingStep}`} aria-hidden="true">
              {onboardingStep === 0 ? <><Mascot /><span className="onboarding-seal">LOCKED IN</span><span>{slide.visual}</span></>
                : onboardingStep === 1 ? <><div className="onboarding-versus">{t('Court.versus')}</div><span>{slide.visual}</span></>
                : <><Hand move="rock" size={150} /><Hand move="scissors" size={150} /><span>{slide.visual}</span></>}
            </div>
            <div className="onboarding-copy">
              <span className="eyebrow">{slide.eyebrow}</span>
              <h2 id="onboarding-title">{slide.title}</h2>
              <p>{slide.body}</p>
              <div className="onboarding-actions">
                <button ref={onboardingButtonRef} className="primary-button" type="button" onClick={advanceOnboarding}>{onboardingStep === ONBOARDING_STEPS.length - 1 ? t('Onboarding.start') : t('Onboarding.next')}<Icon name="arrow" size={18} /></button>
                <div className="onboarding-dots" aria-label={t('Onboarding.progress', { current: onboardingStep + 1, total: ONBOARDING_STEPS.length })}>{ONBOARDING_STEPS.map((_, index) => <span className={index === onboardingStep ? 'current' : ''} key={index} />)}</div>
              </div>
            </div>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
      <dialog className="modal" ref={settingsRef} aria-labelledby="settings-title">
        <form onSubmit={submitConnection}>
          <div className="dialog-heading"><span className="eyebrow">{t('Settings.eyebrow')}</span><button type="button" className="icon-button" onClick={closeSettings} aria-label={t('Settings.closeAria')}><Icon name="close" /></button></div>
          <div className="setup-intro"><Mascot /><div><h2 id="settings-title">{t('Settings.titleA')}<br />{t('Settings.titleB')}</h2><p>{t('Settings.body')}</p></div></div>
          <div>
            <label className="field-label" htmlFor="api-key">{t('Settings.label')}</label>
            <div className="key-input"><input ref={keyRef} id="api-key" type={showKey ? 'text' : 'password'} placeholder={t('Settings.placeholder')} value={apiKey} onChange={event => { setApiKey(event.target.value); setConnectionError(''); }} autoComplete="off" spellCheck="false" autoCapitalize="none" maxLength={512} aria-describedby="key-help" aria-invalid={!!connectionError} /><button type="button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? t('Settings.hideKey') : t('Settings.showKey')} aria-pressed={showKey}><Icon name="eye" /></button></div>
            {connectionError && <p className="field-error">{connectionError}</p>}
            <p className="key-help" id="key-help"><Icon name="lock" size={14} />{t('Settings.help')}</p>
          </div>
          <div>
            <button className="primary-button" type="submit">{startAfterSetup.current ? t('Settings.connectStart') : t('Settings.save')}<Icon name="arrow" /></button>
            <p className="setup-model">{t('Settings.modelNote')}</p>
          </div>
        </form>
      </dialog>
      <dialog className="modal proof-dialog" ref={proofRef} aria-labelledby="proof-title">
        {proof && <><div className="dialog-heading"><h2 id="proof-title">{t('Proof.title', { number: proof.number })}</h2><button type="button" className="icon-button" onClick={closeProof} aria-label={t('Proof.closeAria')} autoFocus><Icon name="close" /></button></div><p>{t('Proof.intro')}</p><dl><dt>{t('Proof.modelMove')}</dt><dd>{proof.model} / {moveName(proof.move)}</dd><dt>{t('Proof.preparedAt')}</dt><dd>{new Date(proof.preparedAt).toLocaleString(locale)}</dd><dt>{t('Proof.commitment')}</dt><dd><code>{proof.commitment}</code></dd><dt>{t('Proof.commitmentInput')}</dt><dd><code>{commitmentText(proof)}</code></dd><dt>{t('Proof.context')}</dt><dd>{t('Proof.contextValue', { count: proof.number - 1 })}</dd></dl><button className="primary-button" onClick={recheck}><Icon name="shield" size={18} />{t('Proof.recheck')}</button><p className="verify-status" role="status">{proofStatus}</p></>}
      </dialog>
    </div>
  );
}
