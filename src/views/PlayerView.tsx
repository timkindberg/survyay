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

// sessionStorage helpers for session persistence
// Using sessionStorage so each tab/window is an independent player
// sessionStorage survives hot reloads (HMR) but is cleared when the tab closes
const STORAGE_KEY = "survyay_player";

interface StoredSession {
  playerId: string;
  sessionId: string;
  sessionCode: string;
}

function saveSession(playerId: Id<"players">, sessionId: Id<"sessions">, sessionCode: string) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId, sessionId, sessionCode }));
}

function loadSession(): StoredSession | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
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
}

export function PlayerView({ onBack }: Props) {
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState<Id<"players"> | null>(null);
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [error, setError] = useState("");
  const [isRestoring, setIsRestoring] = useState(true);

  // Sound effects
  const { play } = useSoundManager();
  const previousElevation = useRef<number | null>(null);
  const lastAnswerResult = useRef<{ correct: boolean | null; played: boolean } | null>(null);
  const prevPlayerCountRef = useRef(0);

  // Heartbeat for presence tracking - sends every 5 seconds while tab is open
  usePlayerHeartbeat(playerId);

  // Try to restore session from localStorage on mount
  useEffect(() => {
    const stored = loadSession();
    if (stored) {
      setPlayerId(stored.playerId as Id<"players">);
      setSessionId(stored.sessionId as Id<"sessions">);
      setJoinCode(stored.sessionCode);
    }
    setIsRestoring(false);
  }, []);

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
  const players = useQuery(
    api.players.listBySession,
    sessionId ? { sessionId } : "skip"
  );
  const currentQuestion = useQuery(
    api.questions.getCurrentQuestion,
    sessionId ? { sessionId } : "skip"
  );
  const hasAnswered = useQuery(
    api.answers.hasAnswered,
    currentQuestion && playerId
      ? { questionId: currentQuestion._id, playerId }
      : "skip"
  );
  const results = useQuery(
    api.answers.getResults,
    currentQuestion ? { questionId: currentQuestion._id } : "skip"
  );
  const timingInfo = useQuery(
    api.answers.getTimingInfo,
    currentQuestion ? { questionId: currentQuestion._id } : "skip"
  );
  const leaderboard = useQuery(
    api.players.getLeaderboard,
    sessionId ? { sessionId } : "skip"
  );

  // Rope climbing state for active question visualization
  const ropeClimbingState = useQuery(
    api.answers.getRopeClimbingState,
    sessionId ? { sessionId } : "skip"
  ) as RopeClimbingState | null | undefined;

  const submitAnswer = useMutation(api.answers.submit);

  // Track if timer has expired locally
  const [timerExpired, setTimerExpired] = useState(false);

  // Reset timerExpired when question changes
  useEffect(() => {
    setTimerExpired(false);
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

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!getByCode) {
      setError("Session not found");
      return;
    }

    try {
      const id = await joinSession({
        sessionId: getByCode._id,
        name: playerName.trim(),
      });
      setPlayerId(id);
      setSessionId(getByCode._id);
      saveSession(id, getByCode._id, getByCode.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
    }
  }

  function handleLeave() {
    clearSession();
    setPlayerId(null);
    setSessionId(null);
    setJoinCode("");
    setPlayerName("");
  }

  async function handleAnswer(optionIndex: number) {
    if (!currentQuestion || !playerId) return;

    // Play boop sound immediately on answer submit
    play("boop");

    // Store current elevation before submitting
    previousElevation.current = player?.elevation ?? 0;

    const result = await submitAnswer({
      questionId: currentQuestion._id,
      playerId,
      optionIndex,
    });

    // Track the result for sound playback
    if (result) {
      lastAnswerResult.current = { correct: result.correct, played: false };
    }
  }

  // Play celebration or snip sound based on answer result
  useEffect(() => {
    if (lastAnswerResult.current && !lastAnswerResult.current.played) {
      const { correct } = lastAnswerResult.current;
      lastAnswerResult.current.played = true;

      // Small delay to let the UI update first
      setTimeout(() => {
        if (correct === true) {
          play("celebration");
        } else if (correct === false) {
          play("snip");
        }
        // For poll mode (correct === null), no special sound
      }, 100);
    }
  }, [player?.elevation, play]);

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

  // Memoized values for lobby display (must be before early returns)
  const otherPlayers = useMemo(() =>
    players?.filter((p) => p._id !== playerId) ?? [],
    [players, playerId]
  );

  const currentPlayerBlob = useMemo(() =>
    player?.name ? generateBlob(player.name) : null,
    [player?.name]
  );

  // Loading - checking for stored session
  if (isRestoring) {
    return (
      <div className="player-view">
        <p>Loading...</p>
      </div>
    );
  }

  // Not joined yet - show join form
  if (!playerId || !sessionId) {
    return (
      <div className="player-view">
        <button onClick={onBack}>← Back</button>
        <h2>Join a Session</h2>
        <form onSubmit={handleJoin}>
          <input
            type="text"
            placeholder="Join Code (e.g. ABCD)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={4}
          />
          <input
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          {error && <p className="error">{error}</p>}
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

          <button onClick={handleLeave} className="leave-btn">
            Leave Session
          </button>
        </div>
      </div>
    );
  }

  // Game active - show current question
  const questionPhase = ropeClimbingState?.questionPhase ?? "answers_shown";

  return (
    <div className="player-view">
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
        />
      )}

      {currentQuestion ? (
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

          {/* Phase: answers_shown - show answer buttons */}
          {questionPhase === "answers_shown" && (
            hasAnswered ? (
              <p className="waiting">Waiting for results...</p>
            ) : timerExpired ? (
              <p className="waiting time-up">Time's up!</p>
            ) : (
              <div className="options">
                {currentQuestion.options.map((opt, i) => (
                  <button key={i} onClick={() => handleAnswer(i)}>
                    {opt.text}
                  </button>
                ))}
              </div>
            )
          )}

          {/* Phase: revealed - show waiting message */}
          {questionPhase === "revealed" && (
            <p className="waiting">Answers revealed!</p>
          )}

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
