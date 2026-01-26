import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import { Mountain } from "../components/Mountain";
import { Timer } from "../components/Timer";
import { MuteToggle } from "../components/MuteToggle";
import type { RopeClimbingState } from "../../lib/ropeTypes";

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

export function HostView({ onBack }: Props) {
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [hostId] = useState(getHostId);

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

  // Session list view
  if (!sessionId || !session) {
    return (
      <div className="host-view">
        <button onClick={onBack}>Back</button>
        <h2>Host a Session</h2>

        <button onClick={handleCreate} className="primary">
          + Create New Session
        </button>

        {existingSessions && existingSessions.length > 0 && (
          <section className="existing-sessions">
            <h3>Your Sessions</h3>
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
    );
  }

  // Active session view
  return (
    <div className="host-view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => setSessionId(null)}>Back to Sessions</button>
        <MuteToggle size={40} />
      </div>

      <div className="session-header">
        <h2>Session: {session.code}</h2>
        <span className={`status-badge status-${session.status}`}>{session.status}</span>
        <button
          onClick={() => handleDelete(sessionId)}
          className="delete-btn"
          title="Delete session"
        >
          Delete
        </button>
      </div>

      <section>
        <h3>Players ({players?.length ?? 0})</h3>
        <Mountain
          players={players?.map((p) => ({
            id: p._id,
            name: p.name,
            elevation: p.elevation,
          })) ?? []}
          mode="spectator"
          width={400}
          height={500}
          ropeClimbingState={ropeClimbingState}
        />
        {players && players.length > 0 && (
          <ul>
            {players.map((p) => (
              <li key={p._id}>
                {p.name} - {p.elevation}m
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Current Question Display (when game is active) */}
      {session.status === "active" && currentQuestion && (
        <section className="current-question-display">
          <div className="current-question-header">
            <h3>Current Question ({session.currentQuestionIndex + 1}/{questions?.length ?? 0})</h3>
            <Timer
              firstAnsweredAt={timingInfo?.firstAnsweredAt ?? null}
              timeLimit={currentQuestion.timeLimit}
              size="large"
              isRevealed={ropeClimbingState?.timing.isRevealed ?? false}
              correctAnswer={ropeClimbingState?.ropes.find(r => r.isCorrect === true)?.optionText}
              correctCount={ropeClimbingState?.ropes.find(r => r.isCorrect === true)?.players.length}
              totalAnswered={ropeClimbingState?.answeredCount}
            />
          </div>
          <div className="current-question-text">
            <h2>{currentQuestion.text}</h2>
          </div>
          <div className="current-question-options">
            {currentQuestion.options.map((opt, i) => (
              <div
                key={i}
                className={`option-display ${currentQuestion.correctOptionIndex === i ? "correct" : ""}`}
              >
                {opt.text}
              </div>
            ))}
          </div>
          <p className="answer-count">
            {timingInfo?.totalAnswers ?? 0} answers received
          </p>
        </section>
      )}

      <section>
        <h3>Questions ({questions?.length ?? 0})</h3>
        {session.status === "lobby" && (
          <AddQuestionForm sessionId={sessionId} />
        )}
        <ul className="question-list">
          {questions?.map((q, i) => {
            // A question is completed if:
            // 1. Session is active/finished (not lobby)
            // 2. The question is enabled AND its order is less than the current question's order
            // Disabled questions are never marked as completed (they were skipped)
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
      </section>

      <section className="controls">
        {session.status === "lobby" && (
          <button
            onClick={() => startSession({ sessionId })}
            disabled={!questions?.filter(q => q.enabled !== false).length}
            className="primary"
          >
            Start Game ({questions?.filter(q => q.enabled !== false).length ?? 0} questions)
          </button>
        )}
        {session.status === "active" && (
          <>
            <button onClick={() => nextQuestion({ sessionId })} className="primary">
              Next Question
            </button>
            <button onClick={handleBackToLobby}>
              Back to Editing
            </button>
            <button onClick={() => finishSession({ sessionId })}>
              End Game
            </button>
          </>
        )}
      </section>
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
