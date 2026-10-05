// The arcade "piu" on button presses: a tiny square-wave chirp made with
// WebAudio (no sound files). Off unless the visitor turns it on; the choice
// is remembered per browser.

const KEY = 'prophet-sfx'
let audio: AudioContext | null = null

export function sfxEnabled() {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function setSfxEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // private mode: the toggle just lasts for this page
  }
}

export function piu() {
  if (!sfxEnabled()) return
  try {
    audio ??= new AudioContext()
    const t = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(1240, t)
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.12)
    gain.gain.setValueAtTime(0.06, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
    osc.connect(gain).connect(audio.destination)
    osc.start(t)
    osc.stop(t + 0.15)
  } catch {
    // no WebAudio: stay silent
  }
}

/** One document listener: every .rx-btn press chirps (when enabled). */
export function installButtonSfx() {
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Element | null
    if (target?.closest?.('.rx-btn:not(:disabled)')) piu()
  })
}
