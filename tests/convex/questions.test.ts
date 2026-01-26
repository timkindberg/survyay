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
    await t.mutation(api.questions.remove, { questionId: q._id });
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
      text: "Question 0 (enabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 1 (will be disabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 2 (will be disabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q3 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 3 (enabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Disable questions 1 and 2
    await t.mutation(api.questions.setEnabled, { questionId: q1, enabled: false });
    await t.mutation(api.questions.setEnabled, { questionId: q2, enabled: false });

    // Start the session - currentQuestionIndex becomes 0
    await t.mutation(api.sessions.start, { sessionId });

    // getCurrentQuestion should return q0 (first enabled question)
    let currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).not.toBeNull();
    expect(currentQ!._id).toBe(q0);
    expect(currentQ!.text).toBe("Question 0 (enabled)");

    // Move to next question - should skip q1, q2 and go to q3
    await t.mutation(api.sessions.nextQuestion, { sessionId });

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
      text: "Question 0 (will be disabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 1 (will be disabled)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 2 (enabled - should be first)",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Disable first two questions
    await t.mutation(api.questions.setEnabled, { questionId: q0, enabled: false });
    await t.mutation(api.questions.setEnabled, { questionId: q1, enabled: false });

    // Start session
    await t.mutation(api.sessions.start, { sessionId });

    // getCurrentQuestion should return q2 (first enabled question)
    const currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).not.toBeNull();
    expect(currentQ!._id).toBe(q2);
    expect(currentQ!.text).toBe("Question 2 (enabled - should be first)");
  });

  test("returns null when currentQuestionIndex is -1 (lobby state)", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete sample questions created by sessions.create
    await deleteSampleQuestions(t, sessionId);

    await t.mutation(api.questions.create, {
      sessionId,
      text: "Question",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Don't start the session - currentQuestionIndex is -1
    const currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ).toBeNull();
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
      text: "Q0 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q2 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q3 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q3 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q4 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q4 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Disable q1 and q2
    await t.mutation(api.questions.setEnabled, { questionId: q1, enabled: false });
    await t.mutation(api.questions.setEnabled, { questionId: q2, enabled: false });

    await t.mutation(api.sessions.start, { sessionId });

    // Verify we start at q0
    let session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(0);
    let currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ!._id).toBe(q0);

    // Next question - should go to q3 (index 1 in enabled list)
    let result = await t.mutation(api.sessions.nextQuestion, { sessionId });
    expect(result.finished).toBe(false);

    session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(1);
    currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ!._id).toBe(q3);

    // Next question - should go to q4 (index 2 in enabled list)
    result = await t.mutation(api.sessions.nextQuestion, { sessionId });
    expect(result.finished).toBe(false);

    session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(2);
    currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ!._id).toBe(q4);

    // Next question - should finish (no more enabled questions)
    result = await t.mutation(api.sessions.nextQuestion, { sessionId });
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
      text: "Q0 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Disable q1
    await t.mutation(api.questions.setEnabled, { questionId: q1, enabled: false });

    await t.mutation(api.sessions.start, { sessionId });

    // Verify we're on q0
    let currentQ = await t.query(api.questions.getCurrentQuestion, { sessionId });
    expect(currentQ!._id).toBe(q0);

    // Next question - should finish since only enabled question is done
    const result = await t.mutation(api.sessions.nextQuestion, { sessionId });
    expect(result.finished).toBe(true);

    const session = await t.query(api.sessions.get, { sessionId });
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
      text: "Q0 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    }).then(id => t.mutation(api.questions.setEnabled, { questionId: id, enabled: false }));

    await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.create, {
      sessionId,
      text: "Q2 disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    }).then(id => t.mutation(api.questions.setEnabled, { questionId: id, enabled: false }));

    await t.mutation(api.questions.create, {
      sessionId,
      text: "Q3 enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.sessions.start, { sessionId });

    // currentQuestionIndex should be 0 (first enabled question is Q1)
    let session = await t.query(api.sessions.get, { sessionId });
    expect(session!.currentQuestionIndex).toBe(0);

    // After next, currentQuestionIndex should be 1 (second enabled question is Q3)
    await t.mutation(api.sessions.nextQuestion, { sessionId });
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
      text: "Disabled question",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.setEnabled, { questionId: q, enabled: false });

    // Starting should fail
    await expect(
      t.mutation(api.sessions.start, { sessionId })
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
      text: "Disabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.create, {
      sessionId,
      text: "Enabled",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.setEnabled, { questionId: q0, enabled: false });

    // Starting should succeed
    await t.mutation(api.sessions.start, { sessionId });

    const session = await t.query(api.sessions.get, { sessionId });
    expect(session!.status).toBe("active");
    expect(session!.currentQuestionIndex).toBe(0);
  });
});
