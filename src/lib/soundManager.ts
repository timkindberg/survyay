/**
 * Sound Manager for Survyay!
 *
 * Uses Web Audio API for low-latency sound playback.
 * All sounds are generated procedurally using oscillators and noise.
 * Mute state is persisted to localStorage.
 */

// Sound types used in the game
export type SoundType =
  | "squeak" // Blob movement/collision
  | "boop" // Answer submit
  | "ropeTension" // Climbing sound
  | "snip" // Wrong answer (rope cut)
  | "celebration" // Correct answer
  | "gibberish" // Animal Crossing style voice clip
  | "scream" // Alarmed yelp when falling from cut rope
  | "pop" // Player join sound (bubbly pop)
  | "giggle"; // Short happy vocalization

const MUTE_STORAGE_KEY = "survyay_muted";

interface SoundManagerState {
  audioContext: AudioContext | null;
  isMuted: boolean;
  isInitialized: boolean;
}

// Singleton state
const state: SoundManagerState = {
  audioContext: null,
  isMuted: loadMuteState(),
  isInitialized: false,
};

// Event listeners for mute state changes
const muteListeners = new Set<(muted: boolean) => void>();

/**
 * Load mute state from localStorage
 */
function loadMuteState(): boolean {
  try {
    const stored = localStorage.getItem(MUTE_STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

/**
 * Save mute state to localStorage
 */
function saveMuteState(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Initialize the audio context (must be called after user interaction)
 */
export function initAudio(): void {
  if (state.audioContext) return;

  try {
    state.audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    state.isInitialized = true;
  } catch (e) {
    console.warn("Web Audio API not supported:", e);
  }
}

/**
 * Ensure audio context is resumed (needed after user interaction on mobile)
 */
async function ensureAudioResumed(): Promise<void> {
  if (!state.audioContext) {
    initAudio();
  }

  if (state.audioContext?.state === "suspended") {
    await state.audioContext.resume();
  }
}

/**
 * Get the current mute state
 */
export function isMuted(): boolean {
  return state.isMuted;
}

/**
 * Set the mute state
 */
export function setMuted(muted: boolean): void {
  state.isMuted = muted;
  saveMuteState(muted);
  muteListeners.forEach((listener) => listener(muted));
}

/**
 * Toggle the mute state
 */
export function toggleMute(): boolean {
  setMuted(!state.isMuted);
  return state.isMuted;
}

/**
 * Subscribe to mute state changes
 */
export function onMuteChange(listener: (muted: boolean) => void): () => void {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

/**
 * Create white noise buffer for various sound effects
 */
function createNoiseBuffer(
  ctx: AudioContext,
  duration: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

/**
 * Play a squeak sound (blob movement/collision)
 * High-pitched, short chirp
 */
async function playSqueak(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Random pitch variation for character
  const baseFreq = 800 + Math.random() * 400;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(baseFreq, now);
  oscillator.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.05);
  oscillator.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, now + 0.1);

  gainNode.gain.setValueAtTime(0.15, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + 0.1);
}

/**
 * Play a boop sound (answer submit)
 * Satisfying confirmation sound
 */
async function playBoop(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(440, now);
  oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.1);

  gainNode.gain.setValueAtTime(0.2, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + 0.15);
}

/**
 * Play rope tension sound (climbing)
 * Creaky tension building sound
 */
async function playRopeTension(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Create a low rumble with some creak
  const oscillator1 = ctx.createOscillator();
  const oscillator2 = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator1.type = "triangle";
  oscillator1.frequency.setValueAtTime(80, now);
  oscillator1.frequency.linearRampToValueAtTime(120, now + 0.3);

  oscillator2.type = "sawtooth";
  oscillator2.frequency.setValueAtTime(160, now);
  oscillator2.frequency.linearRampToValueAtTime(200, now + 0.3);

  // Tremolo effect
  gainNode.gain.setValueAtTime(0.05, now);
  for (let i = 0; i < 6; i++) {
    const t = now + i * 0.05;
    gainNode.gain.linearRampToValueAtTime(0.08, t + 0.025);
    gainNode.gain.linearRampToValueAtTime(0.03, t + 0.05);
  }
  gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);

  oscillator1.connect(gainNode);
  oscillator2.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator1.start(now);
  oscillator2.start(now);
  oscillator1.stop(now + 0.3);
  oscillator2.stop(now + 0.3);
}

/**
 * Play snip sound (wrong answer - rope cut)
 * Sharp cutting sound followed by a fall
 */
async function playSnip(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Sharp high-frequency snap
  const noiseBuffer = createNoiseBuffer(ctx, 0.1);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.setValueAtTime(2000, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(500, now + 0.1);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.3, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  // Falling tone
  const fallOsc = ctx.createOscillator();
  const fallGain = ctx.createGain();

  fallOsc.type = "sine";
  fallOsc.frequency.setValueAtTime(600, now + 0.05);
  fallOsc.frequency.exponentialRampToValueAtTime(100, now + 0.4);

  fallGain.gain.setValueAtTime(0.15, now + 0.05);
  fallGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

  fallOsc.connect(fallGain);
  fallGain.connect(ctx.destination);

  noiseSource.start(now);
  fallOsc.start(now + 0.05);
  fallOsc.stop(now + 0.4);
}

/**
 * Play celebration sound (correct answer)
 * Triumphant ascending notes
 */
async function playCelebration(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Play a happy ascending chord
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  const delays = [0, 0.08, 0.16, 0.24];

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + delays[i]!);

    gain.gain.setValueAtTime(0.15, now + delays[i]!);
    gain.gain.exponentialRampToValueAtTime(0.01, now + delays[i]! + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + delays[i]!);
    osc.stop(now + delays[i]! + 0.3);
  });

  // Add a shimmer
  const shimmer = ctx.createOscillator();
  const shimmerGain = ctx.createGain();

  shimmer.type = "triangle";
  shimmer.frequency.setValueAtTime(2000, now + 0.3);
  shimmer.frequency.linearRampToValueAtTime(4000, now + 0.5);

  shimmerGain.gain.setValueAtTime(0.05, now + 0.3);
  shimmerGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

  shimmer.connect(shimmerGain);
  shimmerGain.connect(ctx.destination);

  shimmer.start(now + 0.3);
  shimmer.stop(now + 0.5);
}

/**
 * Play scream/yelp sound (falling from cut rope)
 * Short, alarmed high-pitched yelp with quick pitch drop
 */
async function playScream(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // High pitched alarmed yelp
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Start high, drop quickly for "ahhh!" effect
  const baseFreq = 900 + Math.random() * 200;
  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq * 1.3, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, now + 0.15);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.3, now + 0.3);

  // Quick attack, sustain, then fade
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.setValueAtTime(0.2, now + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.3);

  // Add a warble effect with second oscillator
  const warble = ctx.createOscillator();
  const warbleGain = ctx.createGain();

  warble.type = "triangle";
  warble.frequency.setValueAtTime(baseFreq * 1.5, now);
  warble.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.2);

  warbleGain.gain.setValueAtTime(0.08, now);
  warbleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

  warble.connect(warbleGain);
  warbleGain.connect(ctx.destination);

  warble.start(now);
  warble.stop(now + 0.2);
}

/**
 * Play gibberish sound (Animal Crossing style voice)
 * Random syllable-like sounds
 */
async function playGibberish(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Create 2-4 random "syllables"
  const syllableCount = 2 + Math.floor(Math.random() * 3);
  let offset = 0;

  for (let i = 0; i < syllableCount; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    // Random "vowel" frequency
    const baseFreq = 300 + Math.random() * 200;
    const vowelFreq = 600 + Math.random() * 400;

    osc.type = "square";
    osc.frequency.setValueAtTime(baseFreq, now + offset);
    osc.frequency.linearRampToValueAtTime(vowelFreq, now + offset + 0.05);
    osc.frequency.linearRampToValueAtTime(
      baseFreq * 0.9,
      now + offset + 0.08
    );

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1500 + Math.random() * 1000, now + offset);

    gain.gain.setValueAtTime(0.08, now + offset);
    gain.gain.linearRampToValueAtTime(0.1, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + offset);
    osc.stop(now + offset + 0.1);

    offset += 0.08 + Math.random() * 0.04;
  }
}

/**
 * Play a pop sound (player join)
 * Bubbly pop with random pitch variation for musical popcorn effect
 */
async function playPop(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // RANDOM pitch variation - each pop sounds different!
  const baseFreq = 400 + Math.random() * 300; // 400-700Hz range

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.1);

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.15);
}

/**
 * Play a giggle sound (happy short vocalization)
 * 2-3 quick ascending notes with random pitch variation
 */
async function playGiggle(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Random base pitch for variation
  const baseFreq = 500 + Math.random() * 200; // 500-700Hz base

  // 2-3 quick ascending notes
  const noteCount = 2 + Math.floor(Math.random() * 2);
  const noteDuration = 0.06;

  for (let i = 0; i < noteCount; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Each note is higher than the last (ascending giggle)
    const noteFreq = baseFreq * (1 + i * 0.15);

    osc.type = "sine";
    osc.frequency.setValueAtTime(noteFreq, now + i * noteDuration);
    // Small upward pitch bend within each note
    osc.frequency.exponentialRampToValueAtTime(
      noteFreq * 1.1,
      now + i * noteDuration + noteDuration * 0.5
    );

    gain.gain.setValueAtTime(0.15, now + i * noteDuration);
    gain.gain.exponentialRampToValueAtTime(0.01, now + i * noteDuration + noteDuration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + i * noteDuration);
    osc.stop(now + i * noteDuration + noteDuration);
  }
}

/**
 * Play a sound by type
 */
export async function playSound(type: SoundType): Promise<void> {
  if (state.isMuted) return;

  if (!state.audioContext) {
    initAudio();
  }

  switch (type) {
    case "squeak":
      await playSqueak();
      break;
    case "boop":
      await playBoop();
      break;
    case "ropeTension":
      await playRopeTension();
      break;
    case "snip":
      await playSnip();
      break;
    case "celebration":
      await playCelebration();
      break;
    case "gibberish":
      await playGibberish();
      break;
    case "scream":
      await playScream();
      break;
    case "pop":
      await playPop();
      break;
    case "giggle":
      await playGiggle();
      break;
  }
}

/**
 * Play multiple squeaks in quick succession (for collisions)
 */
export async function playSqueakBurst(count: number = 3): Promise<void> {
  if (state.isMuted) return;

  for (let i = 0; i < count; i++) {
    setTimeout(() => playSqueak(), i * 50);
  }
}

/**
 * Preload sounds by creating and immediately destroying oscillators
 * This "warms up" the audio context for faster playback later
 */
export async function preloadSounds(): Promise<void> {
  if (!state.audioContext) {
    initAudio();
  }

  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  // Create a silent oscillator to warm up the context
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.001);
}

/**
 * Clean up audio resources
 */
export function cleanup(): void {
  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
    state.isInitialized = false;
  }
  muteListeners.clear();
}
