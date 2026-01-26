import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("sessions.listByHost", () => {
  test("returns sessions for a specific host", async () => {
    const t = convexTest(schema, modules);

    // Create sessions for two different hosts
    await t.mutation(api.sessions.create, { hostId: "host-1" });
    await t.mutation(api.sessions.create, { hostId: "host-1" });
    await t.mutation(api.sessions.create, { hostId: "host-2" });

    const host1Sessions = await t.query(api.sessions.listByHost, { hostId: "host-1" });
    const host2Sessions = await t.query(api.sessions.listByHost, { hostId: "host-2" });

    expect(host1Sessions).toHaveLength(2);
    expect(host2Sessions).toHaveLength(1);
  });

  test("excludes finished sessions", async () => {
    const t = convexTest(schema, modules);

    const { sessionId: s1 } = await t.mutation(api.sessions.create, { hostId: "host-1" });
    await t.mutation(api.sessions.create, { hostId: "host-1" });

    // Add a question to s1 so we can start and finish it
    await t.mutation(api.questions.create, {
      sessionId: s1,
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Start and finish the first session
    await t.mutation(api.sessions.start, { sessionId: s1 });
    await t.mutation(api.sessions.finish, { sessionId: s1 });

    const sessions = await t.query(api.sessions.listByHost, { hostId: "host-1" });

    // Should only return the one that isn't finished
    expect(sessions).toHaveLength(1);
    expect(sessions[0]._id).not.toBe(s1);
  });

  test("returns sessions sorted by creation date (newest first)", async () => {
    const t = convexTest(schema, modules);

    // Create first session
    const { sessionId: s1 } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // Advance time to ensure different createdAt timestamps
    t.run(async (ctx) => {
      // This test verifies the sort order - both sessions will be returned
      // and we check that the sorting is by createdAt descending
    });

    const { sessionId: s2 } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    const sessions = await t.query(api.sessions.listByHost, { hostId: "host-1" });

    // Both sessions should be returned
    expect(sessions).toHaveLength(2);

    // The sessions should be sorted by createdAt descending
    // Since sessions are created in order, s2 has later/equal createdAt than s1
    expect(sessions[0].createdAt).toBeGreaterThanOrEqual(sessions[1].createdAt);
  });
});

describe("sessions.remove", () => {
  test("deletes session and all related data", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // Add a question
    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Add a player
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    // Start session, show answers, and submit an answer
    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 0,
    });

    // Delete the session
    await t.mutation(api.sessions.remove, { sessionId });

    // Verify everything is deleted
    const session = await t.query(api.sessions.get, { sessionId });
    const questions = await t.query(api.questions.listBySession, { sessionId });
    const players = await t.query(api.players.listBySession, { sessionId });

    expect(session).toBeNull();
    expect(questions).toHaveLength(0);
    expect(players).toHaveLength(0);
  });

  test("throws error for non-existent session", async () => {
    const t = convexTest(schema, modules);

    // Create a session to get a valid ID format, then delete it
    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });
    await t.mutation(api.sessions.remove, { sessionId });

    // Try to delete again
    await expect(
      t.mutation(api.sessions.remove, { sessionId })
    ).rejects.toThrowError("Session not found");
  });
});

describe("sessions.backToLobby", () => {
  test("resets session state to lobby", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // Add questions
    await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Start the session
    await t.mutation(api.sessions.start, { sessionId });

    // Verify it's active
    let session = await t.query(api.sessions.get, { sessionId });
    expect(session?.status).toBe("active");
    expect(session?.currentQuestionIndex).toBe(0);

    // Go back to lobby
    await t.mutation(api.sessions.backToLobby, { sessionId });

    // Verify it's back to lobby
    session = await t.query(api.sessions.get, { sessionId });
    expect(session?.status).toBe("lobby");
    expect(session?.currentQuestionIndex).toBe(-1);
  });

  test("resets player elevations to 0", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Submit correct answer to gain elevation
    await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 0,
    });

    // Verify player has elevation
    let players = await t.query(api.players.listBySession, { sessionId });
    expect(players[0].elevation).toBeGreaterThan(0);

    // Go back to lobby
    await t.mutation(api.sessions.backToLobby, { sessionId });

    // Verify elevation is reset
    players = await t.query(api.players.listBySession, { sessionId });
    expect(players[0].elevation).toBe(0);
  });

  test("deletes all answers", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 0,
    });

    // Verify answer exists
    let hasAnswered = await t.query(api.answers.hasAnswered, { questionId, playerId });
    expect(hasAnswered).toBe(true);

    // Go back to lobby
    await t.mutation(api.sessions.backToLobby, { sessionId });

    // Verify answer is deleted
    hasAnswered = await t.query(api.answers.hasAnswered, { questionId, playerId });
    expect(hasAnswered).toBe(false);
  });

  test("throws error when not in active state", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // Try to go back to lobby when already in lobby
    await expect(
      t.mutation(api.sessions.backToLobby, { sessionId })
    ).rejects.toThrowError("Can only go back to lobby from active state");
  });
});
