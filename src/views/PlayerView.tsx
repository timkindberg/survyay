import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Mountain } from "../components/Mountain";
import { Timer } from "../components/Timer";
import { Leaderboard } from "../components/Leaderboard";
import { useSoundManager } from "../hooks/useSoundManager";
import type { SoundType } from "../lib/soundManager";
import { usePlayerHeartbeat } from "../hooks/usePlayerHeartbeat";
import { MuteToggle } from "../components/MuteToggle";
import type { RopeClimbingState } from "../../lib/ropeTypes";
import { Blob } from "../components/Blob";
import { generateBlob } from "../lib/blobGenerator";
import { ErrorMessage } from "../components/ErrorMessage";
import { getFriendlyErrorMessage } from "../lib/errorMessages";
import { shuffleOptions, hashString, shuffleWithSeed } from "../../lib/shuffle";

// localStorage helpers for session persistence
// Using localStorage so players can rejoin after closing the browser/tab
const STORAGE_KEY = "blobby_player";

interface StoredSession {
  playerId: string;
  sessionId: string;
  sessionCode: string;
  playerName: string;
}

function saveSession(playerId: Id<"players">, sessionId: Id<"sessions">, sessionCode: string, playerName: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId, sessionId, sessionCode, playerName }));
}

function loadSession(): StoredSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get a deterministic idle animation class based on player name
 */
function getIdleAnimation(name: string): string {
  const animations = ['blob-breathe', 'blob-wiggle', 'blob-bounce', 'blob-float'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return animations[hash % animations.length]!;
}

/**
 * Get a deterministic delay class based on player name for animation desynchronization
 */
function getAnimationDelay(name: string): string {
  const delays = ['', 'blob-delay-1', 'blob-delay-2', 'blob-delay-3', 'blob-delay-4', 'blob-delay-5', 'blob-delay-6'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0) * 2, 0);
  return delays[hash % delays.length]!;
}

interface Props {
  onBack: () => void;
  initialCode?: string | null;
}

export function PlayerView({ onBack, initialCode }: Props) {
  const [joinCode, setJoinCode] = useState(initialCode ?? "");
  const [playerName, setPlayerName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [playerId, setPlayerId] = useState<Id<"players"> | null>(null);
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [error, setError] = useState("");
  const [isRestoring, setIsRestoring] = useState(true);
  const [storedSession, setStoredSession] = useState<StoredSession | null>(null);
  const [isRejoining, setIsRejoining] = useState(false);

  // Sound effects
  const { play } = useSoundManager();
  const prevPlayerCountRef = useRef(0);
  const prevQuestionPhaseRef = useRef<string | null>(null);
  const hasPlayedRevealSoundsRef = useRef<string | null>(null);

  // Heartbeat for presence tracking - sends every 5 seconds while tab is open
  usePlayerHeartbeat(playerId);

  // Check stored session validity via Convex
  const checkStoredSession = useQuery(
    api.players.checkStoredSession,
    storedSession
      ? {
          playerId: storedSession.playerId as Id<"players">,
          sessionId: storedSession.sessionId as Id<"sessions">,
        }
      : "skip"
  );

  const reactivatePlayer = useMutation(api.players.reactivate);

  // Try to restore session from localStorage on mount
  useEffect(() => {
    const stored = loadSession();
    if (stored) {
      // Store locally to trigger the checkStoredSession query
      setStoredSession(stored);
    }
    setIsRestoring(false);
  }, []);

  // Handle the result of checking stored session
  useEffect(() => {
    if (storedSession && checkStoredSession !== undefined) {
      if (checkStoredSession === null) {
        // Stored session is invalid - clear it
        clearSession();
        setStoredSession(null);
      }
      // If valid, we keep storedSession to show the rejoin UI
    }
  }, [storedSession, checkStoredSession]);

  // Auto-focus name input when code is prefilled from URL
  useEffect(() => {
    if (initialCode && !isRestoring && !playerId && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [initialCode, isRestoring, playerId]);

  const getByCode = useQuery(
    api.sessions.getByCode,
    joinCode.length === 4 ? { code: joinCode.toUpperCase() } : "skip"
  );
  const joinSession = useMutation(api.players.join);

  const session = useQuery(
    api.sessions.get,
    sessionId ? { sessionId } : "skip"
  );
  const player = useQuery(
    api.players.get,
    playerId ? { playerId } : "skip"
  );
  const currentQuestion = useQuery(
    api.questions.getCurrentQuestion,
    sessionId ? { sessionId } : "skip"
  );

  // Rope climbing state for active question visualization
  // Placed before players query since we derive player data from it during gameplay
  const ropeClimbingState = useQuery(
    api.answers.getRopeClimbingState,
    sessionId ? { sessionId } : "skip"
  ) as RopeClimbingState | null | undefined;

  // Only fetch full player list in lobby - during gameplay, derive from ropeClimbingState
  // Always fetch players for accurate elevation display on Mountain
  // TODO: Optimize with backend consolidation (Task #115) to add currentElevation to ropeClimbingState
  const players = useQuery(
    api.players.listBySession,
    sessionId ? { sessionId } : "skip"
  );

  // Only fetch leaderboard when needed (results phase or game finished)
  const questionPhaseFromState = ropeClimbingState?.questionPhase ?? null;
  const needsLeaderboard = questionPhaseFromState === "results" || session?.status === "finished";
  const leaderboard = useQuery(
    api.players.getLeaderboard,
    sessionId && needsLeaderboard ? { sessionId } : "skip"
  );

  // Derived from ropeClimbingState - replaces separate hasAnswered subscription
  const hasAnswered = useMemo(() => {
    if (!ropeClimbingState || !playerId) return false;
    return ropeClimbingState.ropes.some(rope =>
      rope.players.some(p => p.playerId === playerId)
    );
  }, [ropeClimbingState, playerId]);

  // Derived from ropeClimbingState - replaces separate timingInfo subscription
  const timingInfo = useMemo(() => {
    if (!ropeClimbingState) return null;
    return {
      firstAnsweredAt: ropeClimbingState.timing.firstAnsweredAt,
      timeLimit: ropeClimbingState.timing.timeLimit,
      totalAnswers: ropeClimbingState.answeredCount,
    };
  }, [ropeClimbingState]);

  const submitAnswer = useMutation(api.answers.submit);

  // State for delayed result reveal - syncs with spectator view scissors animation
  const [playerResultRevealed, setPlayerResultRevealed] = useState(false);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevRevealedQuestionRef = useRef<string | null>(null);

  // Calculate when this player's result should be revealed based on the snip sequence
  useEffect(() => {
    if (!ropeClimbingState || !playerId || !currentQuestion) {
      return;
    }

    const questionId = currentQuestion._id;
    const isRevealed = ropeClimbingState.timing.isRevealed;

    // Reset when question changes
    if (questionId !== prevRevealedQuestionRef.current) {
      prevRevealedQuestionRef.current = questionId;
      setPlayerResultRevealed(false);
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    }

    // Only start timing when revealed phase begins
    if (!isRevealed || playerResultRevealed) {
      return;
    }

    // Find which rope the player is on (if any)
    const playerRopeIndex = ropeClimbingState.ropes.findIndex(
      rope => rope.players.some(p => p.playerId === playerId)
    );

    // If player didn't answer, reveal immediately
    if (playerRopeIndex === -1) {
      setPlayerResultRevealed(true);
      return;
    }

    const playerRope = ropeClimbingState.ropes[playerRopeIndex];
    const isCorrect = playerRope?.isCorrect === true;

    // Get wrong rope indices and shuffle them with the same seed as Mountain.tsx
    const wrongRopeIndices = ropeClimbingState.ropes
      .map((rope, i) => ({ rope, index: i }))
      .filter(({ rope }) => rope.isCorrect === false)
      .map(({ index }) => index);

    const seed = hashString(questionId);
    const shuffledWrongRopes = shuffleWithSeed(wrongRopeIndices, seed);

    // Timing constants (must match Mountain.tsx reveal sequence)
    // Phase 1: Scissors appear at 0ms
    // Phase 2: Tension at 500ms
    // Phase 3: Snipping starts at 1500ms
    // Between snips: 800ms each
    // After last snip to complete: 500ms
    const SNIP_START_DELAY = 1500; // When snipping begins
    const SNIP_INTERVAL = 800; // Time between each snip

    let delayMs: number;

    if (isCorrect) {
      // Correct answer: reveal after ALL wrong ropes are snipped
      // Player sees "Correct!" when their rope is spared (all others cut)
      const numWrongRopes = shuffledWrongRopes.length;
      if (numWrongRopes === 0) {
        // No wrong ropes to snip, reveal immediately after tension
        delayMs = SNIP_START_DELAY;
      } else {
        // Wait for all snips + completion delay
        delayMs = SNIP_START_DELAY + (numWrongRopes - 1) * SNIP_INTERVAL + 500;
      }
    } else {
      // Wrong answer: reveal when THIS player's rope is snipped
      const snipPosition = shuffledWrongRopes.indexOf(playerRopeIndex);
      if (snipPosition === -1) {
        // Shouldn't happen, but fallback to immediate reveal
        delayMs = SNIP_START_DELAY;
      } else {
        // Wait until this rope is snipped
        delayMs = SNIP_START_DELAY + snipPosition * SNIP_INTERVAL;
      }
    }

    // Set timer to reveal player's result
    revealTimerRef.current = setTimeout(() => {
      setPlayerResultRevealed(true);
    }, delayMs);

    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [ropeClimbingState, playerId, currentQuestion, playerResultRevealed]);

  // Track if timer has expired locally
  const [timerExpired, setTimerExpired] = useState(false);

  // Reset timerExpired and answerError when question changes
  useEffect(() => {
    setTimerExpired(false);
    setAnswerError(null);
  }, [currentQuestion?._id]);

  // If restored session is invalid (player deleted, session gone), clear it
  useEffect(() => {
    if (!isRestoring && playerId && player === null) {
      // Player no longer exists in DB - clear stored session
      clearSession();
      setPlayerId(null);
      setSessionId(null);
    }
  }, [isRestoring, playerId, player]);

  // Clear localStorage when session finishes
  useEffect(() => {
    if (session?.status === "finished") {
      clearSession();
    }
  }, [session?.status]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!getByCode) {
      setError("Game not found. Check the code and try again.");
      return;
    }

    try {
      const trimmedName = playerName.trim();
      const id = await joinSession({
        sessionId: getByCode._id,
        name: trimmedName,
      });
      setPlayerId(id);
      setSessionId(getByCode._id);
      setStoredSession(null); // Clear stored session state since we're now joined
      saveSession(id, getByCode._id, getByCode.code, trimmedName);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    }
  }

  async function handleRejoin() {
    if (!storedSession) return;
    setIsRejoining(true);
    setError("");

    try {
      await reactivatePlayer({
        playerId: storedSession.playerId as Id<"players">,
      });
      setPlayerId(storedSession.playerId as Id<"players">);
      setSessionId(storedSession.sessionId as Id<"sessions">);
      setStoredSession(null);
    } catch (err) {
      // Session/player no longer valid - clear and show join form
      clearSession();
      setStoredSession(null);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsRejoining(false);
    }
  }

  function handleStartFresh() {
    clearSession();
    setStoredSession(null);
    setJoinCode(initialCode ?? "");
    setPlayerName("");
  }

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  function handleLeave() {
    clearSession();
    setStoredSession(null);
    setPlayerId(null);
    setSessionId(null);
    setJoinCode("");
    setPlayerName("");
    setShowLeaveConfirm(false);
  }

  // Track answer submission error separately (for toast display during gameplay)
  const [answerError, setAnswerError] = useState<string | null>(null);

  async function handleAnswer(optionIndex: number) {
    if (!currentQuestion || !playerId) return;

    // Play boop sound immediately on answer submit
    play("boop");

    try {
      await submitAnswer({
        questionId: currentQuestion._id,
        playerId,
        optionIndex,
      });
      setAnswerError(null);
    } catch (err) {
      setAnswerError(getFriendlyErrorMessage(err));
    }
  }

  // Play reveal sounds when player's result is revealed (synced with scissors animation)
  useEffect(() => {
    if (!ropeClimbingState || !playerId || !currentQuestion) return;

    const questionId = currentQuestion._id;

    // Only play sounds when playerResultRevealed becomes true
    if (playerResultRevealed && hasPlayedRevealSoundsRef.current !== questionId) {
      hasPlayedRevealSoundsRef.current = questionId;

      // Find if this player answered and if they were correct
      const playerRopeIndex = ropeClimbingState.ropes.findIndex(
        rope => rope.players.some(p => p.playerId === playerId)
      );
      const didAnswer = playerRopeIndex !== -1;

      if (didAnswer) {
        const playerRope = ropeClimbingState.ropes[playerRopeIndex];
        const isCorrect = playerRope?.isCorrect === true;

        if (isCorrect) {
          // Play happy sound for correct answer
          play("blobHappy");
        } else {
          // Play snip then sad sound for wrong answer
          play("snip");
          setTimeout(() => {
            play("blobSad");
          }, 300);
        }
      }
    }

    // Reset when question changes (playerResultRevealed will also reset)
    if (!playerResultRevealed) {
      hasPlayedRevealSoundsRef.current = null;
    }
  }, [ropeClimbingState, currentQuestion?._id, playerId, play, playerResultRevealed]);

  // Play pop/giggle sounds when new players join the lobby
  useEffect(() => {
    if (!players) return;

    const currentCount = players.length;
    const prevCount = prevPlayerCountRef.current;

    if (currentCount > prevCount && prevCount > 0) {
      // New player(s) joined! Play random sound (weighted toward pop)
      const sounds: SoundType[] = ["pop", "pop", "pop", "giggle"];
      const sound = sounds[Math.floor(Math.random() * sounds.length)]!;
      play(sound);
    }

    prevPlayerCountRef.current = currentCount;
  }, [players?.length, play]);

  // Play sound when a new question is shown (transition TO question_shown phase)
  const currentQuestionPhase = ropeClimbingState?.questionPhase ?? null;
  useEffect(() => {
    const prevPhase = prevQuestionPhaseRef.current;

    // Only play sound when transitioning TO question_shown from a different phase
    if (currentQuestionPhase === "question_shown" && prevPhase !== "question_shown" && prevPhase !== null) {
      play("questionReveal");
    }

    prevQuestionPhaseRef.current = currentQuestionPhase;
  }, [currentQuestionPhase, play]);

  // Play "Get Ready!" sound when entering pre_game phase (game is about to start)
  const prevSessionPhaseRef = useRef<string | null>(null);
  const isPreGame = session?.status === "active" && session?.questionPhase === "pre_game";
  useEffect(() => {
    const currentPhase = isPreGame ? "pre_game" : session?.status ?? null;
    const prevPhase = prevSessionPhaseRef.current;

    // Play sound when transitioning INTO pre_game phase
    if (isPreGame && prevPhase !== "pre_game") {
      play("getReady");
    }

    prevSessionPhaseRef.current = currentPhase;
  }, [isPreGame, session?.status, play]);

  // Memoized values for lobby display (must be before early returns)
  const otherPlayers = useMemo(() =>
    players?.filter((p) => p._id !== playerId) ?? [],
    [players, playerId]
  );

  const currentPlayerBlob = useMemo(() =>
    player?.name ? generateBlob(player.name) : null,
    [player?.name]
  );

  // Compute shuffled options for deterministic randomization
  // Uses session code + question index as seed so all views see the same order
  const shuffledAnswers = useMemo(() => {
    if (!currentQuestion || !session?.code || session.currentQuestionIndex < 0) {
      return null;
    }
    return shuffleOptions(
      currentQuestion.options,
      session.code,
      session.currentQuestionIndex
    );
  }, [currentQuestion, session?.code, session?.currentQuestionIndex]);

  // Loading - checking for stored session
  if (isRestoring) {
    return (
      <div className="player-view">
        <p>Loading...</p>
      </div>
    );
  }

  // Not joined yet - show rejoin UI or join form
  if (!playerId || !sessionId) {
    // Show rejoin UI if we have a valid stored session
    if (storedSession && checkStoredSession) {
      return (
        <div className="player-view">
          <button onClick={onBack}>- Back</button>
          <div className="rejoin-panel">
            <h2>Welcome Back!</h2>
            <p className="rejoin-message">You have an active game.</p>
            <div className="rejoin-info">
              <span className="rejoin-name">{storedSession.playerName}</span>
              <span className="rejoin-session">Session: {checkStoredSession.session.code}</span>
              <span className="rejoin-elevation">{checkStoredSession.player.elevation}m</span>
            </div>
            <ErrorMessage
              message={error}
              onDismiss={() => setError("")}
              variant="inline"
            />
            <div className="rejoin-actions">
              <button
                onClick={handleRejoin}
                disabled={isRejoining}
                className="rejoin-btn primary"
              >
                {isRejoining ? "Rejoining..." : `Rejoin as ${storedSession.playerName}`}
              </button>
              <button
                onClick={handleStartFresh}
                className="rejoin-btn secondary"
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Show join form
    return (
      <div className="player-view">
        <button onClick={onBack}>- Back</button>
        <h2>Join a Session</h2>
        <form onSubmit={handleJoin}>
          <input
            type="text"
            placeholder="Join Code (e.g. ABCD)"
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase());
              setError(""); // Clear error when user types
            }}
            maxLength={4}
          />
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => {
              setPlayerName(e.target.value);
              setError(""); // Clear error when user types
            }}
          />
          <ErrorMessage
            message={error}
            onDismiss={() => setError("")}
            variant="inline"
          />
          <button type="submit" disabled={!getByCode || !playerName.trim()}>
            Join
          </button>
        </form>
      </div>
    );
  }

  // Game finished - show final results
  if (session?.status === "finished") {
    return (
      <div className="player-view">
        <h2>Game Over!</h2>
        <p>Your elevation: {player?.elevation ?? 0}m</p>
        <h3>Leaderboard</h3>
        <ol>
          {leaderboard?.map((p) => (
            <li key={p._id} className={p._id === playerId ? "you" : ""}>
              {p.name}: {p.elevation}m {p.elevation >= 1000 ? "⛰️ Summit!" : ""}
            </li>
          ))}
        </ol>
        <button onClick={onBack}>Back to Home</button>
      </div>
    );
  }

  // In lobby - waiting for game to start
  if (session?.status === "lobby") {
    return (
      <div className="player-view">
        <div className="waiting-lobby">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 8 }}>
            <h2 style={{ margin: 0, flex: 1 }}>Waiting for host to start...</h2>
            <MuteToggle size={32} />
          </div>
          <p className="session-code">Session: {session.code}</p>

          {/* Other players' blobs - arranged in a row */}
          {otherPlayers.length > 0 && (
            <div className="other-players-blobs">
              {otherPlayers.map((p) => {
                const blobConfig = generateBlob(p.name);
                const animationClass = getIdleAnimation(p.name);
                const delayClass = getAnimationDelay(p.name);
                return (
                  <div
                    key={p._id}
                    className={`waiting-blob ${animationClass} ${delayClass}`}
                  >
                    <Blob config={blobConfig} size={60} />
                    <span>{p.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Current player's blob - larger and centered */}
          {currentPlayerBlob && player && (
            <div className="current-player-blob blob-breathe">
              <Blob config={currentPlayerBlob} size={120} />
              <span className="current-player-name">{player.name}</span>
            </div>
          )}

          <p className="player-count">
            {players?.length ?? 0} player{(players?.length ?? 0) !== 1 ? 's' : ''} joined
          </p>

          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="leave-link"
          >
            Leave game
          </button>

          {/* Leave confirmation dialog */}
          {showLeaveConfirm && (
            <div className="leave-confirm-overlay" onClick={() => setShowLeaveConfirm(false)}>
              <div className="leave-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <p>Are you sure you want to leave this game?</p>
                <div className="leave-confirm-actions">
                  <button onClick={() => setShowLeaveConfirm(false)} className="leave-confirm-cancel">
                    Stay
                  </button>
                  <button onClick={handleLeave} className="leave-confirm-leave">
                    Leave
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Game active - show current question
  const questionPhase = ropeClimbingState?.questionPhase ?? "answers_shown";

  return (
    <div className="player-view">
      {/* Answer submission error toast */}
      <ErrorMessage
        message={answerError}
        onDismiss={() => setAnswerError(null)}
        variant="toast"
        autoDismissMs={4000}
      />

      <div className="score-bar">
        <span>{player?.name}</span>
        <span>{player?.elevation ?? 0}m</span>
        <MuteToggle size={32} />
      </div>

      {/* Mountain visualization - shows player's position */}
      {players && players.length > 0 && playerId && (
        <Mountain
          players={players.map((p) => ({
            id: p._id,
            name: p.name,
            elevation: p.elevation,
          }))}
          mode="player"
          currentPlayerElevation={player?.elevation ?? 0}
          currentPlayerId={playerId}
          width={320}
          height={250}
          ropeClimbingState={ropeClimbingState}
          answerShuffleOrder={shuffledAnswers?.shuffledOptions.map(o => o.originalIndex)}
        />
      )}

      {/* Pre-game phase - game started but no question shown yet */}
      {session?.status === "active" && session.questionPhase === "pre_game" && !currentQuestion ? (
        <div className="player-pregame">
          <div className="player-pregame-content">
            <h2 className="player-pregame-title">Get Ready!</h2>
            <p className="player-pregame-subtitle">The climb is about to begin...</p>
            {currentPlayerBlob && (
              <div className="player-pregame-blob blob-bounce">
                <Blob config={currentPlayerBlob} size={100} />
              </div>
            )}
            <p className="player-pregame-players">
              {players?.length ?? 0} climber{(players?.length ?? 0) !== 1 ? 's' : ''} ready
            </p>
          </div>
        </div>
      ) : currentQuestion ? (
        <div className="question">
          {/* Timer display - only show during answers_shown phase or later */}
          {questionPhase !== "question_shown" && (
            <div className="question-timer">
              <Timer
                firstAnsweredAt={timingInfo?.firstAnsweredAt ?? null}
                timeLimit={currentQuestion.timeLimit}
                onExpire={() => setTimerExpired(true)}
                size="medium"
                isRevealed={ropeClimbingState?.timing.isRevealed ?? false}
                correctAnswer={ropeClimbingState?.ropes.find(r => r.isCorrect === true)?.optionText}
                correctCount={ropeClimbingState?.ropes.find(r => r.isCorrect === true)?.players.length}
                totalAnswered={ropeClimbingState?.answeredCount}
              />
            </div>
          )}

          <h2>{currentQuestion.text}</h2>

          {/* Phase: question_shown - waiting for host to show answers */}
          {questionPhase === "question_shown" && (
            <p className="waiting">Waiting for host to show answers...</p>
          )}

          {/* Phase: answers_shown - show answer buttons (shuffled order) */}
          {questionPhase === "answers_shown" && (
            hasAnswered ? (
              <p className="waiting">Waiting for results...</p>
            ) : timerExpired ? (
              <p className="waiting time-up">Time's up!</p>
            ) : shuffledAnswers ? (
              <div className="options">
                {shuffledAnswers.shuffledOptions.map((item, visualIndex) => (
                  <button
                    key={item.originalIndex}
                    onClick={() => handleAnswer(item.originalIndex)}
                  >
                    <span className="option-label">{String.fromCharCode(65 + visualIndex)}.</span>
                    {item.option.text}
                  </button>
                ))}
              </div>
            ) : (
              <div className="options">
                {currentQuestion.options.map((opt, i) => (
                  <button key={i} onClick={() => handleAnswer(i)}>
                    <span className="option-label">{String.fromCharCode(65 + i)}.</span>
                    {opt.text}
                  </button>
                ))}
              </div>
            )
          )}

          {/* Phase: revealed - show answer feedback with all options (shuffled order) */}
          {questionPhase === "revealed" && ropeClimbingState && (() => {
            // Find which original option index the player selected and get their data
            let playerElevationGain: number | undefined;
            const playerSelectedOriginalIndex = ropeClimbingState.ropes.findIndex(
              rope => {
                const found = rope.players.find(p => p.playerId === playerId);
                if (found) playerElevationGain = found.elevationGain;
                return !!found;
              }
            );
            const correctOriginalIndex = ropeClimbingState.ropes.findIndex(r => r.isCorrect === true);
            const isCorrect = playerSelectedOriginalIndex === correctOriginalIndex && playerSelectedOriginalIndex !== -1;
            const didAnswer = playerSelectedOriginalIndex !== -1;
            const elevationGain = playerElevationGain ?? 0;

            // Use shuffled options for display (same order as when answering)
            const optionsToDisplay = shuffledAnswers
              ? shuffledAnswers.shuffledOptions
              : currentQuestion.options.map((opt, i) => ({ option: opt, originalIndex: i, shuffledIndex: i }));

            return (
              <div className="reveal-feedback">
                {/* Tension state while waiting for result - show scissors animation */}
                {!playerResultRevealed && (
                  <div className="result-banner tension">
                    <span className="scissors-icon">✂️</span>
                    <span className="result-text tension-text">...</span>
                  </div>
                )}

                {/* Prominent result message - only show after player's result is revealed */}
                {playerResultRevealed && (
                  didAnswer ? (
                    <div className={`result-banner ${isCorrect ? 'correct' : 'wrong'}`}>
                      {isCorrect ? (
                        <>
                          <span className="result-text">CORRECT!</span>
                          <span className="elevation-gain">+{elevationGain}m</span>
                        </>
                      ) : (
                        <>
                          <span className="result-text">WRONG!</span>
                          <span className="elevation-gain">+0m</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="result-banner no-answer">
                      <span className="result-text">No Answer</span>
                      <span className="elevation-gain">+0m</span>
                    </div>
                  )
                )}

                {/* Show all options with highlighting (in shuffled order) - only after result revealed */}
                {playerResultRevealed && (
                  <div className="options revealed">
                    {optionsToDisplay.map((item, visualIndex) => {
                      const originalIndex = item.originalIndex;
                      const rope = ropeClimbingState.ropes[originalIndex];
                      const isThisCorrect = rope?.isCorrect === true;
                      const isPlayerSelection = originalIndex === playerSelectedOriginalIndex;

                      let className = 'option-revealed';
                      if (isThisCorrect) {
                        className += ' correct-answer';
                      }
                      if (isPlayerSelection && !isThisCorrect) {
                        className += ' wrong-selection';
                      }
                      if (isPlayerSelection) {
                        className += ' player-selected';
                      }

                      // Label based on visual position (A, B, C, D for positions 0, 1, 2, 3)
                      const visualLabel = String.fromCharCode(65 + visualIndex);

                      return (
                        <div key={originalIndex} className={className}>
                          <span className="option-label">{visualLabel}.</span>
                          <span className="option-text">{item.option.text}</span>
                          {isPlayerSelection && <span className="your-pick">Your pick</span>}
                          {isThisCorrect && <span className="correct-label">Correct</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Phase: results - show leaderboard with player's position */}
          {questionPhase === "results" && leaderboard && (
            <div className="results-leaderboard">
              <h3>Leaderboard</h3>
              <Leaderboard
                players={leaderboard}
                maxDisplay={5}
                currentPlayerId={playerId ?? undefined}
                compact
                className="leaderboard-light"
              />
            </div>
          )}
        </div>
      ) : (
        <p>Waiting for question...</p>
      )}
    </div>
  );
}
