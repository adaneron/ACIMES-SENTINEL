/**
 * Sintetizador de Sirenas y Alertas Tácticas para Sentinel (Web Audio API)
 * Duración continua de al menos 3 segundos por alerta de emergencia
 */
class EmergencyAudioEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playAlert(type = 'sismo') {
    if (!this.enabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const duration = 3.5; // Al menos 3.5 segundos continuos de sonido de emergencia

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (type === 'sismo') {
        // Sirena de Emergencia Sísmica Continua (Modulación de onda en rampa durante 3.5 segundos)
        osc.type = 'sawtooth';

        // Oscilación continua entre 440 Hz y 880 Hz cada 0.35s
        for (let t = 0; t < duration; t += 0.35) {
          const stepTime = now + t;
          osc.frequency.setValueAtTime(440, stepTime);
          osc.frequency.exponentialRampToValueAtTime(880, Math.min(stepTime + 0.175, now + duration));
          osc.frequency.exponentialRampToValueAtTime(440, Math.min(stepTime + 0.35, now + duration));
        }

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.setValueAtTime(0.28, now + duration - 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
      } else if (type === 'inundacion') {
        // Sonar de Emergencia Hidrométrica Continuo durante 3.5 segundos
        osc.type = 'sine';

        for (let t = 0; t < duration; t += 0.55) {
          const stepTime = now + t;
          osc.frequency.setValueAtTime(520, stepTime);
          osc.frequency.exponentialRampToValueAtTime(760, Math.min(stepTime + 0.28, now + duration));
          osc.frequency.setValueAtTime(520, Math.min(stepTime + 0.54, now + duration));
        }

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.setValueAtTime(0.3, now + duration - 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
      } else {
        // Notificación informativa breve
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch (e) {
      console.warn('Audio no disponible o bloqueado por el navegador hasta la primera interacción.', e);
    }
  }
}

export const audioEngine = new EmergencyAudioEngine();

export const playAlarm = () => audioEngine.playAlert('sismo');
export const playFloodAlert = () => audioEngine.playAlert('inundacion');
export const playBeep = (_freq, _duration) => audioEngine.playAlert('info');
