/**
 * Sound Manager for Surv-Yay!
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
  | "giggle" // Short happy vocalization
  | "questionReveal" // New question appearing (whoosh/attention tone)
  | "getReady" // Attention-grabbing fanfare when game starts
  | "chitter" // Excited blob squeaks/chirps at game start
  | "blobSad" // Sad descending tones for wrong answers (oh no!)
  | "blobHappy" // Happy ascending tones for correct answers (yay!)
  | "blobAmbient" // Random ambient sounds for lobby (tiny chirps, boops, hums)
  | "scissorsSafe"; // Relief sound when scissors fade away from correct rope

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
 * Play question reveal sound (new question appearing)
 * Attention-getting "whoosh" with rising tone - distinct from "Get Ready!" but similarly engaging
 */
async function playQuestionReveal(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Whoosh component - filtered noise sweep
  const noiseBuffer = createNoiseBuffer(ctx, 0.3);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.Q.setValueAtTime(2, now);
  noiseFilter.frequency.setValueAtTime(200, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(2000, now + 0.15);
  noiseFilter.frequency.exponentialRampToValueAtTime(800, now + 0.25);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.12, now + 0.05);
  noiseGain.gain.linearRampToValueAtTime(0.08, now + 0.15);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  noiseSource.start(now);
  noiseSource.stop(now + 0.3);

  // Rising tone component - attention-getting musical element
  const toneOsc = ctx.createOscillator();
  const toneGain = ctx.createGain();

  toneOsc.type = "sine";
  toneOsc.frequency.setValueAtTime(300, now + 0.05);
  toneOsc.frequency.exponentialRampToValueAtTime(600, now + 0.2);
  toneOsc.frequency.exponentialRampToValueAtTime(500, now + 0.3);

  toneGain.gain.setValueAtTime(0, now + 0.05);
  toneGain.gain.linearRampToValueAtTime(0.15, now + 0.1);
  toneGain.gain.setValueAtTime(0.15, now + 0.2);
  toneGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

  toneOsc.connect(toneGain);
  toneGain.connect(ctx.destination);

  toneOsc.start(now + 0.05);
  toneOsc.stop(now + 0.35);

  // Accent note - short high ping for emphasis
  const accentOsc = ctx.createOscillator();
  const accentGain = ctx.createGain();

  accentOsc.type = "triangle";
  accentOsc.frequency.setValueAtTime(800, now + 0.15);
  accentOsc.frequency.exponentialRampToValueAtTime(1000, now + 0.2);

  accentGain.gain.setValueAtTime(0.1, now + 0.15);
  accentGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  accentOsc.connect(accentGain);
  accentGain.connect(ctx.destination);

  accentOsc.start(now + 0.15);
  accentOsc.stop(now + 0.3);
}

/**
 * Play "Get Ready!" sound (game start fanfare)
 * Attention-grabbing ascending fanfare with energy and excitement
 */
async function playGetReady(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Three-note ascending fanfare (G4 -> B4 -> D5) with sustain
  const fanfareNotes = [392, 493.88, 587.33]; // G4, B4, D5
  const fanfareDelays = [0, 0.15, 0.3];

  fanfareNotes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square"; // Brighter, more attention-grabbing
    osc.frequency.setValueAtTime(freq, now + fanfareDelays[i]!);

    // Quick attack, hold, then fade
    gain.gain.setValueAtTime(0.18, now + fanfareDelays[i]!);
    gain.gain.setValueAtTime(0.18, now + fanfareDelays[i]! + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.01, now + fanfareDelays[i]! + 0.4);

    // Add a lowpass filter to soften the square wave slightly
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2000, now + fanfareDelays[i]!);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + fanfareDelays[i]!);
    osc.stop(now + fanfareDelays[i]! + 0.5);
  });

  // Final high sustained note (G5) - the "punch" of the fanfare
  const finalOsc = ctx.createOscillator();
  const finalGain = ctx.createGain();
  const finalFilter = ctx.createBiquadFilter();

  finalOsc.type = "sine";
  finalOsc.frequency.setValueAtTime(783.99, now + 0.45); // G5

  finalGain.gain.setValueAtTime(0.22, now + 0.45);
  finalGain.gain.setValueAtTime(0.22, now + 0.65);
  finalGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

  finalFilter.type = "lowpass";
  finalFilter.frequency.setValueAtTime(3000, now + 0.45);

  finalOsc.connect(finalFilter);
  finalFilter.connect(finalGain);
  finalGain.connect(ctx.destination);

  finalOsc.start(now + 0.45);
  finalOsc.stop(now + 1.0);

  // Add shimmer/sparkle on the final note
  const shimmer = ctx.createOscillator();
  const shimmerGain = ctx.createGain();

  shimmer.type = "triangle";
  shimmer.frequency.setValueAtTime(1567.98, now + 0.5); // G6
  shimmer.frequency.linearRampToValueAtTime(2000, now + 0.7);

  shimmerGain.gain.setValueAtTime(0.06, now + 0.5);
  shimmerGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

  shimmer.connect(shimmerGain);
  shimmerGain.connect(ctx.destination);

  shimmer.start(now + 0.5);
  shimmer.stop(now + 0.8);
}

/**
 * Play chitter sound (excited blob noise)
 * Short excited chirp/squeak with pitch variation based on optional seed
 * @param pitchSeed - Optional number to create deterministic pitch variation per blob
 */
async function playChitter(pitchSeed?: number): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Use seed for deterministic pitch, or random if not provided
  const seedValue = pitchSeed ?? Math.random() * 1000;
  const pitchVariation = ((seedValue * 7) % 100) / 100; // 0-1 range
  const baseFreq = 600 + pitchVariation * 400; // 600-1000Hz range

  // Quick 2-3 note excited chirp
  const noteCount = 2 + Math.floor((seedValue * 3) % 2); // 2 or 3 notes
  const noteDuration = 0.04;

  for (let i = 0; i < noteCount; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Alternating up-down pattern for excited chitter
    const noteFreq = baseFreq * (1 + (i % 2 === 0 ? 0.2 : 0));

    osc.type = "sine";
    osc.frequency.setValueAtTime(noteFreq, now + i * noteDuration);
    // Quick pitch bend for liveliness
    osc.frequency.exponentialRampToValueAtTime(
      noteFreq * 1.15,
      now + i * noteDuration + noteDuration * 0.7
    );

    gain.gain.setValueAtTime(0.12, now + i * noteDuration);
    gain.gain.exponentialRampToValueAtTime(0.01, now + i * noteDuration + noteDuration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + i * noteDuration);
    osc.stop(now + i * noteDuration + noteDuration + 0.01);
  }
}

/**
 * Play blob sad sound ("oh no!")
 * Sad descending tones like a cute "wah wah" - think sad trombone but blobby
 */
async function playBlobSad(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Random pitch variation for character
  const baseFreq = 400 + Math.random() * 100;

  // Two descending notes for "wah wah" effect
  const notes = [
    { freq: baseFreq, start: 0 },
    { freq: baseFreq * 0.75, start: 0.15 },
  ];

  notes.forEach(({ freq, start }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Start high, slide down within each note for extra sadness
    osc.frequency.setValueAtTime(freq * 1.1, now + start);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + start + 0.12);

    gain.gain.setValueAtTime(0.18, now + start);
    gain.gain.setValueAtTime(0.18, now + start + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.01, now + start + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + start);
    osc.stop(now + start + 0.15);
  });

  // Add a subtle warble/vibrato to make it more expressive
  const warble = ctx.createOscillator();
  const warbleGain = ctx.createGain();

  warble.type = "triangle";
  warble.frequency.setValueAtTime(baseFreq * 1.5, now);
  warble.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.3);

  warbleGain.gain.setValueAtTime(0.05, now);
  warbleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  warble.connect(warbleGain);
  warbleGain.connect(ctx.destination);

  warble.start(now);
  warble.stop(now + 0.3);
}

/**
 * Play blob happy sound ("yay!")
 * Happy ascending chirps/squeaks - celebratory and cute
 */
async function playBlobHappy(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Random pitch variation for character
  const baseFreq = 500 + Math.random() * 150;

  // Three quick ascending notes for excitement
  const notes = [
    { freq: baseFreq, start: 0 },
    { freq: baseFreq * 1.25, start: 0.07 },
    { freq: baseFreq * 1.5, start: 0.14 },
  ];

  notes.forEach(({ freq, start }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Small upward pitch bend within each note for extra perkiness
    osc.frequency.setValueAtTime(freq, now + start);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.15, now + start + 0.05);

    gain.gain.setValueAtTime(0.15, now + start);
    gain.gain.exponentialRampToValueAtTime(0.01, now + start + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + start);
    osc.stop(now + start + 0.08);
  });

  // Add a sparkle/shimmer on the final note
  const sparkle = ctx.createOscillator();
  const sparkleGain = ctx.createGain();

  sparkle.type = "triangle";
  sparkle.frequency.setValueAtTime(baseFreq * 3, now + 0.15);
  sparkle.frequency.linearRampToValueAtTime(baseFreq * 4, now + 0.25);

  sparkleGain.gain.setValueAtTime(0.06, now + 0.15);
  sparkleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

  sparkle.connect(sparkleGain);
  sparkleGain.connect(ctx.destination);

  sparkle.start(now + 0.15);
  sparkle.stop(now + 0.25);
}

/**
 * Play a random ambient blob sound for lobby atmosphere
 * Varies between tiny boops, chirps, squeaks, and soft hums
 * Kept subtle and quiet so they don't get annoying during waiting
 */
async function playBlobAmbient(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Randomly select which type of ambient sound to play
  const soundType = Math.floor(Math.random() * 5);

  // Lower gain for ambient sounds - they should be subtle background noise
  const ambientGain = 0.06 + Math.random() * 0.04; // 0.06-0.10 range (quiet!)

  switch (soundType) {
    case 0: {
      // Tiny boop - very short sine wave blip (~80ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = 350 + Math.random() * 200; // 350-550Hz range
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.08);

      gain.gain.setValueAtTime(ambientGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
      break;
    }

    case 1: {
      // Small chirp - quick pitch slide up (~100ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const baseFreq = 500 + Math.random() * 300; // 500-800Hz
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.4, now + 0.06);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.2, now + 0.1);

      gain.gain.setValueAtTime(ambientGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
      break;
    }

    case 2: {
      // Downward chirp - pitch slide down (~100ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const baseFreq = 700 + Math.random() * 300; // 700-1000Hz
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, now + 0.1);

      gain.gain.setValueAtTime(ambientGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
      break;
    }

    case 3: {
      // Soft hum - very short sustained tone (~150ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = 250 + Math.random() * 150; // 250-400Hz (lower, warmer)
      osc.type = "triangle"; // Softer than sine
      osc.frequency.setValueAtTime(freq, now);
      // Tiny vibrato for warmth
      osc.frequency.linearRampToValueAtTime(freq * 1.02, now + 0.05);
      osc.frequency.linearRampToValueAtTime(freq * 0.98, now + 0.1);
      osc.frequency.linearRampToValueAtTime(freq, now + 0.15);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(ambientGain * 0.7, now + 0.03); // Soft attack
      gain.gain.setValueAtTime(ambientGain * 0.7, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
      break;
    }

    case 4: {
      // Little squeak - higher pitched quick note (~70ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = 900 + Math.random() * 400; // 900-1300Hz (higher)
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 0.03);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + 0.07);

      // Squeaks are even quieter
      gain.gain.setValueAtTime(ambientGain * 0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
      break;
    }
  }
}

/**
 * Play scissors safe sound (relief when scissors fade from correct rope)
 * Pleasant high "ding" sound indicating safety - like a bell or chime
 */
async function playScissorsSafe(): Promise<void> {
  const ctx = state.audioContext;
  if (!ctx) return;

  await ensureAudioResumed();

  const now = ctx.currentTime;

  // Main ding - pleasant high bell tone
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(1047, now); // C6 - high, pleasant
  osc.frequency.exponentialRampToValueAtTime(1100, now + 0.05); // Slight rise
  osc.frequency.exponentialRampToValueAtTime(1047, now + 0.2); // Settle back

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.setValueAtTime(0.2, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.4);

  // Add harmonic shimmer for extra relief feeling
  const shimmer = ctx.createOscillator();
  const shimmerGain = ctx.createGain();

  shimmer.type = "triangle";
  shimmer.frequency.setValueAtTime(2094, now + 0.02); // C7 - octave above
  shimmer.frequency.linearRampToValueAtTime(2200, now + 0.15);

  shimmerGain.gain.setValueAtTime(0.08, now + 0.02);
  shimmerGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  shimmer.connect(shimmerGain);
  shimmerGain.connect(ctx.destination);

  shimmer.start(now + 0.02);
  shimmer.stop(now + 0.3);
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
    case "questionReveal":
      await playQuestionReveal();
      break;
    case "getReady":
      await playGetReady();
      break;
    case "chitter":
      await playChitter();
      break;
    case "blobSad":
      await playBlobSad();
      break;
    case "blobHappy":
      await playBlobHappy();
      break;
    case "blobAmbient":
      await playBlobAmbient();
      break;
    case "scissorsSafe":
      await playScissorsSafe();
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
 * Play multiple chitters in quick succession (for excited blobs)
 * Each chitter has a different pitch based on its index for variety
 * @param count - Number of chitters to play (default 3)
 * @param maxCount - Maximum to play even if count is higher (for many players)
 */
export async function playChitterBurst(count: number = 3, maxCount: number = 5): Promise<void> {
  if (state.isMuted) return;

  const actualCount = Math.min(count, maxCount);

  for (let i = 0; i < actualCount; i++) {
    // Stagger the chitters with slight randomization for natural feel
    const delay = i * 120 + Math.random() * 60;
    setTimeout(() => playChitter(i * 100 + Math.random() * 50), delay);
  }
}

/**
 * Play multiple snip sounds for wrong ropes (spectator view)
 * @param count - Number of wrong ropes/snips to play
 * @param maxCount - Maximum to play even if count is higher
 */
export async function playSnipBurst(count: number = 1, maxCount: number = 4): Promise<void> {
  if (state.isMuted) return;

  const actualCount = Math.min(count, maxCount);

  for (let i = 0; i < actualCount; i++) {
    // Stagger snips slightly for dramatic effect
    const delay = i * 150 + Math.random() * 50;
    setTimeout(() => playSnip(), delay);
  }
}

/**
 * Play multiple blob sad sounds for wrong answers (spectator view)
 * @param count - Number of sad blobs
 * @param maxCount - Maximum to play even if count is higher
 */
export async function playBlobSadBurst(count: number = 1, maxCount: number = 4): Promise<void> {
  if (state.isMuted) return;

  const actualCount = Math.min(count, maxCount);

  for (let i = 0; i < actualCount; i++) {
    // Stagger sad sounds for chorus of disappointment
    const delay = i * 100 + Math.random() * 80;
    setTimeout(() => playBlobSad(), delay);
  }
}

/**
 * Play multiple blob happy sounds for correct answers (spectator view)
 * @param count - Number of happy blobs
 * @param maxCount - Maximum to play even if count is higher
 */
export async function playBlobHappyBurst(count: number = 1, maxCount: number = 4): Promise<void> {
  if (state.isMuted) return;

  const actualCount = Math.min(count, maxCount);

  for (let i = 0; i < actualCount; i++) {
    // Stagger happy sounds for chorus of celebration
    const delay = i * 80 + Math.random() * 60;
    setTimeout(() => playBlobHappy(), delay);
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
