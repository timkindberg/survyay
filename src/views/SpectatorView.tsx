import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import "./SpectatorView.css";
import { Mountain, type SkyQuestion } from "../components/mountain";
import { Leaderboard } from "../components/Leaderboard";
import { Blob } from "../components/Blob";
import { generateBlob } from "../lib/blobGenerator";
import { SUMMIT } from "../../lib/elevation";
import type { RopeClimbingState } from "../../lib/ropeTypes";
import { useSoundManager } from "../hooks/useSoundManager";
import { playSound } from "../lib/soundManager";
import { shuffleOptions } from "../../lib/shuffle";

interface Props {
  sessionCode: string;
  onBack: () => void;
}

/**
 * SpectatorView - Display-only view for projectors and big screens
 *
 * Shows the mountain visualization with all players, current question,
 * and timer. No admin controls - this is purely for audience viewing.
 */
export function SpectatorView({ sessionCode, onBack }: Props) {
  // Sound effects for player join, question reveal, and game start
  // NOTE: Reveal sounds (snip, blobSad, blobHappy) are handled by Mountain.tsx
  const { play, playChitters, muted, toggleMute } = useSoundManager();
  const prevPlayerCountRef = useRef(0);
  const prevQuestionPhaseRef = useRef<string | null>(null);
  const prevSessionPhaseRef = useRef<string | null>(null);
  const hasPlayedRevealSoundsRef = useRef<string | null>(null);

  // Track window dimensions for full-screen mountain
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Update dimensions on resize
  useEffect(() => {
    function handleResize() {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Look up session by code
  const session = useQuery(api.sessions.getByCode, { code: sessionCode });

  // Get players and question data once we have a session
  const sessionId = session?._id as Id<"sessions"> | undefined;

  // Rope climbing state for active question visualization
  // Placed before players query since we derive player data from it during gameplay
  const ropeClimbingState = useQuery(
    api.answers.getRopeClimbingState,
    sessionId ? { sessionId } : "skip"
  ) as RopeClimbingState | null | undefined;

  // Always fetch players for accurate elevation display
  // (SpectatorView only has 1 client, so this doesn't impact subscription limits)
  const players = useQuery(
    api.players.listBySession,
    sessionId ? { sessionId } : "skip"
  );

  const currentQuestion = useQuery(
    api.questions.getCurrentQuestion,
    sessionId ? { sessionId } : "skip"
  );

  const questions = useQuery(
    api.questions.listBySession,
    sessionId ? { sessionId } : "skip"
  );

  // Derived from ropeClimbingState - replaces separate timingInfo subscription
  const timingInfo = useMemo(() => {
    if (!ropeClimbingState) return null;
    return {
      firstAnsweredAt: ropeClimbingState.timing.firstAnsweredAt,
      timeLimit: ropeClimbingState.timing.timeLimit,
      totalAnswers: ropeClimbingState.answeredCount,
    };
  }, [ropeClimbingState]);

  // Only fetch leaderboard when needed (results phase or game finished)
  const questionPhaseFromState = ropeClimbingState?.questionPhase ?? null;
  const needsLeaderboard = questionPhaseFromState === "results" || session?.status === "finished";
  const leaderboard = useQuery(
    api.players.getLeaderboard,
    sessionId && needsLeaderboard ? { sessionId } : "skip"
  );

  // Play pop/giggle sounds when new players join the lobby
  useEffect(() => {
    if (!players || session?.status !== "lobby") return;

    const currentCount = players.length;
    const prevCount = prevPlayerCountRef.current;

    if (currentCount > prevCount && prevCount > 0) {
      // New player(s) joined! Play a pop sound for each new player with stagger
      const newPlayers = currentCount - prevCount;
      for (let i = 0; i < Math.min(newPlayers, 5); i++) {
        // Stagger sounds slightly (100ms apart) for musical "popcorn" effect
        // Randomly use pop (75%) or giggle (25%) for variety
        setTimeout(() => {
          const useGiggle = Math.random() < 0.25;
          play(useGiggle ? "giggle" : "pop");
        }, i * 100);
      }
    }

    prevPlayerCountRef.current = currentCount;
  }, [players?.length, session?.status, play]);

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

  // NOTE: Reveal sounds (snip, blobSad, blobHappy, celebration) are now orchestrated
  // in Mountain.tsx's RopesOverlay component with proper sequential timing.
  // This useEffect is intentionally removed to avoid duplicate/conflicting sounds.
  // The Mountain component handles the dramatic reveal sequence:
  // 1. Tension sound -> 2. Snip each wrong rope one at a time with sad sounds -> 3. Happy celebration

  // Reset reveal sound tracking when question changes
  useEffect(() => {
    if (!ropeClimbingState) return;
    const phase = ropeClimbingState.questionPhase;
    if (phase !== "revealed") {
      hasPlayedRevealSoundsRef.current = null;
    }
  }, [ropeClimbingState]);

  // Play "Get Ready!" sound and blob chitters when entering pre_game phase
  const isPreGamePhase = session?.status === "active" && session?.currentQuestionIndex === -1;
  useEffect(() => {
    const currentPhase = isPreGamePhase ? "pre_game" : session?.status ?? null;
    const prevPhase = prevSessionPhaseRef.current;

    // Play sounds when transitioning INTO pre_game phase (spectator plays all sounds)
    if (isPreGamePhase && prevPhase !== "pre_game") {
      play("getReady");
      // Play chitters from blobs - spectator view plays multiple for excitement
      // Slight delay after the fanfare
      setTimeout(() => {
        const playerCount = players?.length ?? 0;
        playChitters(playerCount, 5); // Play up to 5 chitters based on player count
      }, 600);
    }

    prevSessionPhaseRef.current = currentPhase;
  }, [isPreGamePhase, session?.status, players?.length, play, playChitters]);

  // Track which blobs have already played their appear animation
  // This prevents the appear animation from replaying when blob state changes
  const appearedBlobsRef = useRef<Set<string>>(new Set());

  // Track when to show follow-up text (after reveal animations complete)
  // The reveal sequence takes ~4 seconds: 1500ms tension + up to 2400ms snipping + 500ms delay
  const [showFollowUp, setShowFollowUp] = useState(false);
  const followUpTimerRef = useRef<number | null>(null);

  // Show follow-up text after reveal animations complete
  useEffect(() => {
    const phase = ropeClimbingState?.questionPhase;

    // When entering "revealed" phase, start a timer to show follow-up after animations
    if (phase === "revealed" && currentQuestion?.followUpText) {
      // Clear any existing timer
      if (followUpTimerRef.current) {
        window.clearTimeout(followUpTimerRef.current);
      }

      // Calculate delay based on reveal animation timing:
      // 1500ms initial tension + (wrongRopes - 1) * 800ms stagger + 500ms post-snip + 500ms buffer
      // For worst case (3 wrong ropes): 1500 + 1600 + 500 + 500 = 4100ms
      const wrongRopeCount = ropeClimbingState?.ropes.filter(r => r.isCorrect === false).length ?? 0;
      const snipAnimationTime = wrongRopeCount > 0 ? (wrongRopeCount - 1) * 800 : 0;
      const totalDelay = 1500 + snipAnimationTime + 500 + 500; // tension + snipping + post-snip + buffer

      followUpTimerRef.current = window.setTimeout(() => {
        setShowFollowUp(true);
      }, totalDelay);
    } else if (phase !== "revealed") {
      // Reset when leaving revealed phase
      setShowFollowUp(false);
      if (followUpTimerRef.current) {
        window.clearTimeout(followUpTimerRef.current);
        followUpTimerRef.current = null;
      }
    }

    return () => {
      if (followUpTimerRef.current) {
        window.clearTimeout(followUpTimerRef.current);
      }
    };
  }, [ropeClimbingState?.questionPhase, ropeClimbingState?.ropes, currentQuestion?.followUpText]);

  // Compute shuffled answer order for deterministic randomization
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

  // Session not found
  if (session === null) {
    return (
      <div className="spectator-view spectator-error">
        <h1>Session Not Found</h1>
        <p>No session with code "{sessionCode}" exists.</p>
        <button onClick={onBack}>Back to Home</button>
      </div>
    );
  }

  // Loading state
  if (session === undefined) {
    return (
      <div className="spectator-view spectator-loading">
        <div className="spectator-loading-content">
          <h1>Loading...</h1>
          <p>Connecting to session {sessionCode}</p>
        </div>
      </div>
    );
  }

  // Session finished - show final leaderboard
  if (session.status === "finished") {
    return (
      <div className="spectator-view spectator-finished">
        {/* Sound toggle button */}
        <button
          className="spectator-sound-toggle"
          onClick={toggleMute}
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
          title={muted ? "Unmute sounds" : "Mute sounds"}
        >
          {muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
        </button>

        <h1 className="spectator-title">Game Over!</h1>
        <div className="spectator-leaderboard">
          <h2>Final Results</h2>
          <ol className="leaderboard-list">
            {leaderboard?.slice(0, 10).map((p, index) => (
              <li key={p._id} className={`leaderboard-item rank-${index + 1}`}>
                <span className="rank">{index + 1}</span>
                <span className="name">{p.name}</span>
                <span className="elevation">
                  {p.elevation}m
                  {p.elevation >= SUMMIT && " - Summit!"}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="spectator-session-code">
          Session: {session.code}
        </div>
        <button onClick={onBack} className="back-to-home-button">
          Back to Home
        </button>
      </div>
    );
  }

  // Lobby state - waiting to start
  if (session.status === "lobby") {
    return (
      <div className="spectator-view spectator-lobby">
        {/* Sound toggle button */}
        <button
          className="spectator-sound-toggle"
          onClick={toggleMute}
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
          title={muted ? "Unmute sounds" : "Mute sounds"}
        >
          {muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
        </button>

        {/* Animated blob avatars in safe zones */}
        {players && players.length > 0 && (
          <div className="spectator-lobby-blobs">
            {players.map((player, index) => {
              // Track if this blob has appeared before
              const hasAppeared = appearedBlobsRef.current.has(player._id);

              return (
                <LobbyBlob
                  key={player._id}
                  player={player}
                  index={index}
                  totalPlayers={players.length}
                  hasAppeared={hasAppeared}
                  onAppeared={() => appearedBlobsRef.current.add(player._id)}
                />
              );
            })}
          </div>
        )}

        <h1 className="spectator-title">Blobby: Summit</h1>
        <div className="spectator-join-prompt">
          <p className="join-label">Join with code:</p>
          <div className="join-code">{session.code}</div>
        </div>
        <div className="spectator-player-count">
          <span className="count">{players?.length ?? 0}</span>
          <span className="label">players joined</span>
        </div>
        <p className="waiting-text">Waiting for host to start...</p>
      </div>
    );
  }

  // Pre-game phase - game started but no question shown yet
  const isPreGame = session.status === "active" && session.currentQuestionIndex === -1;

  if (isPreGame) {
    return (
      <div className="spectator-fullscreen spectator-pregame">
        {/* Session code badge (top-left, for late joiners) */}
        <div className="spectator-session-badge">
          Join: {session.code}
        </div>

        {/* Sound toggle button */}
        <button
          className="spectator-sound-toggle"
          onClick={toggleMute}
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
          title={muted ? "Unmute sounds" : "Mute sounds"}
        >
          {muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
        </button>

        {/* Full-screen mountain without question */}
        <div className="spectator-mountain-fullscreen">
          <Mountain
            players={
              players?.map((p) => ({
                id: p._id,
                name: p.name,
                elevation: p.elevation,
              })) ?? []
            }
            mode="spectator"
            width={dimensions.width}
            height={dimensions.height}
            ropeClimbingState={null}
            skyQuestion={null}
          />
        </div>

        {/* "Get Ready!" overlay */}
        <div className="pregame-overlay">
          <h1 className="pregame-title">Get Ready!</h1>
          <p className="pregame-subtitle">The climb begins...</p>
        </div>

        {/* Player count indicator */}
        <div className="spectator-player-indicator">
          {players?.length ?? 0} climbers
        </div>
      </div>
    );
  }

  // Active game - show mountain and current question
  const enabledQuestionCount = questions?.filter((q) => q.enabled !== false).length ?? 0;
  const questionPhase = ropeClimbingState?.questionPhase ?? "answers_shown";

  // Build sky question data for the Mountain component
  const skyQuestion: SkyQuestion | null = currentQuestion
    ? {
        text: currentQuestion.text,
        questionNumber: session.currentQuestionIndex + 1,
        totalQuestions: enabledQuestionCount,
        phase: questionPhase,
        options: currentQuestion.options,
        correctAnswerIndex: currentQuestion.correctOptionIndex,
        timer: {
          firstAnsweredAt: timingInfo?.firstAnsweredAt ?? null,
          timeLimit: currentQuestion.timeLimit,
          isRevealed: ropeClimbingState?.timing.isRevealed ?? false,
          correctAnswer: ropeClimbingState?.ropes.find((r) => r.isCorrect === true)?.optionText,
          correctCount: ropeClimbingState?.ropes.find((r) => r.isCorrect === true)?.players.length,
          totalAnswered: ropeClimbingState?.answeredCount,
        },
      }
    : null;

  return (
    <div className="spectator-fullscreen">
      {/* Session code badge (top-left, for late joiners) */}
      <div className="spectator-session-badge">
        Join: {session.code}
      </div>

      {/* Sound toggle button */}
      <button
        className="spectator-sound-toggle"
        onClick={toggleMute}
        aria-label={muted ? "Unmute sounds" : "Mute sounds"}
        title={muted ? "Unmute sounds" : "Mute sounds"}
      >
        {muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
      </button>

      {/* Answer labels are now rendered in the Mountain SVG at the top of each rope */}

      {/* Question overlay - positioned as HTML above the SVG for guaranteed visibility */}
      {skyQuestion && (
        <div className="spectator-question-overlay">
          <div className="spectator-question-number">
            Question {skyQuestion.questionNumber} of {skyQuestion.totalQuestions}
          </div>
          <div className="spectator-question-text">
            {skyQuestion.text}
          </div>
          {skyQuestion.phase === "question_shown" && (
            <div className="spectator-question-hint">Get ready...</div>
          )}
        </div>
      )}

      {/* Full-screen mountain (question is now rendered as HTML overlay above) */}
      <div className="spectator-mountain-fullscreen">
        <Mountain
          players={
            players?.map((p) => ({
              id: p._id,
              name: p.name,
              elevation: p.elevation,
            })) ?? []
          }
          mode="spectator"
          width={dimensions.width}
          height={dimensions.height}
          ropeClimbingState={ropeClimbingState}
          skyQuestion={null}
          answerShuffleOrder={shuffledAnswers?.shuffledOptions.map(o => o.originalIndex)}
        />

        {/* Leaderboard overlay during results phase */}
        {questionPhase === "results" && leaderboard && (
          <div className="leaderboard-overlay">
            <div className="leaderboard-overlay-header">
              <h2>Leaderboard</h2>
              <p>After Q{session.currentQuestionIndex + 1}</p>
            </div>
            <Leaderboard
              players={leaderboard}
              maxDisplay={10}
            />
          </div>
        )}

        {/* Follow-up text overlay - shown after reveal animations complete */}
        {showFollowUp && currentQuestion?.followUpText && (
          <div className="follow-up-overlay">
            <div className="follow-up-card">
              <div className="follow-up-icon">💡</div>
              <div className="follow-up-label">Did you know?</div>
              <div className="follow-up-text">{currentQuestion.followUpText}</div>
            </div>
          </div>
        )}
      </div>

      {/* Player count indicator */}
      <div className="spectator-player-indicator">
        {players?.length ?? 0} climbers
      </div>
    </div>
  );
}

/**
 * Derive personality traits deterministically from player name
 * This ensures the same player always has the same "personality"
 */
function getPersonalityFromName(name: string): {
  chattiness: number; // 0.5-2.0 - multiplier on timing between actions (higher = less frequent)
  talkative: number;  // 0.1-0.6 - probability of making a sound when action fires
  wanderAmount: number; // 0-15 - how far they wander from home position in pixels
} {
  // Simple deterministic hash from name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Make hash positive
  hash = Math.abs(hash);

  // Derive traits from different parts of the hash
  const chattiness = 0.5 + ((hash % 100) / 100) * 1.5; // 0.5 to 2.0
  const talkative = 0.1 + (((hash >> 8) % 100) / 100) * 0.5; // 0.1 to 0.6
  const wanderAmount = ((hash >> 16) % 16); // 0 to 15 pixels

  return { chattiness, talkative, wanderAmount };
}

/**
 * LobbyBlob - Individual blob in the lobby with autonomous behavior
 *
 * Each blob manages its own behavior loop:
 * - Makes sounds at random intervals based on personality
 * - Has independent idle animations
 * - Optionally wanders within its area
 */
interface LobbyBlobProps {
  player: { _id: string; name: string };
  index: number;
  totalPlayers: number;
  hasAppeared: boolean;
  onAppeared: () => void;
}

function LobbyBlob({ player, index, totalPlayers, hasAppeared, onAppeared }: LobbyBlobProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [wanderOffset, setWanderOffset] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<number | null>(null);
  const wanderTimeoutRef = useRef<number | null>(null);

  // Get deterministic personality for this blob
  const personality = getPersonalityFromName(player.name);

  // Mark as appeared after the animation duration (500ms + stagger delay)
  useEffect(() => {
    if (!hasAppeared) {
      // Animation duration (500ms) + max stagger delay (750ms) + buffer
      const animationDuration = 500 + (index % 16) * 50 + 100;
      const timeoutId = setTimeout(() => {
        onAppeared();
      }, animationDuration);
      return () => clearTimeout(timeoutId);
    }
  }, [hasAppeared, index, onAppeared]);

  // Autonomous behavior loop - each blob manages its own sounds/actions
  useEffect(() => {
    if (!hasAppeared) return;

    const scheduleNextAction = () => {
      // Base interval modified by chattiness (higher chattiness = longer waits)
      // Range: 2000-6000ms base, modified by personality
      const baseDelay = 2000 + Math.random() * 4000;
      const delay = baseDelay * personality.chattiness;

      timeoutRef.current = window.setTimeout(() => {
        // Decide what to do based on personality
        if (Math.random() < personality.talkative) {
          // Make a sound and animate
          playSound("blobAmbient");
          setIsSpeaking(true);
          setTimeout(() => setIsSpeaking(false), 400);
        }
        // Schedule next action
        scheduleNextAction();
      }, delay);
    };

    // Start behavior loop with initial random delay to desynchronize blobs
    const initialDelay = Math.random() * 2000;
    timeoutRef.current = window.setTimeout(scheduleNextAction, initialDelay);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [hasAppeared, personality.chattiness, personality.talkative]);

  // Optional wandering behavior - small random position changes
  useEffect(() => {
    if (!hasAppeared || personality.wanderAmount === 0) return;

    const wander = () => {
      // Small random offset within wanderAmount radius
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * personality.wanderAmount;
      setWanderOffset({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
      });

      // Schedule next wander (slower than speaking - 3-8 seconds)
      const nextWander = 3000 + Math.random() * 5000;
      wanderTimeoutRef.current = window.setTimeout(wander, nextWander);
    };

    // Start wandering with random initial delay
    wanderTimeoutRef.current = window.setTimeout(wander, 1000 + Math.random() * 2000);

    return () => {
      if (wanderTimeoutRef.current) {
        window.clearTimeout(wanderTimeoutRef.current);
      }
    };
  }, [hasAppeared, personality.wanderAmount]);

  // Calculate style with wandering offset
  const baseStyle = getLobbyBlobStyle(index, totalPlayers);
  const style: React.CSSProperties = { ...baseStyle };

  // Merge transforms properly - add wander offset to existing transform
  if (baseStyle.transform) {
    const existingTransform = baseStyle.transform as string;
    style.transform = `${existingTransform} translate(${wanderOffset.x}px, ${wanderOffset.y}px)`;
  } else {
    style.transform = `translate(${wanderOffset.x}px, ${wanderOffset.y}px)`;
  }

  // Smooth transition for wandering
  style.transition = "transform 1.5s ease-in-out";

  return (
    <div
      className={`lobby-blob ${getIdleAnimation(player.name)} ${getLobbyBlobPosition(index, totalPlayers)}${hasAppeared ? " blob-appeared" : ""}${isSpeaking ? " blob-speaking" : ""}`}
      style={style}
    >
      <Blob
        config={generateBlob(player.name)}
        size={getBlobSize(totalPlayers)}
        state="idle"
      />
      <span className="lobby-blob-name">{player.name}</span>
    </div>
  );
}

// Helper functions for lobby blob positioning and animations

/**
 * Get a deterministic idle animation class based on player name
 */
function getIdleAnimation(name: string): string {
  const animations = ["blob-breathe", "blob-wiggle", "blob-bounce", "blob-float"];
  const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return animations[hash % animations.length]!;
}

/**
 * Get position class for lobby blob based on index
 * Positions blobs in safe zones around the edges
 */
function getLobbyBlobPosition(index: number, totalPlayers: number): string {
  // Position classes are defined in CSS
  const maxPositions = 16;
  return `lobby-blob-pos-${index % maxPositions}`;
}

/**
 * Get additional inline styles for blob positioning
 * Uses a combination of fixed positions and calculated offsets
 */
function getLobbyBlobStyle(index: number, totalPlayers: number): React.CSSProperties {
  // Define safe zone positions (avoiding center content)
  // Format: [top%, left%] or special positions
  const positions = [
    // Top edge
    { top: "5%", left: "5%" },
    { top: "8%", left: "20%" },
    { top: "5%", right: "20%" },
    { top: "8%", right: "5%" },
    // Left edge
    { top: "25%", left: "3%" },
    { top: "45%", left: "5%" },
    { top: "65%", left: "3%" },
    // Right edge
    { top: "25%", right: "3%" },
    { top: "45%", right: "5%" },
    { top: "65%", right: "3%" },
    // Bottom corners
    { bottom: "15%", left: "5%" },
    { bottom: "12%", left: "18%" },
    { bottom: "15%", right: "18%" },
    { bottom: "12%", right: "5%" },
    // Additional positions for more players
    { top: "15%", left: "10%" },
    { top: "15%", right: "10%" },
  ];

  const posIndex = index % positions.length;
  const position = positions[posIndex]!;

  // Add slight random offset based on index to prevent exact overlaps
  // when wrapping around positions
  const offsetX = (index >= positions.length) ? ((index * 17) % 30) - 15 : 0;
  const offsetY = (index >= positions.length) ? ((index * 23) % 20) - 10 : 0;

  return {
    ...position,
    transform: `translate(${offsetX}px, ${offsetY}px)`,
  };
}

/**
 * Get blob size based on number of players
 * Smaller blobs when many players to avoid crowding
 */
function getBlobSize(totalPlayers: number): number {
  if (totalPlayers >= 20) return 40;
  if (totalPlayers >= 10) return 50;
  return 70;
}


/**
 * SpectatorJoin - Entry screen to join a session as spectator
 */
export function SpectatorJoin({ onJoin, onBack }: { onJoin: (code: string) => void; onBack: () => void }) {
  const [code, setCode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length === 4) {
      onJoin(code.trim().toUpperCase());
    }
  }

  return (
    <div className="spectator-view spectator-join">
      <button onClick={onBack} className="back-button">
        Back
      </button>
      <h1>Spectator Mode</h1>
      <p>Enter a session code to watch the game on the big screen.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={4}
          className="code-input"
        />
        <button type="submit" disabled={code.trim().length !== 4}>
          Watch Game
        </button>
      </form>
    </div>
  );
}
