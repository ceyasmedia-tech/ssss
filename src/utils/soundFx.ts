class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType, gainVal = 0.08, delay = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playMove() {
    this.playTone(360, 0.08, 'triangle', 0.08);
    this.playTone(480, 0.06, 'sine', 0.05, 0.03);
  }

  playWall() {
    this.playTone(175, 0.11, 'square', 0.05);
    this.playTone(125, 0.09, 'triangle', 0.07, 0.02);
  }

  playBonus() {
    this.playTone(523.25, 0.12, 'sine', 0.08);
    this.playTone(659.25, 0.14, 'sine', 0.08, 0.07);
    this.playTone(783.99, 0.18, 'sine', 0.08, 0.14);
  }

  playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.22, 'triangle', 0.09, idx * 0.09);
    });
  }

  playError() {
    this.playTone(190, 0.12, 'sawtooth', 0.05);
  }
}

export const soundFx = new SoundEngine();
