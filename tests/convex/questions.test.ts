import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.ts");

// Helper to delete all sample questions created by sessions.create
async function deleteSampleQuestions(
  t: ReturnType<typeof convexTest>,
  sessionId: Id<"sessions">
) {
  const questions = await t.query(api.questions.listBySession, { sessionId });
  for (const q of questions) {
    await t.mutation(api.questions.remove, { questionId: q._id, hostId: "test-host" });
  }
}

describe("questions.getCurrentQuestion with disabled questions", () => {
  test("returns the correct enabled question when some questions are disabled", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions created by sessions.create
    await deleteSampleQuestions(t, sessionId);

    // Create 4 questions - we'll disable #1 and #2 (0-indexed)
    const q0 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Question 0 (enabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Question 1 (will be disabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Question 2 (will be disabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q3 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Question 3 (enabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Disable questions 1 and 2
    await t.mutation(api.questions.setEnabled, { questionId: q1, hostId: "test-host", enabled: false });
    await t.mutation(api.questions.setEnabled, { questionId: q2, hostId: "test-host", enabled: false });

    // Start the session - goes to pre_game phase (currentQuestionIndex becomes -1)
    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    // In pre_game, getCurrentQuestion should return null (no question yet)
    let currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).toBeNull();

    // Move to first question - should show q0 (first enabled question)
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).not.toBeNull();
    expect(currentQ!._id).toBe(q0);
    expect(currentQ!.text).toBe("Question 0 (enabled)");

    // Move to next question - should skip q1, q2 and go to q3
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });

    // getCurrentQuestion should now return q3 (second enabled question, index 1 in enabled list)
    currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).not.toBeNull();
    expect(currentQ!._id).toBe(q3);
    expect(currentQ!.text).toBe("Question 3 (enabled)");
  });

  test("returns first enabled question even if first questions are disabled", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions created by sessions.create
    await deleteSampleQuestions(t, sessionId);

    // Create questions where first two are disabled
    const q0 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Question 0 (will be disabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Question 1 (will be disabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Question 2 (enabled - should be first)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Disable first two questions
    await t.mutation(api.questions.setEnabled, { questionId: q0, hostId: "test-host", enabled: false });
    await t.mutation(api.questions.setEnabled, { questionId: q1, hostId: "test-host", enabled: false });

    // Start session (goes to pre_game with currentQuestionIndex = -1)
    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    // In pre_game, getCurrentQuestion should return null
    let currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).toBeNull();

    // Move to first question - should be q2 (first enabled question)
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).not.toBeNull();
    expect(currentQ!._id).toBe(q2);
    expect(currentQ!.text).toBe("Question 2 (enabled - should be first)");
  });

  test("returns null when currentQuestionIndex is -1 (lobby or pre_game state)", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions created by sessions.create
    await deleteSampleQuestions(t, sessionId);

    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Question",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // In lobby state - currentQuestionIndex is -1
    let currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).toBeNull();

    // Start session (goes to pre_game) - currentQuestionIndex is still -1
    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).toBeNull();

    // Move to first question - should now have a current question
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).not.toBeNull();
  });
});

describe("sessions.nextQuestion with disabled questions", () => {
  test("skips disabled questions and advances to next enabled one", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions created by sessions.create
    await deleteSampleQuestions(t, sessionId);

    // Create 5 questions
    const q0 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q0 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q1 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q2 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q3 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q3 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q4 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q4 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Disable q1 and q2
    await t.mutation(api.questions.setEnabled, { questionId: q1, hostId: "test-host", enabled: false });
    await t.mutation(api.questions.setEnabled, { questionId: q2, hostId: "test-host", enabled: false });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    // After start, we're in pre_game phase with currentQuestionIndex = -1
    let session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(-1);
    expect(session!.questionPhase).toBe("pre_game");

    // Move to first question - should be q0
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(0);
    let currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ!._id).toBe(q0);

    // Next question - should go to q3 (index 1 in enabled list)
    let result = await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    expect(result.finished).toBe(false);

    session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(1);
    currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ!._id).toBe(q3);

    // Next question - should go to q4 (index 2 in enabled list)
    result = await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    expect(result.finished).toBe(false);

    session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(2);
    currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ!._id).toBe(q4);

    // Next question - should finish (no more enabled questions)
    result = await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    expect(result.finished).toBe(true);

    session = await t.query(api.sessions.get, { sessionId });
    expect(session!.status).toBe("finished");
  });

  test("finishes session when only disabled questions remain", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions created by sessions.create
    await deleteSampleQuestions(t, sessionId);

    // Create 2 questions, second one will be disabled
    const q0 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q0 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q1 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Disable q1
    await t.mutation(api.questions.setEnabled, { questionId: q1, hostId: "test-host", enabled: false });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    // After start, we're in pre_game phase
    let session = await t.query(api.sessions.get, { sessionId });
    expect(session!.questionPhase).toBe("pre_game");

    // Move to first question - should be q0
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    let currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ!._id).toBe(q0);

    // Next question - should finish since only enabled question is done
    const result = await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    expect(result.finished).toBe(true);

    session = await t.query(api.sessions.get, { sessionId });
    expect(session!.status).toBe("finished");
  });

  test("currentQuestionIndex reflects position in enabled-only list", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions created by sessions.create
    await deleteSampleQuestions(t, sessionId);

    // Create 4 questions, disable every other one
    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q0 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    }).then(id => t.mutation(api.questions.setEnabled, { questionId: id, hostId: "test-host", enabled: false }));

    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q1 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q2 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    }).then(id => t.mutation(api.questions.setEnabled, { questionId: id, hostId: "test-host", enabled: false }));

    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q3 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    // After start, we're in pre_game phase with currentQuestionIndex = -1
    let session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(-1);

    // Move to first question
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(0);

    // After next, currentQuestionIndex should be 1 (second enabled question is Q3)
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(1);
  });
});

describe("sessions.start with disabled questions", () => {
  test("throws error when all questions are disabled", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions created by sessions.create
    await deleteSampleQuestions(t, sessionId);

    // Create a question and disable it
    const q = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Disabled question",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.setEnabled, { questionId: q, hostId: "test-host", enabled: false });

    // Starting should fail
    await expect(
      t.mutation(api.sessions.start, { sessionId, hostId: "test-host" })
    ).rejects.toThrowError("Add at least one enabled question before starting");
  });

  test("starts successfully with at least one enabled question", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions created by sessions.create
    await deleteSampleQuestions(t, sessionId);

    // Create two questions, disable one
    const q0 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.setEnabled, { questionId: q0, hostId: "test-host", enabled: false });

    // Starting should succeed (goes to pre_game phase)
    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    const session = await t.query(api.sessions.get, { sessionId });
    expect(session!.status).toBe("active");
    expect(session!.currentQuestionIndex).toBe(-1);
    expect(session!.questionPhase).toBe("pre_game");
  });
});

describe("questions export and import", () => {
  test("exports questions in correct format", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions
    await deleteSampleQuestions(t, sessionId);

    // Create test questions
    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "First question?",
      options: [{ text: "Option A" }, { text: "Option B" }, { text: "Option C" }],
      correctOptionIndex: 1,
      timeLimit: 45,
    });

    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Second question?",
      options: [{ text: "Yes" }, { text: "No" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Export questions
    const exported = await t.query(api.questions.exportQuestions, { sessionId });

    expect(exported.questions).toHaveLength(2);
    expect(exported.questions[0]).toEqual({
      text: "First question?",
      options: ["Option A", "Option B", "Option C"],
      correctIndex: 1,
      timeLimit: 45,
    });
    expect(exported.questions[1]).toEqual({
      text: "Second question?",
      options: ["Yes", "No"],
      correctIndex: 0,
      timeLimit: 30,
    });
  });

  test("imports questions successfully", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions
    await deleteSampleQuestions(t, sessionId);

    // Import questions
    const result = await t.mutation(api.questions.importQuestions, {
      sessionId,
      hostId: "test-host",
      questions: [
        {
          text: "Imported Q1",
          options: ["A", "B"],
          correctIndex: 0,
          timeLimit: 20,
        },
        {
          text: "Imported Q2",
          options: ["Yes", "No", "Maybe"],
          correctIndex: 2,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);

    // Verify questions were created
    const questions = await t.query(api.questions.listBySession, { sessionId });
    expect(questions).toHaveLength(2);
    expect(questions[0]?.text).toBe("Imported Q1");
    expect(questions[0]?.options).toEqual([{ text: "A" }, { text: "B" }]);
    expect(questions[0]?.correctOptionIndex).toBe(0);
    expect(questions[0]?.timeLimit).toBe(20);
    expect(questions[1]?.text).toBe("Imported Q2");
    expect(questions[1]?.timeLimit).toBe(30); // Default
  });

  test("import replaces existing questions", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions
    await deleteSampleQuestions(t, sessionId);

    // Create initial questions
    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Original Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Original Q2",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Verify we have 2 questions
    let questions = await t.query(api.questions.listBySession, { sessionId });
    expect(questions).toHaveLength(2);

    // Import new questions (should replace)
    await t.mutation(api.questions.importQuestions, {
      sessionId,
      hostId: "test-host",
      questions: [
        {
          text: "Imported Q1",
          options: ["X", "Y", "Z"],
          correctIndex: 1,
          timeLimit: 40,
        },
      ],
    });

    // Verify only 1 question now
    questions = await t.query(api.questions.listBySession, { sessionId });
    expect(questions).toHaveLength(1);
    expect(questions[0]?.text).toBe("Imported Q1");
  });

  test("import fails when session is not in lobby", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions and add one
    await deleteSampleQuestions(t, sessionId);
    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Question",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Start the session
    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    // Try to import - should fail
    await expect(
      t.mutation(api.questions.importQuestions, {
        sessionId,
        hostId: "test-host",
        questions: [
          {
            text: "New Q",
            options: ["A", "B"],
            correctIndex: 0,
          },
        ],
      })
    ).rejects.toThrowError("Can only import questions in lobby state");
  });

  test("import validates question format", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Empty questions array
    await expect(
      t.mutation(api.questions.importQuestions, {
        sessionId,
        hostId: "test-host",
        questions: [],
      })
    ).rejects.toThrowError("Questions array cannot be empty");

    // Invalid correctIndex
    await expect(
      t.mutation(api.questions.importQuestions, {
        sessionId,
        hostId: "test-host",
        questions: [
          {
            text: "Q1",
            options: ["A", "B"],
            correctIndex: 5, // Out of bounds
          },
        ],
      })
    ).rejects.toThrowError("correctIndex must be a valid option index");

    // Too few options
    await expect(
      t.mutation(api.questions.importQuestions, {
        sessionId,
        hostId: "test-host",
        questions: [
          {
            text: "Q1",
            options: ["A"], // Only 1 option
            correctIndex: 0,
          },
        ],
      })
    ).rejects.toThrowError("options must be an array with at least 2 items");
  });

  test("export and import round-trip preserves questions", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions
    await deleteSampleQuestions(t, sessionId);

    // Create test questions
    const originalQuestions = [
      {
        text: "Question 1",
        options: ["A", "B", "C"],
        correctIndex: 0,
        timeLimit: 25,
      },
      {
        text: "Question 2",
        options: ["Yes", "No"],
        correctIndex: 1,
        timeLimit: 50,
      },
    ];

    for (const q of originalQuestions) {
      await t.mutation(api.questions.create, {
        sessionId,
        hostId: "test-host",
        text: q.text,
        options: q.options.map((text) => ({ text })),
        correctOptionIndex: q.correctIndex,
        timeLimit: q.timeLimit,
      });
    }

    // Export
    const exported = await t.query(api.questions.exportQuestions, { sessionId });

    // Create new session
    const { sessionId: newSessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });
    await deleteSampleQuestions(t, newSessionId);

    // Import to new session
    await t.mutation(api.questions.importQuestions, {
      sessionId: newSessionId,
      hostId: "test-host",
      questions: exported.questions,
    });

    // Verify round-trip
    const imported = await t.query(api.questions.listBySession, { sessionId: newSessionId });
    expect(imported).toHaveLength(2);
    expect(imported[0]?.text).toBe("Question 1");
    expect(imported[0]?.options).toEqual([{ text: "A" }, { text: "B" }, { text: "C" }]);
    expect(imported[0]?.correctOptionIndex).toBe(0);
    expect(imported[0]?.timeLimit).toBe(25);
    expect(imported[1]?.text).toBe("Question 2");
    expect(imported[1]?.options).toEqual([{ text: "Yes" }, { text: "No" }]);
    expect(imported[1]?.correctOptionIndex).toBe(1);
    expect(imported[1]?.timeLimit).toBe(50);
  });
});
