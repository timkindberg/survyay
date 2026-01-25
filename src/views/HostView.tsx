import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface Props {
  onBack: () => void;
}

export function HostView({ onBack }: Props) {
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [hostId] = useState(() => crypto.randomUUID());

  const createSession = useMutation(api.sessions.create);
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

  const startSession = useMutation(api.sessions.start);
  const nextQuestion = useMutation(api.sessions.nextQuestion);
  const finishSession = useMutation(api.sessions.finish);

  async function handleCreate() {
    const result = await createSession({ hostId });
    setSessionId(result.sessionId);
  }

  if (!sessionId || !session) {
    return (
      <div className="host-view">
        <button onClick={onBack}>← Back</button>
        <h2>Host a Session</h2>
        <button onClick={handleCreate}>Create New Session</button>
      </div>
    );
  }

  return (
    <div className="host-view">
      <button onClick={onBack}>← Back</button>
      <h2>Session: {session.code}</h2>
      <p>Status: {session.status}</p>

      <section>
        <h3>Players ({players?.length ?? 0})</h3>
        <ul>
          {players?.map((p) => (
            <li key={p._id}>
              {p.name} - {p.elevation}m
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Questions ({questions?.length ?? 0})</h3>
        {session.status === "lobby" && (
          <AddQuestionForm sessionId={sessionId} />
        )}
        <ul>
          {questions?.map((q, i) => (
            <li key={q._id} className={session.currentQuestionIndex === i ? "current" : ""}>
              {q.text} ({q.options.length} options)
            </li>
          ))}
        </ul>
      </section>

      <section className="controls">
        {session.status === "lobby" && (
          <button
            onClick={() => startSession({ sessionId })}
            disabled={!questions?.length}
          >
            Start Game
          </button>
        )}
        {session.status === "active" && (
          <button onClick={() => nextQuestion({ sessionId })}>
            Next Question
          </button>
        )}
        {session.status === "active" && (
          <button onClick={() => finishSession({ sessionId })}>
            End Game
          </button>
        )}
      </section>
    </div>
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
