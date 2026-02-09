import { useState, useEffect, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import "./PlayerView.css";
import { Mountain } from "../components/mountain";
import { Timer } from "../components/Timer";
import { Leaderboard } from "../components/Leaderboard";
import { useSoundManager } from "../hooks/useSoundManager";
import { usePlayerHeartbeat } from "../hooks/usePlayerHeartbeat";
import { useSessionPersistence } from "../hooks/useSessionPersistence";
import { useGameSubscriptions } from "../hooks/useGameSubscriptions";
import { useGameSounds } from "../hooks/useGameSounds";
import { useResultReveal } from "../hooks/useResultReveal";
import { MuteToggle } from "../components/MuteToggle";
import { Blob } from "../components/Blob";
import { generateBlob } from "../lib/blobGenerator";
import { ErrorMessage } from "../components/ErrorMessage";
import { ShareResults } from "../components/ShareResults";
import { getFriendlyErrorMessage } from "../lib/errorMessages";

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
  initialName?: string | null;
}

export function PlayerView({ onBack, initialCode, initialName }: Props) {
  // --- Session persistence (join/rejoin/leave, localStorage) ---
  const persistence = useSessionPersistence({ initialCode, initialName });
  const {
    joinCode, setJoinCode, playerName, setPlayerName, nameInputRef,
    playerId, sessionId, isRestoring, isRejoining, storedSession,
    checkStoredSession, error, setError, showLeaveConfirm, setShowLeaveConfirm,
    getByCode, handleJoin, handleRejoin, handleStartFresh, handleLeave,
    clearSessionForPlayer,
  } = persistence;

  // --- Heartbeat for presence tracking ---
  usePlayerHeartbeat(playerId);

  // --- Game data subscriptions ---
  const subs = useGameSubscriptions({ sessionId, playerId });
  const {
    session, player, currentQuestion, ropeClimbingState, playerRopeState,
    players, playerContext, leaderboardSummary,
    hasAnswered, timingInfo, questionPhase, shuffledAnswers,
  } = subs;

  // --- Result reveal timing (synced with scissors animation) ---
  const playerResultRevealed = useResultReveal({
    playerRopeState,
    currentQuestionId: currentQuestion?._id ?? null,
  });

  // --- Game sounds ---
  const isPreGame = session?.status === "active" && session?.questionPhase === "pre_game";
  useGameSounds({
    playerCount: players ? players.length : null,
    currentQuestionPhase: playerRopeState?.phase ?? null,
    isPreGame,
    sessionStatus: session?.status ?? null,
    playerResultRevealed,
    currentQuestionId: currentQuestion?._id ?? null,
    didAnswer: playerRopeState?.myAnswer.hasAnswered ?? false,
    isCorrect: playerRopeState?.myAnswer.isCorrect ?? null,
  });

  // --- Timer and answer state ---
  const [timerExpired, setTimerExpired] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);

  // Reset timerExpired and answerError when question changes
  useEffect(() => {
    setTimerExpired(false);
    setAnswerError(null);
  }, [currentQuestion?._id]);

  // If restored session is invalid (player deleted, session gone), clear it
  useEffect(() => {
    if (!isRestoring && playerId && player === null) {
      clearSessionForPlayer(storedSession?.sessionCode ?? "", storedSession?.playerName ?? "");
    }
  }, [isRestoring, playerId, player, storedSession, clearSessionForPlayer]);

  // Clear localStorage when session finishes
  useEffect(() => {
    if (session?.status === "finished" && session?.code && player?.name) {
      clearSessionForPlayer(session.code, player.name);
    }
  }, [session?.status, session?.code, player?.name, clearSessionForPlayer]);

  const submitAnswer = useMutation(api.answers.submit);

  // Sound manager for immediate boop on answer submit
  const { play } = useSoundManager();

  // Auto-focus name input when 4-char join code is entered
  useEffect(() => {
    if (joinCode.length === 4 && nameInputRef.current && !playerName) {
      nameInputRef.current.focus();
    }
  }, [joinCode, nameInputRef, playerName]);

  async function handleAnswer(optionIndex: number) {
    if (!currentQuestion || !playerId) return;
    play("boop");
    navigator.vibrate?.(30);

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

  // --- Memoized values for lobby display ---
  const otherPlayers = useMemo(() =>
    players?.filter((p) => p._id !== playerId) ?? [],
    [players, playerId]
  );

  const currentPlayerBlob = useMemo(() =>
    player?.name ? generateBlob(player.name) : null,
    [player?.name]
  );

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════

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
              setError("");
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
              setError("");
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
    const leaderboardPlayers = leaderboardSummary?.top ?? [];

    return (
      <div className="player-view">
        <h2>Game Over!</h2>

        <ShareResults
          playerName={player?.name ?? "Player"}
          elevation={player?.elevation ?? 0}
          rank={leaderboardSummary?.currentRank ?? null}
          totalPlayers={leaderboardSummary?.totalPlayers ?? 0}
        />

        <h3>Leaderboard</h3>
        <Leaderboard
          players={leaderboardPlayers}
          maxDisplay={10}
          currentPlayerId={playerId ?? undefined}
          className="leaderboard-light"
        />
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
  return (
    <div className="player-view">
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

      {playerContext === undefined && session?.status === "active" && (
        <div className="skeleton-mountain" />
      )}

      {playerContext && playerContext.nearbyPlayers.length > 0 && playerId && (
        <Mountain
          players={playerContext.nearbyPlayers.map((p) => ({
            id: p._id,
            name: p.name,
            elevation: p.elevation,
          }))}
          mode="player"
          currentPlayerElevation={playerContext.currentPlayer?.elevation ?? 0}
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
              {playerContext?.totalPlayers ?? 0} climber{(playerContext?.totalPlayers ?? 0) !== 1 ? 's' : ''} ready
            </p>
          </div>
        </div>
      ) : currentQuestion ? (
        <div className="question">
          {questionPhase !== "question_shown" && (
            <div className="question-timer">
              <Timer
                firstAnsweredAt={timingInfo?.firstAnsweredAt ?? null}
                timeLimit={currentQuestion.timeLimit}
                onExpire={() => setTimerExpired(true)}
                size="medium"
                isRevealed={playerRopeState?.timing.isRevealed ?? false}
                correctAnswer={playerRopeState?.ropes.find(r => r.isCorrect === true)?.optionText}
                correctCount={playerRopeState?.ropes.find(r => r.isCorrect === true)?.playerCount}
                totalAnswered={playerRopeState?.answeredCount}
              />
            </div>
          )}

          <h2>{currentQuestion.text}</h2>

          {questionPhase === "question_shown" && (
            <p className="waiting">Waiting for host to show answers...</p>
          )}

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

          {questionPhase === "revealed" && playerRopeState && (() => {
            const playerSelectedOriginalIndex = playerRopeState.myAnswer.optionIndex;
            const isCorrect = playerRopeState.myAnswer.isCorrect === true;
            const didAnswer = playerRopeState.myAnswer.hasAnswered;
            const elevationGain = playerRopeState.myAnswer.elevationGain ?? 0;

            const optionsToDisplay = shuffledAnswers
              ? shuffledAnswers.shuffledOptions
              : currentQuestion.options.map((opt, i) => ({ option: opt, originalIndex: i, shuffledIndex: i }));

            return (
              <div className="reveal-feedback">
                {!playerResultRevealed && (
                  <div className="result-banner tension">
                    <span className="scissors-icon">✂️</span>
                    <span className="result-text tension-text">...</span>
                  </div>
                )}

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

                {playerResultRevealed && (
                  <div className="options revealed">
                    {optionsToDisplay.map((item, visualIndex) => {
                      const originalIndex = item.originalIndex;
                      const rope = playerRopeState.ropes[originalIndex];
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

          {questionPhase === "results" && leaderboardSummary && (
            <div className="results-leaderboard">
              <h3>Leaderboard</h3>
              {leaderboardSummary.currentRank && leaderboardSummary.currentRank > 5 && (
                <p className="rank-info compact">
                  You are #{leaderboardSummary.currentRank} of {leaderboardSummary.totalPlayers}
                </p>
              )}
              <Leaderboard
                players={leaderboardSummary.top}
                maxDisplay={5}
                currentPlayerId={playerId ?? undefined}
                compact
                className="leaderboard-light"
              />
            </div>
          )}
        </div>
      ) : currentQuestion === undefined ? (
        <div className="skeleton-question">
          <div className="skeleton-line skeleton-line-wide" />
          <div className="skeleton-line skeleton-line-medium" />
          <div className="skeleton-option" />
          <div className="skeleton-option" />
          <div className="skeleton-option" />
        </div>
      ) : (
        <p>Waiting for question...</p>
      )}
    </div>
  );
}
