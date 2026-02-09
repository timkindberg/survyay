import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import "./AdminView.css";
import { Timer } from "../components/Timer";
import type { RopeClimbingState } from "../../lib/ropeTypes";
import { ErrorMessage } from "../components/ErrorMessage";
import { getFriendlyErrorMessage } from "../lib/errorMessages";
import { PRESENCE_TIMEOUT_MS } from "../../lib/constants";
import { ConfirmationModal, useConfirmation } from "../components/ConfirmationModal";
import { AIQuestionModal } from "../components/AIQuestionModal";
import type { QuestionCategory } from "../../lib/sampleQuestions";

// Helper to check if a player is currently active based on heartbeat
function isPlayerActive(player: { lastSeenAt?: number }): boolean {
  if (!player.lastSeenAt) return false; // Never seen = inactive
  if (player.lastSeenAt === 0) return false; // Explicitly disconnected
  return Date.now() - player.lastSeenAt < PRESENCE_TIMEOUT_MS;
}

// Types for host action button
type SessionStatus = "lobby" | "active" | "finished";
type QuestionPhase = "pre_game" | "question_shown" | "answers_shown" | "revealed" | "results" | undefined;

interface HostActionConfig {
  label: string;
  action: () => Promise<void>;
  disabled: boolean;
  isDestructive?: boolean;
  confirmMessage?: string; // If set, requires confirmation before action
}

// Hook to determine the current host action based on session state
function useHostAction(
  sessionId: Id<"sessions"> | null,
  hostId: string,
  sessionStatus: SessionStatus | undefined,
  questionPhase: QuestionPhase,
  enabledQuestionCount: number,
  currentQuestionIndex: number,
  onBeforeStart?: () => Promise<void>
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
        action: async () => {
          if (onBeforeStart) {
            await onBeforeStart();
          }
          await startSession({ sessionId, hostId });
        },
        disabled: enabledQuestionCount === 0,
      };

    case "active":
      switch (questionPhase) {
        case "pre_game":
          return {
            label: "First Question",
            action: async () => { await nextQuestion({ sessionId, hostId }); },
            disabled: false,
          };
        case "question_shown":
          return {
            label: "Show Answers",
            action: async () => { await showAnswers({ sessionId, hostId }); },
            disabled: false,
          };
        case "answers_shown":
          return {
            label: "Reveal Answer",
            action: async () => { await revealAnswer({ sessionId, hostId }); },
            disabled: false,
          };
        case "revealed":
          return {
            label: "Show Leaderboard",
            action: async () => { await showResults({ sessionId, hostId }); },
            disabled: false,
          };
        case "results":
          return {
            label: isLastQuestion ? "End Game" : "Next Question",
            action: async () => { await nextQuestion({ sessionId, hostId }); },
            disabled: false,
            isDestructive: isLastQuestion,
          };
        default:
          return null;
      }

    case "finished":
      return {
        label: "New Game (Same Players)",
        action: async () => {
          await backToLobby({ sessionId, hostId });
        },
        disabled: false,
        confirmMessage: "This will reset all player scores and start a new game with the same players. Continue?",
      };

    default:
      return null;
  }
}

// Hook to determine the back action based on session state
function useBackAction(
  sessionId: Id<"sessions"> | null,
  hostId: string,
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
        action: async () => { await previousPhase({ sessionId, hostId }); },
        disabled: false,
        isDestructive: false, // No answers or progress to lose yet
      };
    case "results":
      return {
        label: "<- Revealed",
        action: async () => { await previousPhase({ sessionId, hostId }); },
        disabled: false,
        isDestructive: false,
      };
    case "revealed":
      return {
        label: "<- Hide Answer",
        action: async () => { await previousPhase({ sessionId, hostId }); },
        disabled: false,
        isDestructive: false,
      };
    case "answers_shown":
      return {
        label: "<- Clear Answers",
        action: async () => {
          await previousPhase({ sessionId, hostId });
        },
        disabled: false,
        isDestructive: true,
        confirmMessage: "This will delete all answers for this question. Continue?",
      };
    case "question_shown":
      if (currentQuestionIndex > 0) {
        return {
          label: `<- Q${currentQuestionIndex} Results`,
          action: async () => { await previousPhase({ sessionId, hostId }); },
          disabled: false,
          isDestructive: false,
        };
      } else {
        // Q1 -> Pre-game (safe: no progress lost, just going back to hype phase)
        return {
          label: "<- Pre-Game",
          action: async () => { await previousPhase({ sessionId, hostId }); },
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
  hostId,
  sessionStatus,
  questionPhase,
  enabledQuestionCount,
  currentQuestionIndex,
  onBeforeStart,
}: {
  sessionId: Id<"sessions">;
  hostId: string;
  sessionStatus: SessionStatus;
  questionPhase: QuestionPhase;
  enabledQuestionCount: number;
  currentQuestionIndex: number;
  onBeforeStart?: () => Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isBackLoading, setIsBackLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const confirmation = useConfirmation();

  const actionConfig = useHostAction(
    sessionId,
    hostId,
    sessionStatus,
    questionPhase,
    enabledQuestionCount,
    currentQuestionIndex,
    onBeforeStart
  );

  const backConfig = useBackAction(
    sessionId,
    hostId,
    sessionStatus,
    questionPhase,
    currentQuestionIndex
  );

  const executeAction = useCallback(async () => {
    if (!actionConfig || actionConfig.disabled || isLoading) return;

    setIsLoading(true);
    setActionError(null);
    try {
      await actionConfig.action();
    } catch (error) {
      console.error("Action failed:", error);
      setActionError(getFriendlyErrorMessage(error));
    } finally {
      setTimeout(() => setIsLoading(false), 300);
    }
  }, [actionConfig, isLoading]);

  const executeBackAction = useCallback(async () => {
    if (!backConfig || backConfig.disabled || isBackLoading) return;

    setIsBackLoading(true);
    setActionError(null);
    try {
      await backConfig.action();
    } catch (error) {
      console.error("Back action failed:", error);
      setActionError(getFriendlyErrorMessage(error));
    } finally {
      setTimeout(() => setIsBackLoading(false), 300);
    }
  }, [backConfig, isBackLoading]);

  const handleAction = useCallback(() => {
    if (!actionConfig || actionConfig.disabled || isLoading) return;

    if (actionConfig.confirmMessage) {
      confirmation.confirm({
        message: actionConfig.confirmMessage,
        confirmText: "Continue",
        cancelText: "Cancel",
        variant: actionConfig.isDestructive ? "danger" : "default",
        onConfirm: executeAction,
      });
    } else {
      executeAction();
    }
  }, [actionConfig, isLoading, confirmation, executeAction]);

  const handleBackAction = useCallback(() => {
    if (!backConfig || backConfig.disabled || isBackLoading) return;

    if (backConfig.confirmMessage) {
      confirmation.confirm({
        message: backConfig.confirmMessage,
        confirmText: "Continue",
        cancelText: "Cancel",
        variant: backConfig.isDestructive ? "danger" : "default",
        onConfirm: executeBackAction,
      });
    } else {
      executeBackAction();
    }
  }, [backConfig, isBackLoading, confirmation, executeBackAction]);

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
      <ErrorMessage
        message={actionError}
        onDismiss={() => setActionError(null)}
        variant="inline"
        autoDismissMs={5000}
      />
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
      <ConfirmationModal
        isOpen={confirmation.state.isOpen}
        onConfirm={confirmation.handleConfirm}
        onCancel={confirmation.handleCancel}
        title={confirmation.state.title}
        message={confirmation.state.message}
        confirmText={confirmation.state.confirmText}
        cancelText={confirmation.state.cancelText}
        variant={confirmation.state.variant}
      />
    </div>
  );
}

interface Props {
  onBack: () => void;
  initialCode?: string | null;
  initialToken?: string | null;
}

// Get or create a persistent hostId from localStorage
function getHostId(): string {
  const key = "blobby-host-id";
  let hostId = localStorage.getItem(key);
  if (!hostId) {
    hostId = crypto.randomUUID();
    localStorage.setItem(key, hostId);
  }
  return hostId;
}

export function AdminView({ onBack, initialCode, initialToken }: Props) {
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [hostId] = useState(getHostId);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPlayLink, setCopiedPlayLink] = useState(false);
  const [copiedHostLink, setCopiedHostLink] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<QuestionCategory[]>([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [shuffleOnStart, setShuffleOnStart] = useState(false);
  const confirmation = useConfirmation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createSession = useMutation(api.sessions.create);
  const deleteSession = useMutation(api.sessions.remove);
  const backToLobby = useMutation(api.sessions.backToLobby);
  const regenerateQuestions = useMutation(api.sessions.regenerateQuestions);
  const shuffleQuestionsMutation = useMutation(api.questions.shuffleQuestions);
  const exportQuestionsQuery = useQuery(
    api.questions.exportQuestions,
    sessionId ? { sessionId } : "skip"
  );
  const importQuestionsMutation = useMutation(api.questions.importQuestions);
  const categoryInfo = useQuery(api.sessions.getCategoryInfo);

  const existingSessions = useQuery(api.sessions.listByHost, { hostId });

  // Validate session from shareable host link if provided
  const sessionFromLink = useQuery(
    api.sessions.getByCodeAndToken,
    initialCode && initialToken
      ? { code: initialCode, secretToken: initialToken }
      : "skip"
  );

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
  // Rope climbing state for active question visualization
  // Only subscribe when game is active (session exists and not in lobby/finished)
  const ropeClimbingState = useQuery(
    api.answers.getRopeClimbingState,
    sessionId && session?.status === "active" ? { sessionId } : "skip"
  ) as RopeClimbingState | null | undefined;

  // Derive timing info from ropeClimbingState to avoid duplicate subscription
  const timingInfo = ropeClimbingState
    ? {
        firstAnsweredAt: ropeClimbingState.timing.firstAnsweredAt,
        timeLimit: ropeClimbingState.question.timeLimit,
        totalAnswers: ropeClimbingState.answeredCount,
      }
    : null;

  // Find current question from the questions list using ropeClimbingState.question.id
  // This avoids an extra subscription since we already have questions list
  const currentQuestion = ropeClimbingState && questions
    ? questions.find(q => q._id === ropeClimbingState.question.id) ?? null
    : null;

  const endGameEarly = useMutation(api.sessions.endGameEarly);

  // Auto-join session from shareable host link
  useEffect(() => {
    if (sessionFromLink && !sessionId) {
      setSessionId(sessionFromLink._id);
    } else if (sessionFromLink === null && initialCode && initialToken) {
      // Invalid link
      setAdminError("Invalid host link. The session may have been deleted.");
    }
  }, [sessionFromLink, sessionId, initialCode, initialToken]);

  // Update URL when session changes (to make it bookmarkable)
  useEffect(() => {
    if (session && session.secretToken) {
      const expectedPath = `/host/${session.code}/${session.secretToken}`;
      if (window.location.pathname !== expectedPath) {
        window.history.replaceState({}, "", expectedPath);
      }
    } else if (!sessionId) {
      // No session selected, go back to /admin
      if (window.location.pathname !== "/admin") {
        window.history.replaceState({}, "", "/admin");
      }
    }
  }, [session, sessionId]);

  async function handleCreate() {
    try {
      const result = await createSession({ hostId });
      setSessionId(result.sessionId);
      setAdminError(null);
    } catch (err) {
      setAdminError(getFriendlyErrorMessage(err));
    }
  }

  function handleDelete(id: Id<"sessions">) {
    confirmation.confirm({
      title: "Delete Session",
      message: "Are you sure you want to delete this session? This cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteSession({ sessionId: id, hostId });
          if (sessionId === id) {
            setSessionId(null);
          }
          setAdminError(null);
        } catch (err) {
          setAdminError(getFriendlyErrorMessage(err));
        }
      },
    });
  }

  function handleBackToLobby() {
    if (!sessionId) return;
    confirmation.confirm({
      title: "Reset Game",
      message: "This will reset all player scores and progress. Continue?",
      confirmText: "Reset",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        try {
          await backToLobby({ sessionId, hostId });
          setAdminError(null);
        } catch (err) {
          setAdminError(getFriendlyErrorMessage(err));
        }
      },
    });
  }

  function handleEndGameEarly() {
    if (!sessionId) return;
    confirmation.confirm({
      title: "End Game Early",
      message: "Are you sure you want to end the game early? This will show the final leaderboard.",
      confirmText: "End Game Early",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        try {
          await endGameEarly({ sessionId, hostId });
          setAdminError(null);
        } catch (err) {
          setAdminError(getFriendlyErrorMessage(err));
        }
      },
    });
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

  async function copyHostLink() {
    if (!session || !session.secretToken) return;
    try {
      // Copy the current page URL (which should be the host link)
      await navigator.clipboard.writeText(window.location.href);
      setCopiedHostLink(true);
      setTimeout(() => setCopiedHostLink(false), 2000);
    } catch {
      console.error("Failed to copy host link");
    }
  }

  function handleExportQuestions() {
    if (!session || !exportQuestionsQuery) return;

    try {
      const jsonString = JSON.stringify(exportQuestionsQuery, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      link.download = `questions-${session.code}-${timestamp}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setAdminError(null);
    } catch (err) {
      setAdminError(getFriendlyErrorMessage(err));
    }
  }

  async function handleImportQuestions(e: React.ChangeEvent<HTMLInputElement>) {
    if (!sessionId) return;
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as { questions: Array<{ text: string; options: string[]; correctIndex: number; timeLimit?: number }> };

      // Validate format
      if (!data.questions || !Array.isArray(data.questions)) {
        throw new Error("Invalid file format: missing 'questions' array");
      }

      // Import questions
      await importQuestionsMutation({
        sessionId,
        hostId,
        questions: data.questions,
      });

      setAdminError(null);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setAdminError("Invalid JSON file");
      } else {
        setAdminError(getFriendlyErrorMessage(err));
      }
    } finally {
      // Reset file input so the same file can be imported again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRegenerateQuestions() {
    if (!sessionId || isRegenerating) return;

    setIsRegenerating(true);
    setAdminError(null);
    try {
      await regenerateQuestions({
        sessionId,
        hostId,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        questionCount,
      });
    } catch (err) {
      setAdminError(getFriendlyErrorMessage(err));
    } finally {
      setIsRegenerating(false);
    }
  }

  function toggleCategory(category: QuestionCategory) {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }

  function selectAllCategories() {
    if (categoryInfo) {
      setSelectedCategories([...categoryInfo.categories] as QuestionCategory[]);
    }
  }

  function clearAllCategories() {
    setSelectedCategories([]);
  }

  // Session list view
  if (!sessionId || !session) {
    return (
      <div className="admin-view">
        {/* Admin error toast */}
        <ErrorMessage
          message={adminError}
          onDismiss={() => setAdminError(null)}
          variant="toast"
          autoDismissMs={5000}
        />

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
        <ConfirmationModal
          isOpen={confirmation.state.isOpen}
          onConfirm={confirmation.handleConfirm}
          onCancel={confirmation.handleCancel}
          title={confirmation.state.title}
          message={confirmation.state.message}
          confirmText={confirmation.state.confirmText}
          cancelText={confirmation.state.cancelText}
          variant={confirmation.state.variant}
        />
      </div>
    );
  }

  const enabledQuestions = questions?.filter(q => q.enabled !== false) ?? [];

  // Sort players: active first (by elevation desc), then inactive (by elevation desc)
  const sortedPlayers = [...(players ?? [])].sort((a, b) => {
    const aActive = isPlayerActive(a);
    const bActive = isPlayerActive(b);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return b.elevation - a.elevation;
  });

  const activePlayers = players?.filter(p => isPlayerActive(p)) ?? [];
  const inactivePlayers = players?.filter(p => !isPlayerActive(p)) ?? [];

  // Active session dashboard
  return (
    <div className="admin-view admin-dashboard">
      {/* Admin error toast */}
      <ErrorMessage
        message={adminError}
        onDismiss={() => setAdminError(null)}
        variant="toast"
        autoDismissMs={5000}
      />

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
            <button
              onClick={copyHostLink}
              className={`host-link-button ${copiedHostLink ? "copied" : ""}`}
              title="Copy shareable host link"
            >
              {copiedHostLink ? "✓ Copied!" : "📋 Copy Host Link"}
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
                onClick={handleEndGameEarly}
                className="header-btn danger"
                title="End game early and show final leaderboard"
              >
                End Game Early
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
            hostId={hostId}
            sessionStatus={session.status as SessionStatus}
            questionPhase={
              // Derive pre_game phase when session is active but hasn't started questions yet
              session.status === "active" && session.currentQuestionIndex === -1
                ? "pre_game"
                : (ropeClimbingState?.questionPhase as QuestionPhase)
            }
            enabledQuestionCount={enabledQuestions.length}
            currentQuestionIndex={session.currentQuestionIndex}
            onBeforeStart={shuffleOnStart ? async () => {
              await shuffleQuestionsMutation({ sessionId, hostId });
            } : undefined}
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
            <div className="question-actions-toolbar">
              {questions && questions.length > 0 && (
                <button
                  onClick={handleExportQuestions}
                  className="export-button"
                  title="Download questions as JSON file"
                >
                  📥 Export Questions
                </button>
              )}
              {session.status === "lobby" && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="import-button"
                    title="Import questions from JSON file"
                  >
                    📤 Import Questions
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: "none" }}
                    onChange={handleImportQuestions}
                  />
                  <button
                    onClick={() => setShowAIModal(true)}
                    className="ai-question-button"
                    title="Have AI generate questions"
                  >
                    🤖 Have AI add questions
                  </button>
                </>
              )}
            </div>
          </div>
          {session.status === "lobby" && categoryInfo && (
            <div className="category-selector">
              <div className="category-selector-header">
                <h3>Generate Questions by Category</h3>
                <div className="category-selector-actions">
                  <button
                    onClick={selectAllCategories}
                    className="category-action-btn"
                    type="button"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearAllCategories}
                    className="category-action-btn"
                    type="button"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="category-grid">
                {categoryInfo.categories.map((category) => {
                  const label = categoryInfo.labels[category as QuestionCategory];
                  const count = categoryInfo.counts[category as QuestionCategory];
                  const isSelected = selectedCategories.includes(category as QuestionCategory);
                  return (
                    <label
                      key={category}
                      className={`category-chip ${isSelected ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCategory(category as QuestionCategory)}
                      />
                      <span className="category-label">{label}</span>
                      <span className="category-count">({count})</span>
                    </label>
                  );
                })}
              </div>
              <div className="category-generator-controls">
                <div className="question-count-control">
                  <label htmlFor="question-count">Questions to generate:</label>
                  <input
                    id="question-count"
                    type="number"
                    min={1}
                    max={50}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
                  />
                </div>
                <button
                  onClick={handleRegenerateQuestions}
                  disabled={isRegenerating}
                  className="regenerate-button primary"
                >
                  {isRegenerating ? "Generating..." : "Generate New Questions"}
                </button>
                <p className="category-help-text">
                  {selectedCategories.length === 0
                    ? `All categories selected (${categoryInfo.total} questions available)`
                    : `${selectedCategories.length} ${selectedCategories.length === 1 ? "category" : "categories"} selected`}
                </p>
              </div>
            </div>
          )}
          {session.status === "lobby" && (
            <AddQuestionForm sessionId={sessionId} hostId={hostId} />
          )}
          {session.status === "lobby" && questions && questions.length > 1 && (
            <label className="shuffle-checkbox">
              <input
                type="checkbox"
                checked={shuffleOnStart}
                onChange={(e) => setShuffleOnStart(e.target.checked)}
              />
              <span>Randomize question order when game starts</span>
            </label>
          )}
          {questions === undefined ? (
            <div style={{ padding: "4px 0" }}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="skeleton-question-row">
                  <div className="skeleton-question-number" />
                  <div className="skeleton-question-text" style={{ width: `${60 + (i * 17) % 30}%` }} />
                </div>
              ))}
            </div>
          ) : questions.length > 0 ? (
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
                    hostId={hostId}
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
              {ropeClimbingState?.questionPhase === "results"
                ? "Leaderboard"
                : `Players (${activePlayers.length} active${inactivePlayers.length > 0 ? `, ${inactivePlayers.length} inactive` : ""})`}
            </h2>
          </div>
          {players === undefined ? (
            <div className="skeleton-player-grid">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton-player-card">
                  <div className="skeleton-player-avatar" />
                  <div className="skeleton-player-name" style={{ width: `${50 + (i * 13) % 40}%` }} />
                </div>
              ))}
            </div>
          ) : sortedPlayers.length > 0 ? (
            <div className="player-grid">
              {sortedPlayers.map((p, i) => (
                <PlayerCard
                  key={p._id}
                  player={p}
                  rank={i + 1}
                  hostId={hostId}
                  isActive={isPlayerActive(p)}
                  showKickButton={session.status === "lobby" || !isPlayerActive(p)}
                />
              ))}
            </div>
          ) : (
            <p className="empty-message">No players have joined yet</p>
          )}
        </section>
      </div>
      <ConfirmationModal
        isOpen={confirmation.state.isOpen}
        onConfirm={confirmation.handleConfirm}
        onCancel={confirmation.handleCancel}
        title={confirmation.state.title}
        message={confirmation.state.message}
        confirmText={confirmation.state.confirmText}
        cancelText={confirmation.state.cancelText}
        variant={confirmation.state.variant}
      />
      <AIQuestionModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        sessionCode={session.code}
        hostId={hostId}
        convexUrl={import.meta.env.VITE_CONVEX_URL as string}
      />
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
  hostId,
  isCurrent,
  canEdit,
  isFirst,
  isLast,
  isCompleted
}: {
  question: Doc<"questions">;
  index: number;
  hostId: string;
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
  const [followUpText, setFollowUpText] = useState(question.followUpText ?? "");
  const confirmation = useConfirmation();

  const updateQuestion = useMutation(api.questions.update);
  const deleteQuestion = useMutation(api.questions.remove);
  const reorderQuestion = useMutation(api.questions.reorder);
  const setEnabled = useMutation(api.questions.setEnabled);

  // Reset form when question changes
  useEffect(() => {
    setText(question.text);
    setOptions(question.options.map(o => o.text));
    setCorrectIndex(question.correctOptionIndex);
    setFollowUpText(question.followUpText ?? "");
  }, [question]);

  async function handleSave() {
    await updateQuestion({
      questionId: question._id,
      hostId,
      text: text.trim(),
      options: options.filter(o => o.trim()).map(o => ({ text: o.trim() })),
      correctOptionIndex: correctIndex,
      followUpText: followUpText.trim() || undefined,
    });
    setIsEditing(false);
  }

  function handleDelete() {
    confirmation.confirm({
      title: "Delete Question",
      message: "Delete this question?",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        await deleteQuestion({ questionId: question._id, hostId });
      },
    });
  }

  async function handleMoveUp() {
    await reorderQuestion({ questionId: question._id, hostId, direction: "up" });
  }

  async function handleMoveDown() {
    await reorderQuestion({ questionId: question._id, hostId, direction: "down" });
  }

  async function handleToggleEnabled() {
    const currentEnabled = question.enabled !== false;
    await setEnabled({ questionId: question._id, hostId, enabled: !currentEnabled });
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
        <textarea
          placeholder="Fun Fact / Follow-up (optional) - shown after answer reveal"
          value={followUpText}
          onChange={(e) => setFollowUpText(e.target.value)}
          rows={2}
          className="follow-up-textarea"
        />
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
      <ConfirmationModal
        isOpen={confirmation.state.isOpen}
        onConfirm={confirmation.handleConfirm}
        onCancel={confirmation.handleCancel}
        title={confirmation.state.title}
        message={confirmation.state.message}
        confirmText={confirmation.state.confirmText}
        cancelText={confirmation.state.cancelText}
        variant={confirmation.state.variant}
      />
    </li>
  );
}

function AddQuestionForm({ sessionId, hostId }: { sessionId: Id<"sessions">; hostId: string }) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState<number | undefined>();
  const [followUpText, setFollowUpText] = useState("");

  const createQuestion = useMutation(api.questions.create);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || options.filter((o) => o.trim()).length < 2) return;

    await createQuestion({
      sessionId,
      hostId,
      text: text.trim(),
      options: options.filter((o) => o.trim()).map((o) => ({ text: o.trim() })),
      correctOptionIndex: correctIndex,
      followUpText: followUpText.trim() || undefined,
    });

    setText("");
    setOptions(["", ""]);
    setCorrectIndex(undefined);
    setFollowUpText("");
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
      <textarea
        placeholder="Fun Fact / Follow-up (optional) - shown after answer reveal"
        value={followUpText}
        onChange={(e) => setFollowUpText(e.target.value)}
        rows={2}
        className="follow-up-textarea"
      />
      <button type="submit">Add Question</button>
    </form>
  );
}

function PlayerCard({
  player,
  rank,
  hostId,
  isActive,
  showKickButton,
}: {
  player: Doc<"players">;
  rank: number;
  hostId: string;
  isActive: boolean;
  showKickButton: boolean;
}) {
  const [isKicking, setIsKicking] = useState(false);
  const [kickError, setKickError] = useState<string | null>(null);
  const confirmation = useConfirmation();
  const kickPlayer = useMutation(api.players.kick);

  function handleKick() {
    if (!player._id) {
      console.error("Cannot kick player: missing player ID");
      setKickError("Cannot kick player: missing player ID");
      return;
    }
    confirmation.confirm({
      title: "Kick Player",
      message: `Kick ${player.name} from this session? This will remove their progress.`,
      confirmText: "Kick",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        setIsKicking(true);
        setKickError(null);
        try {
          console.log("Kicking player:", player._id, player.name);
          await kickPlayer({ playerId: player._id, hostId });
          console.log("Kick mutation completed successfully for:", player._id);
        } catch (err) {
          console.error("Failed to kick player:", player._id, err);
          setKickError(`Failed to kick player: ${err instanceof Error ? err.message : "Unknown error"}`);
        } finally {
          setIsKicking(false);
        }
      },
    });
  }

  const rankClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "";

  return (
    <>
      <div className={`player-card ${rankClass} ${!isActive ? "inactive" : ""}`}>
        <span className="player-rank">#{rank}</span>
        <span className="player-name">{player.name}</span>
        {!isActive && <span className="inactive-badge">Inactive</span>}
        <span className="player-elevation">{player.elevation}m</span>
        {showKickButton && (
          <button
            onClick={handleKick}
            disabled={isKicking}
            className="kick-btn"
            title="Kick player from session"
          >
            {isKicking ? "..." : "X"}
          </button>
        )}
        {kickError && (
          <ErrorMessage
            message={kickError}
            onDismiss={() => setKickError(null)}
            variant="inline"
            autoDismissMs={5000}
          />
        )}
      </div>
      <ConfirmationModal
        isOpen={confirmation.state.isOpen}
        onConfirm={confirmation.handleConfirm}
        onCancel={confirmation.handleCancel}
        title={confirmation.state.title}
        message={confirmation.state.message}
        confirmText={confirmation.state.confirmText}
        cancelText={confirmation.state.cancelText}
        variant={confirmation.state.variant}
      />
    </>
  );
}
