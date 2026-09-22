// Original short arcade cues, synthesized locally. No audio files or network calls.
export function createSoundPlayer() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('当前浏览器不支持音效，仍可正常对局。');
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 10 ** (-22 / 20);
  master.connect(context.destination);
  const notes = { click: [440], ready: [523, 784], reveal: [587, 740], human: [523, 659, 784, 1047], jev: [392, 330, 262], draw: [440, 440] };
  return {
    resume: () => context.resume(),
    mute(value) { master.gain.setValueAtTime(value ? 0 : 10 ** (-22 / 20), context.currentTime); },
    play(event) {
      if (context.state !== 'running' || document.hidden) return;
      (notes[event] || notes.click).forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        const at = context.currentTime + index * 0.075;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, at);
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(0.6, at + 0.009);
        envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.15);
        oscillator.connect(envelope); envelope.connect(master);
        oscillator.start(at); oscillator.stop(at + 0.16);
        oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      });
    },
    close: () => context.close(),
  };
}
