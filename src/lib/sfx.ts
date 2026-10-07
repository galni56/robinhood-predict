// Site sound: the arcade "piu" on button presses (a tiny square-wave chirp
// made with WebAudio) and the background music (two chiptune tracks in
// public/music, random order, never the same track twice in a row). On by
// default (owner, 2026-10-07); one switch mutes both, remembered per browser.
// Browsers only allow sound after the visitor's first click, tap or key, so
// the music starts then if it could not start at once.

const KEY = 'prophet-sfx'
const MUSIC_VOLUME = 0.3
const TRACKS = ['music/echoes-of-lumen.mp3', 'music/lenspulse.mp3'].map((t) => `${import.meta.env.BASE_URL}${t}`)

let audio: AudioContext | null = null
let player: HTMLAudioElement | null = null
let lastTrack: string | null = null
const listeners = new Set<() => void>()

export function sfxEnabled() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

/** For useSyncExternalStore: every sound button follows the same switch. */
export function subscribeSound(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setSfxEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // private mode: the switch just lasts for this page
  }
  if (on) startMusic()
  else player?.pause()
  listeners.forEach((listener) => listener())
}

function nextTrack() {
  const choices = TRACKS.filter((t) => t !== lastTrack)
  lastTrack = choices[Math.floor(Math.random() * choices.length)] ?? TRACKS[0]
  return lastTrack
}

function startMusic() {
  if (!sfxEnabled() || document.hidden) return
  if (!player) {
    player = new Audio(nextTrack())
    player.volume = MUSIC_VOLUME
    player.preload = 'auto'
    player.addEventListener('ended', () => {
      if (!player) return
      player.src = nextTrack()
      void player.play().catch(() => undefined)
    })
  }
  if (player.paused) void player.play().catch(() => undefined)
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

/** Document listeners: every .rx-btn press chirps; the first interaction starts the music. */
export function installButtonSfx() {
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Element | null
    if (target?.closest?.('.rx-btn:not(:disabled)')) piu()
  })
  for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) {
    document.addEventListener(type, startMusic, { passive: true })
  }
  // Quiet in a background tab, back on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) player?.pause()
    else startMusic()
  })
  startMusic()
}
