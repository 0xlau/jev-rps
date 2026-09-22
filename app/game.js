'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MOVES, NAMES, MAX_ROUNDS, statsFor, commitmentText } from '../lib/protocol.js';
import { digest, historyContext, verifyProof, verifyReceipt } from '../lib/proof.js';
import { STORAGE_KEY, LOCK_KEY, freshState, readState, writeState } from '../lib/browser-store.js';
import { Icon, Hand, Mascot, Star } from './icons.js';
import { createSoundPlayer } from '../lib/sound.js';

const RESULTS = { human: '你赢了', jev: 'Jev 赢了', draw: '心有灵犀，平局' };
const EMPTY = { history: [], archives: [], pending: null };
const percent = value => value === null ? '—' : `${value.toFixed(1)}%`;
const ONBOARDING = [
  { eyebrow: '01 · LOCK', title: '它先出手。', body: 'Jev 先锁定出拳，你可以掀盖，也可以忍住。', action: '下一步' },
  { eyebrow: '02 · READ', title: '别让它看穿。', body: '它会读取你的规律，也会跟着你的状态变招。', action: '下一步' },
  { eyebrow: '03 · FIGHT', title: '现在，见招拆招。', body: '石头、剪刀、布。开局。', action: '开打' },
];

async function callApi(body, apiKey) {
  let response;
  try {
    response = await fetch('/api/game', { method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(55000),
    });
  } catch { throw new Error('连接中断或等待超时。已锁定的出拳会保留，请重试当前操作。'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('服务器未返回有效数据，请稍后重试。'); }
  if (!response.ok) throw new Error(data.error || '本次操作未完成，请重试。');
  return data;
}

function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Game() {
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

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        if (!crypto.subtle || !navigator.locks) throw new Error('请使用支持安全连接的新版浏览器打开游戏。');
        await navigator.locks.request(LOCK_KEY, async () => {
          const value = readState() || writeState(freshState());
          if (mounted) setGame(value);
        });
      } catch (e) { if (mounted) { setError(e.message); setFatal(true); } }
    };
    initialize();
    const sync = event => {
      if (event.key === STORAGE_KEY || event.key === null) {
        try {
          const state = readState();
          if (!state) throw new Error('战绩已在另一标签页清除，请刷新后继续。');
          setGame(state); setNotice('已同步另一标签页的对局。');
        } catch (e) { setError(e.message); setFatal(true); }
      }
    };
    window.addEventListener('storage', sync);
    return () => { mounted = false; window.removeEventListener('storage', sync); };
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
    // Audio is optional feedback. Its failure must never affect a signed round.
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
        setNotice('音效暂时无法开启，仍可正常对局。');
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
    if (onboardingStep === ONBOARDING.length - 1) finishOnboarding();
    else setOnboardingStep(step => step + 1);
  }

  function submitConnection(event) {
    event.preventDefault();
    if (apiKey.trim().length < 8) {
      setConnectionError('请填写完整的 TypeSafe API Key。'); keyRef.current?.focus(); return;
    }
    closeSettings();
    if (startAfterSetup.current) prepare();
    else setNotice('密钥已填写，仅保留在当前页面内存。');
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
        if (!lock) throw new Error('另一标签页正在操作这一局，请稍等。');
        const current = readState();
        if (!current) throw new Error('本机战绩已清除，请刷新页面。');
        setGame(current);
        await operation(current);
      });
    } catch (e) { setError(e.message || '操作未完成，请稍后重试。'); }
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
        throw new Error('开局凭证与当前战绩不符，出拳按钮不会解锁。请重试。');
      }
      save({ ...current, pending: { ...result, peeked: false, player: null, proof: null } });
      focusIntent.current = 'choose'; playSound('ready');
    });
  }

  function reveal() {
    wakeSound();
    operate('reveal', async current => {
      if (!current.pending || current.pending.player || current.pending.proof) return;
      // Persist before any network request, so an interrupted reveal never becomes blind play.
      current = save({ ...current, pending: { ...current.pending, peeked: true } });
      const result = await callApi({ action: 'reveal', sealedRound: current.pending.sealedRound });
      await verifyProof(result.proof, current.pending, current.series);
      if (result.commitment !== current.pending.commitment || typeof result.sealedRound !== 'string') throw new Error('揭盖凭证无效，请重试。');
      save({ ...current, pending: { ...current.pending, proof: result.proof, sealedRound: result.sealedRound } });
      focusIntent.current = 'choose'; playSound('reveal');
    });
  }

  function choose(move) {
    wakeSound();
    operate('resolve', async current => {
      if (!current.pending) return;
      // Save the human move synchronously before resolving. A retry must reuse it.
      if (current.pending.player && current.pending.player !== move) return;
      current = save({ ...current, pending: { ...current.pending, player: move } });
      playSound('click');
      const result = await callApi({ action: 'resolve', sealedRound: current.pending.sealedRound,
        player: current.pending.player, peeked: current.pending.peeked });
      await verifyReceipt(result, current.pending, current.series, current.history);
      save({ ...current, history: [...current.history, result.receipt], pending: null });
      setCelebration({ id: result.receipt.record.id, result: result.receipt.record.result });
      focusIntent.current = 'next'; playSound(result.receipt.record.result);
    });
  }

  function newSeries() {
    operate('archive', async current => {
      if (current.pending) throw new Error('先完成当前这一局，再开启新的一组。');
      if (!current.history.length) return;
      const archived = { series: current.series, history: current.history, archivedAt: new Date().toISOString() };
      save({ ...freshState(), archives: [...current.archives, archived] });
      setArchiveId('current'); setHistoryLimit(12); setNotice('已开启新的一组，旧战绩已归档保留。');
    });
  }

  function exportHistory() {
    try {
      const value = readState();
      downloadJson({ format: 'jev-duel-export/v1', exportedAt: new Date().toISOString(),
        verification: 'SHA-256 of UTF-8 JSON.stringify(["jev-rps/v1",series,id,number,model,contextHash,move,nonce,preparedAt])',
        game: value }, `jev-duel-${new Date().toISOString().slice(0, 10)}.json`);
    } catch { downloadJson({ raw: localStorage.getItem(STORAGE_KEY) }, 'jev-duel-recovery.json'); }
  }

  function inspect(record, event) {
    proofTrigger.current = event.currentTarget; setProofStatus(''); setProof(record);
  }
  function closeProof() { setProof(null); proofTrigger.current?.focus(); }
  async function recheck() {
    try { await verifyProof(proof, proof, proof.series); setProofStatus('核验通过：开局承诺与最终出拳完全一致。'); }
    catch (e) { setProofStatus(e.message); }
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
  const status = busy === 'prepare' ? 'Jev 在猜你会出什么…' : busy === 'resolve' ? '出拳锁定，正在揭晓…'
    : busy === 'reveal' ? '正在打开 Jev 的底牌…' : pending?.player ? '你的拳已锁定，再试一次结算'
    : pending?.proof ? '底牌看到了，轮到你出手' : ready ? '它出好了。你呢？'
    : last ? RESULTS[last.result] : '第一拳，让 Jev 先来。';
  const mainLabel = busy === 'prepare' ? 'Jev 正在出拳…' : busy === 'resolve' ? '正在揭晓…'
    : pending?.player ? '重试结算' : capReached ? '开始新一组' : last ? '再来一局' : hasKey ? '让 Jev 先出拳' : '连接 Jev，开始对局';
  const jevMood = busy === 'prepare' ? 'thinking' : last?.result === 'human' ? 'lose' : 'idle';
  const nextNumber = busy === 'prepare' ? current.history.length + 1 : roundNumber;

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

  return (
    <div className={`site-shell ${quietMotion ? 'reduced-motion' : ''}`}>
      <a className="skip-link" href="#play">跳到对局</a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Jev 对拳首页"><img className="brand-mark" src="/icon.svg" alt="" /><span>Jev 对拳<small>ROCK. PAPER. RIVAL.</small></span></a>
        <nav aria-label="主导航"><a className="history-link" href="#history">我的战绩<Icon name="arrow" size={16} /></a><a className="github-link" href="https://github.com/0xlau/jev-rps" target="_blank" rel="noopener noreferrer"><Icon name="github" size={17} /><span>GitHub</span></a><button className={`connection-button ${hasKey ? 'has-key' : ''}`} onClick={event => openSettings(event)}><Icon name="key" size={17} /><span>{hasKey ? '密钥已填写' : '连接 Jev'}</span></button></nav>
      </header>
      <main>
        <section className="intro" aria-labelledby="game-title">
          <div><h1 id="game-title">猜拳，<span>也猜心。</span><Star className="title-star" /></h1></div>
          <div className="intro-stamp" aria-label="Jev 先出拳，锁定不反悔"><Icon name="shield" size={23} /><strong>先出拳<br />不反悔</strong></div>
        </section>
        <div className="game-layout">
          <section className={`play-panel phase-${phase}`} id="play" aria-label="剪刀石头布对局" aria-busy={!!busy}>
            <div className="round-bar"><span className="round-number">ROUND <strong>{String(nextNumber).padStart(2, '0')}</strong></span><ol className="round-steps" aria-label="对局进度">{['Jev 出拳', '你选牌', '揭晓'].map((label, i) => <li key={label} className={phase === i + 1 ? 'current' : phase > i + 1 ? 'done' : ''} aria-current={phase === i + 1 ? 'step' : undefined}><span>{phase > i + 1 ? <Icon name="check" size={12} /> : i + 1}</span>{label}</li>)}</ol></div>
            <div className={`court ${last ? 'outcome-' + last.result : ''}`}>
              <div className="opponent human-side">
                <div className="opponent-label"><span className="player-badge">P1</span><strong>你</strong><small>直觉选手</small></div>
                <motion.div className={`hand-stage human-hand ${playerMove ? 'chosen' : ''}`} initial={quietMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, ease: [.2, .8, .2, 1] }}>
                  <span className="stage-orbit" aria-hidden="true" />
                  <Hand move={playerMove} size={190} key={playerMove || 'waiting'} />
                  {!playerMove && <span className="question-doodle" aria-hidden="true">?</span>}
                  <span className="hand-label">{playerMove ? NAMES[playerMove] : '等你出手'}</span>
                </motion.div>
              </div>
              <div className="versus" aria-hidden="true"><Star /><span>VS</span></div>
              <div className="opponent jev-side">
                <div className="opponent-label"><span className="player-badge">AI</span><strong>Jev</strong><small>正在研究你</small></div>
                <motion.div className={`hand-stage jev-hand ${revealedMove ? 'is-revealed' : ''}`} initial={quietMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, ease: [.2, .8, .2, 1] }}>
                  <span className="stage-orbit" aria-hidden="true" />
                  {revealedMove && <><Hand move={revealedMove} size={190} /><span className="hand-label">{NAMES[revealedMove]}</span></>}
                  <motion.div className={`choice-cover ${revealedMove ? 'lifted' : ''}`} data-testid="choice-cover" aria-hidden={!!revealedMove} initial={false} animate={revealedMove ? { opacity: 0, rotateX: -95, y: -8 } : { opacity: 1, rotateX: 0, y: 0 }} transition={{ duration: quietMotion ? 0 : .42, ease: [.2, .8, .2, 1] }}>
                    <span className="cover-seal"><Icon name="lock" size={12} />{pending ? 'LOCKED IN' : busy === 'prepare' ? 'THINKING…' : 'READY WHEN YOU ARE'}</span>
                    <Mascot mood={jevMood} />
                    <strong>{pending ? '我出好了。' : busy === 'prepare' ? '让我猜猜…' : '来过两招？'}</strong>
                    <button className="peek-button" type="button" onClick={reveal} disabled={!canChoose || !!revealedMove} tabIndex={revealedMove ? -1 : 0}><Icon name="eye" size={16} />{busy === 'reveal' ? '揭盖中…' : pending?.peeked ? '重试揭盖' : '掀开看一眼'}<Icon name="chevron" size={13} /></button>
                  </motion.div>
                </motion.div>
              </div>
              {celebration && <motion.div className={'result-burst burst-' + celebration.result} key={celebration.id} aria-hidden="true" initial={quietMotion ? false : { opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: quietMotion ? 0 : .22 }}>{Array.from({ length: 8 }, (_, i) => <Star key={i} style={{ '--i': i }} />)}</motion.div>}
            </div>
            <div className="play-controls">
              {previousRound && <motion.div className="previous-round" data-testid="previous-round" aria-label={`上一局，第 ${previousRound.number} 局结果`} initial={quietMotion ? false : { opacity: 0, y: -7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: quietMotion ? 0 : .22 }}>
                <span className="previous-round-title">上一局 <b>#{previousRound.number}</b></span>
                <span className="previous-move"><Hand move={previousRound.player} size={25} />你出{NAMES[previousRound.player]}</span>
                <span className="previous-move"><Hand move={previousRound.move} size={25} />Jev 出{NAMES[previousRound.move]}</span>
                <strong className={`result-label ${previousRound.result}`}>{previousRound.result === 'draw' ? '平局' : RESULTS[previousRound.result]}</strong>
                {previousRound.peeked && <small>已揭盖</small>}
              </motion.div>}
              <div className={`round-message ${last && !busy ? 'result-' + last.result : ''}`} role="status" aria-atomic="true">
                <strong>{busy ? <span className="spinner" /> : last ? <Icon name={last.result === 'draw' ? 'refresh' : 'trophy'} size={24} /> : null}{status}</strong>
                <AnimatePresence mode="wait">
                  <motion.p key={status} initial={quietMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={quietMotion ? undefined : { opacity: 0, y: -5 }} transition={{ duration: quietMotion ? 0 : .18 }}>{busy === 'prepare' ? '正在读取你的习惯…' : last ? `你出${NAMES[last.player]}，Jev 出${NAMES[last.move]}` : pending?.peeked ? '已揭盖 · 计入全部战绩' : pending ? '已参考你的历史记录' : 'Jev 先锁定，你再出拳'}</motion.p>
                </AnimatePresence>
              </div>
              <div className={`move-choices ${canChoose ? 'choices-ready' : ''}`} aria-label="选择你的出拳">
                {MOVES.map((move, index) => <motion.button ref={index === 0 ? firstMoveRef : undefined} key={move} type="button" className={`move-button move-${move} ${playerMove === move ? 'selected' : ''}`} onClick={() => choose(move)} disabled={!canChoose} aria-label={`出${NAMES[move]}，快捷键 ${index + 1}`} aria-keyshortcuts={String(index + 1)} whileHover={quietMotion ? undefined : { y: -5 }} whileTap={quietMotion ? undefined : { y: 3, scale: .98 }} transition={{ type: 'spring', stiffness: 430, damping: 24 }}><kbd aria-hidden="true">{index + 1}</kbd><Hand move={move} size={100} /><span>{NAMES[move]}</span><small>{['胜布', '胜剪刀', '胜石头'][index]}</small>{playerMove === move && <Icon className="selection-check" name="check" size={17} />}</motion.button>)}
              </div>
              {(!pending || pending.player) ? <div className="next-action"><button ref={mainButtonRef} className="primary-button" type="button" onClick={advance} disabled={disabled} aria-keyshortcuts="Enter">{busy ? <span className="spinner" /> : <Icon name={pending?.player ? 'refresh' : hasKey || last ? 'spark' : 'key'} size={20} />}{mainLabel}<Icon className="button-arrow" name="arrow" size={20} /></button><span className="action-hint">{capReached ? '旧战绩会归档，Jev 从头学习' : last ? '再给它一次猜中你的机会' : '填入自己的 TypeSafe 密钥即可开打'}<kbd>Enter ↵</kbd></span></div>
                : <p className="choice-hint"><span className="status-dot" />你的回合<span className="keyboard-hint">按 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 也能出拳</span></p>}
              {error && <div className="error-message" role="alert"><Icon name="help" size={20} /><div><strong>这一步还没完成</strong><p>{error}</p>{!pending && !fatal && <button className="text-button" onClick={event => openSettings(event)}>检查或更换密钥<Icon name="arrow" size={14} /></button>}</div></div>}
              {previousRound?.strategy && <details className="behavior-readout"><summary>Jev 上局开局前的观察 <Icon name="chevron" size={13} /></summary>
                <div className="behavior-values">{[['regularity', '规律程度'], ['cunning', '狡猾程度'], ['tilt', '失稳程度'], ['adaptation', '策略变化']].map(([key, label]) => {
                  const estimate = previousRound.strategy.behavior[key];
                  return <div key={key}><span>{label}</span><strong>{estimate.value === null ? '待观察' : `${estimate.value}/100`}</strong></div>;
                })}</div><p>根据第 {previousRound.number} 局开局前的 {previousRound.strategy.blindRounds} 局未揭盖记录估计。失稳指输棋后的出拳变化，无法判断真实情绪。样本不足时不打分。</p>
              </details>}
            </div>
            <div className="commitment-strip"><Icon name="shield" size={17} />
              {pending ? <><span>出拳已封存 <code>{pending.commitment.slice(0, 10)}…</code></span><details className="commitment-details"><summary>查看承诺</summary><p>此哈希在你出拳前保存，揭晓后自动比对。</p><code>{pending.commitment}</code><p>已参考 {pending.contextCount} 局 · {pending.model}</p><code>上下文 SHA-256：{pending.contextHash}</code></details></>
                : last ? <><span>这一拳，通过承诺核验</span><button className="text-button" onClick={event => inspect(last, event)}>查看凭证<Icon name="arrow" size={14} /></button></>
                : <><span>先锁定，后出手。每局都能核验。</span><a href="#fairness">了解规则<Icon name="arrow" size={14} /></a></>}
            </div>
          </section>
          <aside className="sidebar">
            <section className="scoreboard" aria-label="本组比分与胜率">
              <div className="ticket-heading"><Icon name="trophy" size={19} /><span>THE SCORECARD</span><span>No. {String(current.archives.length + 1).padStart(3, '0')}</span></div>
              <div className="section-title"><h2>谁更懂谁？</h2><span>本组战绩</span></div>
              <div className="segmented" aria-label="胜率统计范围"><button onClick={() => setFilter('blind')} aria-pressed={filter === 'blind'}>未揭盖</button><button onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>全部对局</button></div>
              <div className="score-tally"><div><span>你</span><strong>{stats.human}</strong><small>胜</small></div><span className="score-colon">:</span><div><span>Jev</span><strong>{stats.jev}</strong><small>胜</small></div></div>
              <div className="score-line human-score"><div><span><i />你的胜率</span><strong data-testid="human-rate">{percent(stats.humanRate)}</strong></div><meter min="0" max="100" value={stats.humanRate ?? 0} aria-label="你的胜率" /></div>
              <div className="score-line jev-score"><div><span><i />Jev 的胜率</span><strong data-testid="jev-rate">{percent(stats.jevRate)}</strong></div><meter min="0" max="100" value={stats.jevRate ?? 0} aria-label="Jev 的胜率" /></div>
              <div className="score-footnote"><span>统计局数<b>{stats.total}</b></span><span>平局<b>{stats.draws}</b></span><span>本组揭盖<b>{stats.peeked}</b></span></div>
              <p className="fine-print">胜率 = 胜局 ÷ 所选范围总局数（含平局）。<br />揭盖局始终保留在记录和 Jev 的记忆中。</p>
              <div className="ticket-perforation" aria-hidden="true" />
              <div className="recent-rounds"><span>最近五拳</span><div>{current.history.length ? current.history.slice(-5).map(({ record }) => <button key={record.id} className={'recent-dot ' + record.result} onClick={event => inspect(record, event)} aria-label={`第 ${record.number} 局，${RESULTS[record.result]}${record.peeked ? '，已揭盖' : ''}，查看凭证`}>{record.result === 'human' ? '赢' : record.result === 'jev' ? '输' : '平'}{record.peeked && <Icon name="eye" size={9} />}</button>) : <span className="no-rounds">你的故事，还没开始。</span>}</div></div>
            </section>
            <section className="rival-note" aria-label="认识你的对手"><div><span className="eyebrow">MEET YOUR RIVAL</span><h2>它会<br />记住你。</h2></div><Mascot mood={jevMood} /><span className="note-scribble" aria-hidden="true">I'M ONTO YOU ↗</span></section>
            <div className="comfort-controls" aria-label="体验设置"><button onClick={toggleSound} aria-pressed={soundOn}><Icon name={soundOn ? 'sound' : 'mute'} size={17} />音效{soundOn ? '开' : '关'}</button><button onClick={() => setReducedMotion(!reducedMotion)} aria-pressed={quietMotion} disabled={systemReduced} title={systemReduced ? '已跟随系统减少动态效果' : undefined}><Icon name="spark" size={16} />{quietMotion ? '动效已减弱' : '减少动效'}</button></div>
          </aside>
        </div>
        {notice && <p className="notice" role="status"><Icon name="check" size={16} />{notice}</p>}
        <section className="history-section" id="history">
          <div className="history-heading"><div><span className="eyebrow">THE MATCHBOOK</span><h2>每一拳，都算数。</h2></div><div className="history-actions"><button className="secondary-button" onClick={exportHistory} disabled={!game && !fatal}><Icon name="download" size={17} />导出记录</button><button className="secondary-button" onClick={newSeries} disabled={disabled || !!pending || !current.history.length}><Icon name="plus" size={17} />新的一组</button></div></div>
          {current.archives.length > 0 && <label className="archive-filter">查看记录<select value={archiveId} onChange={event => { setArchiveId(event.target.value); setHistoryLimit(12); }}><option value="current">当前这组 · {current.history.length} 局</option>{current.archives.map((archive, index) => <option value={archive.series} key={archive.series}>第 {index + 1} 组 · {archive.history.length} 局 · {new Date(archive.archivedAt).toLocaleDateString('zh-CN')}</option>)}</select></label>}
          <div className="history-table-wrap"><table><caption className="sr-only">每局出拳、胜负、是否揭盖及核验凭证</caption><thead><tr><th scope="col">局次</th><th scope="col">你的出拳</th><th scope="col">Jev 的出拳</th><th scope="col">结果</th><th scope="col">对局方式</th><th scope="col">凭证</th></tr></thead><tbody>{[...history].reverse().slice(0, historyLimit).map(({ record }) => <tr key={record.id}><td className="number-cell">{String(record.number).padStart(2, '0')}</td><td><span className="table-move"><Hand move={record.player} size={23} />{NAMES[record.player]}</span></td><td><span className="table-move"><Hand move={record.move} size={23} />{NAMES[record.move]}</span></td><td><span className={`result-label ${record.result}`}>{record.result === 'draw' ? '平局' : RESULTS[record.result]}</span></td><td><span className="play-mode">{record.peeked ? <Icon name="eye" size={15} /> : <Icon name="lock" size={14} />}{record.peeked ? '已揭盖' : '未揭盖'}</span></td><td><button className="proof-button" onClick={event => inspect(record, event)} aria-label={`查看第 ${record.number} 局凭证`}><Icon name="shield" size={17} /><span>查看</span></button></td></tr>)}</tbody></table></div>
          {!history.length && <div className="history-empty"><span className="empty-symbol"><Hand move="scissors" size={27} /><Hand move="rock" size={27} /><Hand move="paper" size={27} /></span><strong>还没有交手记录</strong><p>第一局，从一点点好奇心开始。</p></div>}
          {history.length > historyLimit && <button className="load-more" onClick={() => setHistoryLimit(historyLimit + 25)}>再看 {Math.min(25, history.length - historyLimit)} 局</button>}
          <p className="history-note">本机记录 · 每组最多 500 局 · 新的一组会重新学习</p>
        </section>
        <section className="fairness-section" id="fairness"><details><summary><span><Icon name="shield" size={21} />怎么知道 Jev 没有反悔？</span><span className="summary-label">公平说明 <Icon name="plus" size={18} /></span></summary><div className="fairness-content"><p><b>先出拳，再让你选择。</b>服务端调用真实 TypeSafe API，直接使用 Jev 返回的 choice。接口失败就停止这一局，不用随机结果冒充。你的本局选择不会发给 Jev。</p><p><b>先封存，再核验。</b>开局时把出拳、模型、局号、历史摘要和随机盐做成 SHA-256 承诺。浏览器先保存承诺，再开放按钮。揭盖或结算只解封原来的选择，不再次调用 AI；浏览器重新计算哈希，一致才记入战绩。</p><p><b>想掀盖子？可以。</b>盖子是一个真实的 div；未揭晓的出拳留在加密凭证里，不会提前写进页面。点击后拿到原来的出拳、移开盖子，并标记「已揭盖」。揭盖记录也会进入 Jev 的上下文。</p><p><b>这是个人对局记录。</b>承诺证明出拳未变，记录签名防止内容被随意修改；它不是 TypeSafe 官方签发的证明。本机存储不提供跨设备同步，也不能阻止使用开发者工具回滚旧记录、重放请求或绕过揭盖标记，因此不作为竞技排行榜。清除浏览器数据会丢失本机记录，请按需导出。</p></div></details></section>
      </main>
      <footer><span className="footer-brand">Jev 对拳俱乐部</span><span>下局见。</span><a className="footer-github" href="https://github.com/0xlau/jev-rps" target="_blank" rel="noopener noreferrer"><Icon name="github" size={15} />github.com/0xlau/jev-rps</a></footer>
      <AnimatePresence>
        {showOnboarding && <motion.div className="onboarding-backdrop" data-testid="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" initial={quietMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={quietMotion ? undefined : { opacity: 0 }} transition={{ duration: quietMotion ? 0 : .2 }}>
          <motion.section className="onboarding-card" key={onboardingStep} initial={quietMotion ? false : { opacity: 0, y: 14, rotate: onboardingStep % 2 ? 1 : -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={quietMotion ? undefined : { opacity: 0, y: -10 }} transition={{ duration: quietMotion ? 0 : .28, ease: [.2, .8, .2, 1] }}>
            <button className="skip-onboarding" type="button" onClick={finishOnboarding}>跳过</button>
            <div className={`onboarding-visual onboarding-visual-${onboardingStep}`} aria-hidden="true">
              {onboardingStep === 0 ? <><Mascot /><span className="onboarding-seal">LOCKED IN</span><span>我先出手。</span></>
                : onboardingStep === 1 ? <><div className="onboarding-versus">VS</div><span>观察 · 预判 · 变招</span></>
                : <><Hand move="rock" size={150} /><Hand move="scissors" size={150} /><span>READY?</span></>}
            </div>
            <div className="onboarding-copy">
              <span className="eyebrow">{ONBOARDING[onboardingStep].eyebrow}</span>
              <h2 id="onboarding-title">{ONBOARDING[onboardingStep].title}</h2>
              <p>{ONBOARDING[onboardingStep].body}</p>
              <div className="onboarding-actions">
                <div className="onboarding-dots" aria-label={`第 ${onboardingStep + 1} 步，共 ${ONBOARDING.length} 步`}>{ONBOARDING.map((_, index) => <span className={index === onboardingStep ? 'current' : ''} key={index} />)}</div>
                <button ref={onboardingButtonRef} className="primary-button" type="button" onClick={advanceOnboarding}>{ONBOARDING[onboardingStep].action}<Icon name="arrow" size={18} /></button>
              </div>
            </div>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
      <dialog ref={settingsRef} className="modal settings-dialog" aria-labelledby="settings-title"
        onCancel={event => { event.preventDefault(); closeSettings(); }} onClose={() => { setSettings(false); setShowKey(false); }}
        onClick={event => { if (event.target === event.currentTarget) closeSettings(); }}>
        <div className="dialog-heading"><span className="eyebrow">YOUR OPPONENT AWAITS</span><button className="icon-button" onClick={closeSettings} aria-label="关闭连接设置"><Icon name="close" /></button></div>
        <div className="setup-intro"><Mascot /><div><h2 id="settings-title">带上密钥，<br />就能开打。</h2><p>连接真正的 Jev，让它先出第一拳。</p></div></div>
        <form onSubmit={submitConnection}>
          <label className="field-label" htmlFor="api-key">你的 TypeSafe API Key</label>
          <div className="key-input"><input ref={keyRef} id="api-key" type={showKey ? 'text' : 'password'} placeholder="在这里粘贴 API Key" value={apiKey} onChange={event => { setApiKey(event.target.value); setConnectionError(''); }} autoComplete="off" spellCheck="false" autoCapitalize="none" maxLength={512} aria-describedby="key-help" aria-invalid={!!connectionError} /><button type="button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? '隐藏密钥' : '显示密钥'} aria-pressed={showKey}><Icon name="eye" /></button></div>
          <p className="key-help" id="key-help"><Icon name="lock" size={14} />密钥仅留在当前页面内存，刷新后需重填。请求经本站服务端转发至 TypeSafe，不写入战绩。</p>
          {connectionError && <p className="field-error" role="alert">{connectionError}</p>}
          <button className="primary-button" type="submit">{startAfterSetup.current ? '连接，让 Jev 先出拳' : '保存密钥'}<Icon name="arrow" /></button>
          <p className="setup-model">jev-latest · 每局两次判断：分析习惯 → 决定出拳</p>
        </form>
      </dialog>
      <dialog ref={proofRef} className="modal proof-dialog" onCancel={event => { event.preventDefault(); closeProof(); }} onClose={() => setProof(null)} onClick={event => { if (event.target === event.currentTarget) closeProof(); }} aria-labelledby="proof-title">
        {proof && <><div className="dialog-heading"><h2 id="proof-title">第 {proof.number} 局 · 出拳凭证</h2><button className="icon-button" onClick={closeProof} aria-label="关闭凭证" autoFocus><Icon name="close" /></button></div><p>将揭晓内容重新计算为 SHA-256，与开局前保存的承诺比对。</p><dl><dt>模型 / 出拳</dt><dd>{proof.model} / {NAMES[proof.move]}</dd><dt>开局时间</dt><dd>{new Date(proof.preparedAt).toLocaleString('zh-CN')}</dd><dt>开局承诺 SHA-256</dt><dd><code>{proof.commitment}</code></dd><dt>完整核验输入（UTF-8）</dt><dd><code>{commitmentText(proof)}</code></dd><dt>上下文</dt><dd>前 {proof.number - 1} 局完整记录，包括平局和揭盖局</dd></dl><button className="primary-button" onClick={recheck}><Icon name="shield" size={18} />在浏览器重新核验</button><p className="verify-status" role="status">{proofStatus}</p></>}
      </dialog>
    </div>
  );
}
