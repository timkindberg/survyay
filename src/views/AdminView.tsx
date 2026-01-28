import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import { Timer } from "../components/Timer";
import type { RopeClimbingState } from "../../lib/ropeTypes";

// Types for host action button
type SessionStatus = "lobby" | "active" | "finished";
type QuestionPhase = "pre_game" | "question_shown" | "answers_shown" | "revealed" | "results" | undefined;

interface HostActionConfig {
  label: string;
  action: () => Promise<void>;
  disabled: boolean;
  isDestructive?: boolean;
}

// Hook to determine the current host action based on session state
function useHostAction(
  sessionId: Id<"sessions"> | null,
  sessionStatus: SessionStatus | undefined,
  questionPhase: QuestionPhase,
  enabledQuestionCount: number,
  currentQuestionIndex: number
): HostActionConfig | null {
  const startSession = useMutation(api.sessions.start);
  const showAnswers = useMutation(api.sessions.showAnswers);
  const revealAnswer = useMutation(api.sessions.revealAnswer);
  const showResults = useMutation(api.sessions.showResults);
  const nextQuestion = useMutation(api.sessions.nextQuestion);
  const backToLobby = useMutation(api.sessions.backToLobby);

  if (!sessionId || !sessionStatus) return null;

  const isLastQuestion = currentQuestionIndex >= enabledQuestionCount - 1;

  switch (sessionStatus) {
    case "lobby":
      return {
        label: `Start Game (${enabledQuestionCount} questions)`,
        action: async () => { await startSession({ sessionId }); },
        disabled: enabledQuestionCount === 0,
      };

    case "active":
      switch (questionPhase) {
        case "pre_game":
          return {
            label: "First Question",
            action: async () => { await nextQuestion({ sessionId }); },
            disabled: false,
          };
        case "question_shown":
          return {
            label: "Show Answers",
            action: async () => { await showAnswers({ sessionId }); },
            disabled: false,
          };
        case "answers_shown":
          return {
            label: "Reveal Answer",
            action: async () => { await revealAnswer({ sessionId }); },
            disabled: false,
          };
        case "revealed":
          return {
            label: "Show Leaderboard",
            action: async () => { await showResults({ sessionId }); },
            disabled: false,
          };
        case "results":
          return {
            label: isLastQuestion ? "End Game" : "Next Question",
            action: async () => { await nextQuestion({ sessionId }); },
            disabled: false,
            isDestructive: isLastQuestion,
          };
        default:
          return null;
      }

    case "finished":
      return {
        label: "Reset Game",
        action: async () => {
          if (confirm("This will reset all player scores and progress. Continue?")) {
            await backToLobby({ sessionId });
          }
        },
        disabled: false,
      };

    default:
      return null;
  }
}

// Hook to determine the back action based on session state
function useBackAction(
  sessionId: Id<"sessions"> | null,
  sessionStatus: SessionStatus | undefined,
  questionPhase: QuestionPhase,
  currentQuestionIndex: number
): HostActionConfig | null {
  const previousPhase = useMutation(api.sessions.previousPhase);

  if (!sessionId || !sessionStatus) return null;

  // No back action in lobby or finished state
  if (sessionStatus !== "active") return null;

  // Determine the back action based on current phase
  switch (questionPhase) {
    case "pre_game":
      // Pre-game -> Lobby
      return {
        label: "<- Lobby",
        action: async () => { await previousPhase({ sessionId }); },
        disabled: false,
        isDestructive: false, // No answers or progress to lose yet
      };
    case "results":
      return {
        label: "<- Revealed",
        action: async () => { await previousPhase({ sessionId }); },
        disabled: false,
        isDestructive: false,
      };
    case "revealed":
      return {
        label: "<- Hide Answer",
        action: async () => { await previousPhase({ sessionId }); },
        disabled: false,
        isDestructive: false,
      };
    case "answers_shown":
      return {
        label: "<- Clear Answers",
        action: async () => {
          if (confirm("This will delete all answers for this question. Continue?")) {
            await previousPhase({ sessionId });
          }
        },
        disabled: false,
        isDestructive: true,
      };
    case "question_shown":
      if (currentQuestionIndex > 0) {
        return {
          label: `<- Q${currentQuestionIndex} Results`,
          action: async () => { await previousPhase({ sessionId }); },
          disabled: false,
          isDestructive: false,
        };
      } else {
        // Q1 -> Pre-game (safe: no progress lost, just going back to hype phase)
        return {
          label: "<- Pre-Game",
          action: async () => { await previousPhase({ sessionId }); },
          disabled: false,
          isDestructive: false,
        };
      }
    default:
      return null;
  }
}

// Host Action Button Component
function HostActionButton({
  sessionId,
  sessionStatus,
  questionPhase,
  enabledQuestionCount,
  currentQuestionIndex,
}: {
  sessionId: Id<"sessions">;
  sessionStatus: SessionStatus;
  questionPhase: QuestionPhase;
  enabledQuestionCount: number;
  currentQuestionIndex: number;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isBackLoading, setIsBackLoading] = useState(false);

  const actionConfig = useHostAction(
    sessionId,
    sessionStatus,
    questionPhase,
    enabledQuestionCount,
    currentQuestionIndex
  );

  const backConfig = useBackAction(
    sessionId,
    sessionStatus,
    questionPhase,
    currentQuestionIndex
  );

  const handleAction = useCallback(async () => {
    if (!actionConfig || actionConfig.disabled || isLoading) return;

    setIsLoading(true);
    try {
      await actionConfig.action();
    } catch (error) {
      console.error("Action failed:", error);
    } finally {
      // Brief delay to prevent rapid double-clicks
      setTimeout(() => setIsLoading(false), 300);
    }
  }, [actionConfig, isLoading]);

  const handleBackAction = useCallback(async () => {
    if (!backConfig || backConfig.disabled || isBackLoading) return;

    setIsBackLoading(true);
    try {
      await backConfig.action();
    } catch (error) {
      console.error("Back action failed:", error);
    } finally {
      setTimeout(() => setIsBackLoading(false), 300);
    }
  }, [backConfig, isBackLoading]);

  // Keyboard shortcut handler
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Only trigger if not focused on an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Spacebar or Enter triggers the forward action
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        handleAction();
      }

      // Backspace triggers the back action (if available)
      if (event.code === "Backspace" && backConfig && !backConfig.disabled) {
        event.preventDefault();
        handleBackAction();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleAction, handleBackAction, backConfig]);

  if (!actionConfig) return null;

  const isDisabled = actionConfig.disabled || isLoading;
  const isBackDisabled = !backConfig || backConfig.disabled || isBackLoading;

  return (
    <div className="host-action-container">
      <div className="host-action-buttons">
        {backConfig && (
          <button
            onClick={handleBackAction}
            disabled={isBackDisabled}
            className={`host-back-button ${backConfig.isDestructive ? "destructive" : ""} ${isBackLoading ? "loading" : ""}`}
          >
            {isBackLoading ? "..." : backConfig.label}
          </button>
        )}
        <button
          onClick={handleAction}
          disabled={isDisabled}
          className={`host-action-button ${actionConfig.isDestructive ? "destructive" : ""} ${isLoading ? "loading" : ""}`}
        >
          {isLoading ? "..." : actionConfig.label}
        </button>
      </div>
      <div className="host-action-hint">
        Press <kbd>Space</kbd> or <kbd>Enter</kbd> to advance{backConfig && <>, <kbd>Backspace</kbd> to go back</>}
      </div>
    </div>
  );
}

interface Props {
  onBack: () => void;
}

// Get or create a persistent hostId from localStorage
function getHostId(): string {
  const key = "survyay-host-id";
  let hostId = localStorage.getItem(key);
  if (!hostId) {
    hostId = crypto.randomUUID();
    localStorage.setItem(key, hostId);
  }
  return hostId;
}

export function AdminView({ onBack }: Props) {
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [hostId] = useState(getHostId);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPlayLink, setCopiedPlayLink] = useState(false);

  const createSession = useMutation(api.sessions.create);
  const deleteSession = useMutation(api.sessions.remove);
  const backToLobby = useMutation(api.sessions.backToLobby);

  const existingSessions = useQuery(api.sessions.listByHost, { hostId });
  const session = useQuery(
    api.sessions.get,
    sessionId ? { sessionId } : "skip"
  );
  const players = useQuery(
    api.players.listBySession,
    sessionId ? { sessionId } : "skip"
  );
  const questions = useQuery(
    api.questions.listBySession,
    sessionId ? { sessionId } : "skip"
  );
  const currentQuestion = useQuery(
    api.questions.getCurrentQuestion,
    sessionId ? { sessionId } : "skip"
  );
  const timingInfo = useQuery(
    api.answers.getTimingInfo,
    currentQuestion ? { questionId: currentQuestion._id } : "skip"
  );

  // Rope climbing state for active question visualization
  const ropeClimbingState = useQuery(
    api.answers.getRopeClimbingState,
    sessionId ? { sessionId } : "skip"
  ) as RopeClimbingState | null | undefined;

  const startSession = useMutation(api.sessions.start);
  const nextQuestion = useMutation(api.sessions.nextQuestion);
  const finishSession = useMutation(api.sessions.finish);
  const showAnswers = useMutation(api.sessions.showAnswers);
  const revealAnswer = useMutation(api.sessions.revealAnswer);
  const showResults = useMutation(api.sessions.showResults);

  async function handleCreate() {
    const result = await createSession({ hostId });
    setSessionId(result.sessionId);
  }

  async function handleDelete(id: Id<"sessions">) {
    if (confirm("Are you sure you want to delete this session? This cannot be undone.")) {
      await deleteSession({ sessionId: id });
      if (sessionId === id) {
        setSessionId(null);
      }
    }
  }

  async function handleBackToLobby() {
    if (!sessionId) return;
    if (confirm("This will reset all player scores and progress. Continue?")) {
      await backToLobby({ sessionId });
    }
  }

  function openSpectatorView() {
    if (!session) return;
    const url = `/spectate/${session.code}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copySessionCode() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      console.error("Failed to copy session code");
    }
  }

  async function copyPlayLink() {
    if (!session) return;
    try {
      const playLink = `${window.location.origin}/play/${session.code}`;
      await navigator.clipboard.writeText(playLink);
      setCopiedPlayLink(true);
      setTimeout(() => setCopiedPlayLink(false), 2000);
    } catch {
      console.error("Failed to copy play link");
    }
  }

  // Session list view
  if (!sessionId || !session) {
    return (
      <div className="admin-view">
        <header className="admin-header">
          <button onClick={onBack} className="back-btn">Back</button>
          <h1>Admin Panel</h1>
        </header>

        <div className="admin-content">
          <div className="admin-create-section">
            <button onClick={handleCreate} className="primary create-session-btn">
              + Create New Session
            </button>
          </div>

          {existingSessions && existingSessions.length > 0 && (
            <section className="admin-sessions-section">
              <h2>Your Sessions</h2>
              <ul className="session-list">
                {existingSessions.map((s) => (
                  <SessionListItem
                    key={s._id}
                    session={s}
                    onSelect={() => setSessionId(s._id)}
                    onDelete={() => handleDelete(s._id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    );
  }

  const enabledQuestions = questions?.filter(q => q.enabled !== false) ?? [];
  const sortedPlayers = [...(players ?? [])].sort((a, b) => b.elevation - a.elevation);

  // Active session dashboard
  return (
    <div className="admin-view admin-dashboard">
      {/* Top bar */}
      <header className="admin-header">
        <div className="header-left">
          <button onClick={() => setSessionId(null)} className="back-btn">
            Back to Sessions
          </button>
          <div className="session-code-display">
            <span className="code-label">Code:</span>
            <button
              onClick={copySessionCode}
              className={`code-copy-button ${copiedCode ? "copied" : ""}`}
              title="Click to copy session code"
            >
              <span className="code-value">{session.code}</span>
              <span className="copy-icon">{copiedCode ? "✓" : "📋"}</span>
            </button>
            <button
              onClick={copyPlayLink}
              className={`play-link-button ${copiedPlayLink ? "copied" : ""}`}
              title="Copy shareable play link"
            >
              {copiedPlayLink ? "Copied!" : "Copy Link"}
            </button>
            <span className={`status-badge status-${session.status}`}>{session.status}</span>
          </div>
        </div>
        <div className="header-right">
          <button onClick={openSpectatorView} className="header-btn spectator-btn">
            Spectate
          </button>
          {session.status === "active" && (
            <>
              <button
                onClick={handleBackToLobby}
                className="header-btn secondary"
                title="Reset game and return to editing"
              >
                Reset
              </button>
              <button
                onClick={() => finishSession({ sessionId })}
                className="header-btn danger"
                title="End game early"
              >
                End
              </button>
            </>
          )}
          <button
            onClick={() => handleDelete(sessionId)}
            className="header-btn danger"
            title="Delete session permanently"
          >
            Delete
          </button>
        </div>
      </header>

      <div className="admin-content-wrapper">
        {/* Session Info */}
        <section className="admin-section session-info-section">
          <div className="section-header">
            <h2>Session Info</h2>
          </div>
          <div className="session-info-grid">
            <div className="info-item">
              <span className="info-label">Status</span>
              <span className={`status-badge status-${session.status}`}>{session.status}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Players</span>
              <span className="info-value">{players?.length ?? 0}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Questions</span>
              <span className="info-value">{enabledQuestions.length} enabled</span>
            </div>
          </div>
        </section>

        {/* Main Action Button - Always visible, always in same spot */}
        <section className="admin-section host-action-section">
          <HostActionButton
            sessionId={sessionId}
            sessionStatus={session.status as SessionStatus}
            questionPhase={
              // Derive pre_game phase when session is active but hasn't started questions yet
              session.status === "active" && session.currentQuestionIndex === -1
                ? "pre_game"
                : (ropeClimbingState?.questionPhase as QuestionPhase)
            }
            enabledQuestionCount={enabledQuestions.length}
            currentQuestionIndex={session.currentQuestionIndex}
          />

          {/* Pre-game Status - right under action button */}
          {session.status === "active" && session.currentQuestionIndex === -1 && (
            <div className="current-question-status-inline pre-game-status">
              <div className="cqs-header">
                <h3>Game Started</h3>
                <span className={`phase-badge phase-pre_game`}>
                  Get Ready!
                </span>
              </div>
              <p className="pre-game-message">
                Players are at the base of the mountain, ready to climb!
              </p>
            </div>
          )}

          {/* Current Question Status - right under action button */}
          {session.status === "active" && currentQuestion && (
            <div className="current-question-status-inline">
              <div className="cqs-header">
                <h3>Current Question</h3>
                <span className="question-progress">
                  Q{session.currentQuestionIndex + 1} / {enabledQuestions.length}
                </span>
                <span className={`phase-badge phase-${ropeClimbingState?.questionPhase ?? "unknown"}`}>
                  {ropeClimbingState?.questionPhase === "question_shown" && "Showing Question"}
                  {ropeClimbingState?.questionPhase === "answers_shown" && "Accepting Answers"}
                  {ropeClimbingState?.questionPhase === "revealed" && "Revealed"}
                  {ropeClimbingState?.questionPhase === "results" && "Results"}
                </span>
              </div>
              {ropeClimbingState?.questionPhase !== "question_shown" && (
                <Timer
                  firstAnsweredAt={timingInfo?.firstAnsweredAt ?? null}
                  timeLimit={currentQuestion.timeLimit}
                  size="medium"
                  isRevealed={ropeClimbingState?.timing.isRevealed ?? false}
                  correctAnswer={ropeClimbingState?.ropes.find(r => r.isCorrect === true)?.optionText}
                  correctCount={ropeClimbingState?.ropes.find(r => r.isCorrect === true)?.players.length}
                  totalAnswered={ropeClimbingState?.answeredCount}
                />
              )}
              <div className="answer-stats">
                <span className="stat">
                  {timingInfo?.totalAnswers ?? 0} / {players?.length ?? 0} answered
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Questions section */}
        <section className="admin-section questions-section">
          <div className="section-header">
            <h2>Questions ({questions?.length ?? 0})</h2>
          </div>
          {session.status === "lobby" && (
            <AddQuestionForm sessionId={sessionId} />
          )}
          {questions && questions.length > 0 ? (
            <ul className="question-list compact">
              {questions.map((q, i) => {
                const isEnabled = q.enabled !== false;
                const isCompleted = session.status !== "lobby" &&
                  isEnabled &&
                  currentQuestion !== null &&
                  currentQuestion !== undefined &&
                  q.order < currentQuestion.order;
                return (
                  <QuestionItem
                    key={q._id}
                    question={q}
                    index={i}
                    isCurrent={currentQuestion?._id === q._id}
                    canEdit={session.status === "lobby"}
                    isFirst={i === 0}
                    isLast={i === (questions?.length ?? 0) - 1}
                    isCompleted={isCompleted}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="empty-message">No questions added yet</p>
          )}
        </section>

        {/* Players section - becomes leaderboard during results phase */}
        <section className={`admin-section players-section ${ropeClimbingState?.questionPhase === "results" ? "results-active" : ""}`}>
          <div className="section-header">
            <h2>
              {ropeClimbingState?.questionPhase === "results" ? "Leaderboard" : `Players (${players?.length ?? 0})`}
            </h2>
          </div>
          {sortedPlayers.length > 0 ? (
            <div className="player-grid">
              {sortedPlayers.map((p, i) => (
                <div
                  key={p._id}
                  className={`player-card ${i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : ""}`}
                >
                  <span className="player-rank">#{i + 1}</span>
                  <span className="player-name">{p.name}</span>
                  <span className="player-elevation">{p.elevation}m</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">No players have joined yet</p>
          )}
        </section>
      </div>
    </div>
  );
}

function SessionListItem({
  session,
  onSelect,
  onDelete
}: {
  session: Doc<"sessions">;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const questions = useQuery(api.questions.listBySession, { sessionId: session._id });
  const players = useQuery(api.players.listBySession, { sessionId: session._id });

  const createdDate = new Date(session.createdAt).toLocaleDateString();

  return (
    <li className="session-item">
      <div className="session-info" onClick={onSelect}>
        <strong>{session.code}</strong>
        <span className={`status-badge status-${session.status}`}>{session.status}</span>
        <span className="session-meta">
          {questions?.length ?? 0} questions | {players?.length ?? 0} players | {createdDate}
        </span>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="delete-btn"
        title="Delete session"
      >
        X
      </button>
    </li>
  );
}

function QuestionItem({
  question,
  index,
  isCurrent,
  canEdit,
  isFirst,
  isLast,
  isCompleted
}: {
  question: Doc<"questions">;
  index: number;
  isCurrent: boolean;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  isCompleted: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(question.text);
  const [options, setOptions] = useState(question.options.map(o => o.text));
  const [correctIndex, setCorrectIndex] = useState(question.correctOptionIndex);

  const updateQuestion = useMutation(api.questions.update);
  const deleteQuestion = useMutation(api.questions.remove);
  const reorderQuestion = useMutation(api.questions.reorder);
  const setEnabled = useMutation(api.questions.setEnabled);

  // Reset form when question changes
  useEffect(() => {
    setText(question.text);
    setOptions(question.options.map(o => o.text));
    setCorrectIndex(question.correctOptionIndex);
  }, [question]);

  async function handleSave() {
    await updateQuestion({
      questionId: question._id,
      text: text.trim(),
      options: options.filter(o => o.trim()).map(o => ({ text: o.trim() })),
      correctOptionIndex: correctIndex,
    });
    setIsEditing(false);
  }

  async function handleDelete() {
    if (confirm("Delete this question?")) {
      await deleteQuestion({ questionId: question._id });
    }
  }

  async function handleMoveUp() {
    await reorderQuestion({ questionId: question._id, direction: "up" });
  }

  async function handleMoveDown() {
    await reorderQuestion({ questionId: question._id, direction: "down" });
  }

  async function handleToggleEnabled() {
    const currentEnabled = question.enabled !== false;
    await setEnabled({ questionId: question._id, enabled: !currentEnabled });
  }

  const isEnabled = question.enabled !== false;
  const canModify = !isCompleted;

  if (isEditing && canEdit) {
    return (
      <li className="question-item editing">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Question text"
        />
        {options.map((opt, i) => (
          <div key={i} className="option-row">
            <input
              type="text"
              value={opt}
              onChange={(e) => {
                const newOpts = [...options];
                newOpts[i] = e.target.value;
                setOptions(newOpts);
              }}
              placeholder={`Option ${i + 1}`}
            />
            <label>
              <input
                type="radio"
                name={`correct-${question._id}`}
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
              />
              Correct
            </label>
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
                className="remove-option"
              >
                X
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setOptions([...options, ""])}>
          + Add Option
        </button>
        <div className="edit-actions">
          <button onClick={handleSave} className="primary">Save</button>
          <button onClick={() => setIsEditing(false)}>Cancel</button>
        </div>
      </li>
    );
  }

  return (
    <li className={`question-item ${isCurrent ? "current" : ""} ${!isEnabled ? "disabled" : ""} ${isCompleted ? "completed" : ""}`}>
      {/* Reorder buttons */}
      <div className="question-reorder">
        <button
          onClick={handleMoveUp}
          disabled={isFirst || !canModify}
          className="reorder-btn"
          title="Move up"
        >
          ↑
        </button>
        <button
          onClick={handleMoveDown}
          disabled={isLast || !canModify}
          className="reorder-btn"
          title="Move down"
        >
          ↓
        </button>
      </div>

      {/* Enable/disable toggle */}
      <button
        onClick={handleToggleEnabled}
        disabled={!canModify}
        className={`toggle-btn ${isEnabled ? "toggle-enabled" : "toggle-disabled"}`}
        title={isEnabled ? "Disable question" : "Enable question"}
      >
        <span className="toggle-track">
          <span className="toggle-thumb" />
        </span>
      </button>

      <span className="question-number">{index + 1}.</span>
      <span className="question-text">{question.text}</span>
      <span className="question-options">({question.options.length} options)</span>

      {isCompleted && (
        <span className="completed-badge">Completed</span>
      )}

      {canEdit && !isCompleted && (
        <div className="question-actions">
          <button onClick={() => setIsEditing(true)}>Edit</button>
          <button onClick={handleDelete} className="delete-btn">Delete</button>
        </div>
      )}
    </li>
  );
}

function AddQuestionForm({ sessionId }: { sessionId: Id<"sessions"> }) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState<number | undefined>();

  const createQuestion = useMutation(api.questions.create);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || options.filter((o) => o.trim()).length < 2) return;

    await createQuestion({
      sessionId,
      text: text.trim(),
      options: options.filter((o) => o.trim()).map((o) => ({ text: o.trim() })),
      correctOptionIndex: correctIndex,
    });

    setText("");
    setOptions(["", ""]);
    setCorrectIndex(undefined);
  }

  return (
    <form onSubmit={handleSubmit} className="add-question-form">
      <input
        type="text"
        placeholder="Question text"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {options.map((opt, i) => (
        <div key={i} className="option-row">
          <input
            type="text"
            placeholder={`Option ${i + 1}`}
            value={opt}
            onChange={(e) => {
              const newOpts = [...options];
              newOpts[i] = e.target.value;
              setOptions(newOpts);
            }}
          />
          <label>
            <input
              type="radio"
              name="correct"
              checked={correctIndex === i}
              onChange={() => setCorrectIndex(i)}
            />
            Correct
          </label>
        </div>
      ))}
      <button type="button" onClick={() => setOptions([...options, ""])}>
        + Add Option
      </button>
      <button type="submit">Add Question</button>
    </form>
  );
}
