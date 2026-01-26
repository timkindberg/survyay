import { useState, useMemo, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Mountain, type SkyQuestion } from "../components/Mountain";
import { Timer } from "../components/Timer";
import { Leaderboard } from "../components/Leaderboard";
import { Blob } from "../components/Blob";
import { generateBlob } from "../lib/blobGenerator";
import { SUMMIT } from "../../lib/elevation";
import type { RopeClimbingState } from "../../lib/ropeTypes";

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
      </div>
    );
  }

  // Lobby state - waiting to start
  if (session.status === "lobby") {
    return (
      <div className="spectator-view spectator-lobby">
        {/* Animated blob avatars in safe zones */}
        {players && players.length > 0 && (
          <div className="spectator-lobby-blobs">
            {players.map((player, index) => (
              <div
                key={player._id}
                className={`lobby-blob ${getIdleAnimation(player.name)} ${getLobbyBlobPosition(index, players.length)}`}
                style={getLobbyBlobStyle(index, players.length)}
              >
                <Blob
                  config={generateBlob(player.name)}
                  size={getBlobSize(players.length)}
                  state="idle"
                />
                <span className="lobby-blob-name">{player.name}</span>
              </div>
            ))}
          </div>
        )}

        <h1 className="spectator-title">Survyay!</h1>
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

      {/* Timer overlay (top-right) - only show when answers are shown */}
      {currentQuestion && questionPhase !== "question_shown" && (
        <div className="spectator-timer-overlay">
          <Timer
            firstAnsweredAt={timingInfo?.firstAnsweredAt ?? null}
            timeLimit={currentQuestion.timeLimit}
            size="large"
            isRevealed={ropeClimbingState?.timing.isRevealed ?? false}
            correctAnswer={ropeClimbingState?.ropes.find((r) => r.isCorrect === true)?.optionText}
            correctCount={ropeClimbingState?.ropes.find((r) => r.isCorrect === true)?.players.length}
            totalAnswered={ropeClimbingState?.answeredCount}
          />
        </div>
      )}

      {/* Full-screen mountain with question in the sky */}
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
          skyQuestion={skyQuestion}
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
      </div>

      {/* Player count indicator */}
      <div className="spectator-player-indicator">
        {players?.length ?? 0} climbers
      </div>
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
          placeholder="Session Code"
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
