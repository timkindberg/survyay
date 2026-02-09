import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("Full Session Integration", () => {
  /**
   * Helper to create a session with N questions (using custom questions, not sample ones)
   */
  async function createTestSession(
    t: ReturnType<typeof convexTest>,
    questionCount: number
  ) {
    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Remove the auto-created sample questions
    const existingQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of existingQuestions) {
      await t.mutation(api.questions.remove, { questionId: q._id, hostId: "test-host" });
    }

    // Add custom questions with known correct answers
    for (let i = 0; i < questionCount; i++) {
      await t.mutation(api.questions.create, {
        sessionId,
        hostId: "test-host",
        text: `Question ${i + 1}`,
        options: [
          { text: "Option A" },
          { text: "Option B" },
          { text: "Option C" },
          { text: "Option D" },
        ],
        correctOptionIndex: i % 4, // Rotate correct answer
        timeLimit: 30,
      });
    }

    return sessionId;
  }

  /**
   * Helper to join N players to a session
   */
  async function joinPlayers(
    t: ReturnType<typeof convexTest>,
    sessionId: Id<"sessions">,
    count: number
  ) {
    const playerIds: Id<"players">[] = [];
    for (let i = 0; i < count; i++) {
      const id = await t.mutation(api.players.join, {
        sessionId,
        name: `Player${i + 1}`,
      });
      playerIds.push(id);
    }
    return playerIds;
  }

  it("completes a full 10-question session with 20 players", async () => {
    const t = convexTest(schema, modules);

    // Setup
    const sessionId = await createTestSession(t, 10);
    const playerIds = await joinPlayers(t, sessionId, 20);

    // Start game (goes to pre_game phase)
    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    let session = await t.query(api.sessions.get, { sessionId });
    expect(session?.status).toBe("active");
    expect(session?.questionPhase).toBe("pre_game");

    // Move to first question
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });

    session = await t.query(api.sessions.get, { sessionId });
    expect(session?.questionPhase).toBe("question_shown");

    // Get questions
    const questions = await t.query(api.questions.listBySession, { sessionId });
    const enabledQuestions = questions.filter((q) => q.enabled !== false);

    expect(enabledQuestions.length).toBe(10);

    // Play through all questions
    for (let qIndex = 0; qIndex < enabledQuestions.length; qIndex++) {
      const question = enabledQuestions[qIndex]!;
      const correctIndex = question.correctOptionIndex ?? 0;

      // Show answers (transition from question_shown to answers_shown)
      await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

      // Verify phase transitioned
      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("answers_shown");

      // Simulate players answering
      for (let pIndex = 0; pIndex < playerIds.length; pIndex++) {
        const playerId = playerIds[pIndex]!;
        // 80% answer correctly, 20% wrong (every 5th player gets it wrong)
        const answerCorrectly = pIndex % 5 !== 0;
        const optionIndex = answerCorrectly
          ? correctIndex
          : (correctIndex + 1) % 4;

        await t.mutation(api.answers.submit, {
          questionId: question._id,
          playerId,
          optionIndex,
        });
      }

      // Verify all players have answered
      const results = await t.query(api.answers.getResults, {
        questionId: question._id,
      });
      expect(results?.totalAnswers).toBe(20);

      // Reveal answer
      await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("revealed");

      // Show results
      await t.mutation(api.sessions.showResults, { sessionId, hostId: "test-host" });

      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("results");

      // Verify leaderboard is sorted
      const leaderboard = await t.query(api.players.getLeaderboard, {
        sessionId,
      });
      for (let i = 1; i < leaderboard.length; i++) {
        expect(leaderboard[i - 1]!.elevation).toBeGreaterThanOrEqual(
          leaderboard[i]!.elevation
        );
      }

      // Next question (if not last)
      if (qIndex < enabledQuestions.length - 1) {
        const nextResult = await t.mutation(api.sessions.nextQuestion, {
          sessionId, hostId: "test-host",
        });
        expect(nextResult.finished).toBe(false);

        // Verify phase reset to question_shown
        session = await t.query(api.sessions.get, { sessionId });
        expect(session?.questionPhase).toBe("question_shown");
        expect(session?.currentQuestionIndex).toBe(qIndex + 1);
      }
    }

    // Final verification
    const finalLeaderboard = await t.query(api.players.getLeaderboard, {
      sessionId,
    });

    // Top player should have gained elevation (10 questions * up to 100m each)
    expect(finalLeaderboard[0]!.elevation).toBeGreaterThan(0);

    // Players who always got it right (pIndex % 5 !== 0) should have higher elevation
    // than players who always got it wrong (pIndex % 5 === 0)
    // Player1 (index 0) always got it wrong, Player2 (index 1) always got it right
    const player1 = finalLeaderboard.find(
      (p) => p._id === playerIds[0]
    );
    const player2 = finalLeaderboard.find(
      (p) => p._id === playerIds[1]
    );

    expect(player1!.elevation).toBe(0); // Always wrong = 0 elevation
    expect(player2!.elevation).toBeGreaterThan(0); // Always right = positive elevation

    // All correct-answerers should have the same elevation (they answered at same speed in tests)
    const correctAnswerers = finalLeaderboard.filter((p) => {
      const idx = playerIds.indexOf(p._id);
      return idx % 5 !== 0;
    });

    // All correct answerers should have elevation >= 1000 (summit reached, can exceed for bonus)
    // With 125m per question * 10 questions, they get 1250m
    for (const player of correctAnswerers) {
      expect(player.elevation).toBeGreaterThanOrEqual(1000); // Summit reached!
    }
  });

  it("rejects answers in wrong phase (question_shown)", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question

    // Session is in question_shown phase (answers not shown yet)
    const session = await t.query(api.sessions.get, { sessionId });
    expect(session?.questionPhase).toBe("question_shown");

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Try to answer before showAnswers - should fail
    await expect(
      t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId: playerIds[0]!,
        optionIndex: 0,
      })
    ).rejects.toThrow("Answers are not being accepted right now");
  });

  it("rejects answers after reveal phase", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // First player answers
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: 0,
    });

    // Host reveals answer
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Second player tries to answer after reveal - should fail
    await expect(
      t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId: playerIds[1]!,
        optionIndex: 0,
      })
    ).rejects.toThrow("Answers are not being accepted right now");
  });

  it("handles player answering twice (duplicate prevention)", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 1);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // First answer should succeed
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: 0,
    });

    // Second answer should fail
    await expect(
      t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId: playerIds[0]!,
        optionIndex: 1,
      })
    ).rejects.toThrow("Already answered this question");
  });

  it("calculates elevation correctly for fast vs slow answers", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    const questions = await t.query(api.questions.listBySession, { sessionId });
    const correctIndex = questions[0]!.correctOptionIndex!;

    // Both players answer correctly
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: correctIndex,
    });

    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[1]!,
      optionIndex: correctIndex,
    });

    // Reveal to calculate scores
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Check player elevations
    const p1 = await t.query(api.players.get, { playerId: playerIds[0]! });
    const p2 = await t.query(api.players.get, { playerId: playerIds[1]! });

    // With 1 question and 75% threshold: base = 1000 / (1 * 0.75) = 1333m
    // First player gets base + speed bonus (top 20% of 2 = 1 player gets bonus)
    expect(p1?.elevation).toBeGreaterThan(1000);

    // Second player gets base only (no bonus since they're not in top 20%)
    // With 2 players, only 1 (top 20% = 0.4, ceiling = 1) gets bonus
    expect(p2?.elevation).toBeGreaterThan(1000);
    expect(p2?.elevation).toBeLessThanOrEqual(p1?.elevation ?? 0);
  });

  it("wrong answers give zero elevation gain", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 1);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    const questions = await t.query(api.questions.listBySession, { sessionId });
    const correctIndex = questions[0]!.correctOptionIndex!;
    const wrongIndex = (correctIndex + 1) % 4;

    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: wrongIndex,
    });

    // Reveal to calculate scores
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Check player elevation - should still be 0
    const player = await t.query(api.players.get, { playerId: playerIds[0]! });
    expect(player?.elevation).toBe(0);
  });

  it("maintains leaderboard sorting throughout game", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 5);
    const playerIds = await joinPlayers(t, sessionId, 10);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question

    const questions = await t.query(api.questions.listBySession, { sessionId });

    for (let qIndex = 0; qIndex < questions.length; qIndex++) {
      const question = questions[qIndex]!;
      const correctIndex = question.correctOptionIndex ?? 0;

      await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

      // Different players answer correctly/incorrectly to create variety
      for (let pIndex = 0; pIndex < playerIds.length; pIndex++) {
        const playerId = playerIds[pIndex]!;
        // Varying correct answer rates
        const answerCorrectly = pIndex > qIndex; // More players get it right on earlier questions
        const optionIndex = answerCorrectly
          ? correctIndex
          : (correctIndex + 1) % 4;

        await t.mutation(api.answers.submit, {
          questionId: question._id,
          playerId,
          optionIndex,
        });
      }

      await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });
      await t.mutation(api.sessions.showResults, { sessionId, hostId: "test-host" });

      // Verify leaderboard is properly sorted after each question
      const leaderboard = await t.query(api.players.getLeaderboard, {
        sessionId,
      });
      for (let i = 1; i < leaderboard.length; i++) {
        expect(leaderboard[i - 1]!.elevation).toBeGreaterThanOrEqual(
          leaderboard[i]!.elevation
        );
      }

      if (qIndex < questions.length - 1) {
        await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
      }
    }
  });

  it("poll mode (no correct answer) gives participation elevation", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Remove sample questions
    const existingQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of existingQuestions) {
      await t.mutation(api.questions.remove, { questionId: q._id, hostId: "test-host" });
    }

    // Create a poll question (no correctOptionIndex)
    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "What's your favorite color?",
      options: [{ text: "Red" }, { text: "Blue" }, { text: "Green" }],
      // No correctOptionIndex = poll mode
      timeLimit: 30,
    });

    const playerIds = await joinPlayers(t, sessionId, 3);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // All players answer different options
    for (let i = 0; i < playerIds.length; i++) {
      await t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId: playerIds[i]!,
        optionIndex: i,
      });
    }

    // Reveal to calculate scores
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Check player elevations - poll mode treats all as correct, first gets 100m
    // In poll mode, all answers are "correct" so they all get elevation
    for (const playerId of playerIds) {
      const player = await t.query(api.players.get, { playerId });
      expect(player?.elevation).toBeGreaterThan(0); // All get participation elevation
    }
  });

  it("session finishes after last question", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 2);
    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Play through both questions
    for (let i = 0; i < questions.length; i++) {
      await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

      for (const playerId of playerIds) {
        await t.mutation(api.answers.submit, {
          questionId: questions[i]!._id,
          playerId,
          optionIndex: 0,
        });
      }

      await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });
      await t.mutation(api.sessions.showResults, { sessionId, hostId: "test-host" });

      if (i < questions.length - 1) {
        const result = await t.mutation(api.sessions.nextQuestion, {
          sessionId, hostId: "test-host",
        });
        expect(result.finished).toBe(false);
      }
    }

    // Final nextQuestion should finish the session
    const finalResult = await t.mutation(api.sessions.nextQuestion, {
      sessionId, hostId: "test-host",
    });
    expect(finalResult.finished).toBe(true);

    const session = await t.query(api.sessions.get, { sessionId });
    expect(session?.status).toBe("finished");
  });

  it("players can join mid-game", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 3);

    // Initial players join in lobby
    const initialPlayers = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Play first question
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });
    for (const playerId of initialPlayers) {
      await t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId,
        optionIndex: questions[0]!.correctOptionIndex!,
      });
    }
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.showResults, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });

    // New player joins mid-game (during question 2)
    const lateJoiner = await t.mutation(api.players.join, {
      sessionId,
      name: "LateJoiner",
    });

    // Late joiner should start at 0 elevation
    let player = await t.query(api.players.get, { playerId: lateJoiner });
    expect(player?.elevation).toBe(0);

    // Late joiner can answer current question
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });
    await t.mutation(api.answers.submit, {
      questionId: questions[1]!._id,
      playerId: lateJoiner,
      optionIndex: questions[1]!.correctOptionIndex!,
    });

    // Reveal to calculate scores
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Late joiner should have gained elevation
    player = await t.query(api.players.get, { playerId: lateJoiner });
    expect(player?.elevation).toBeGreaterThan(0);
  });

  it("backToLobby resets all game state", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 3);
    const playerIds = await joinPlayers(t, sessionId, 3);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Play first question
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });
    for (const playerId of playerIds) {
      await t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId,
        optionIndex: questions[0]!.correctOptionIndex!,
      });
    }

    // Reveal to calculate scores
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Verify players have elevation
    let leaderboard = await t.query(api.players.getLeaderboard, { sessionId });
    expect(leaderboard[0]!.elevation).toBeGreaterThan(0);

    // Go back to lobby
    await t.mutation(api.sessions.backToLobby, { sessionId, hostId: "test-host" });

    // Verify session state reset
    const session = await t.query(api.sessions.get, { sessionId });
    expect(session?.status).toBe("lobby");
    expect(session?.currentQuestionIndex).toBe(-1);
    expect(session?.questionPhase).toBeUndefined();

    // Verify player elevations reset
    leaderboard = await t.query(api.players.getLeaderboard, { sessionId });
    for (const player of leaderboard) {
      expect(player.elevation).toBe(0);
    }

    // Verify answers deleted
    for (const question of questions) {
      const hasAnswered = await t.query(api.answers.hasAnswered, {
        questionId: question._id,
        playerId: playerIds[0]!,
      });
      expect(hasAnswered).toBe(false);
    }
  });

  it("getRopeClimbingState returns correct data during gameplay", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 2);
    const playerIds = await joinPlayers(t, sessionId, 4);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    // In pre_game, state should be null (no current question yet)
    let state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state).toBeNull();

    // Move to first question
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });

    // Now state should exist and show question_shown phase
    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state).not.toBeNull();
    expect(state!.questionPhase).toBe("question_shown");
    expect(state!.totalPlayers).toBe(4);
    expect(state!.answeredCount).toBe(0);

    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.questionPhase).toBe("answers_shown");
    expect(state!.timing.isRevealed).toBe(false);

    const questions = await t.query(api.questions.listBySession, { sessionId });
    const correctIndex = questions[0]!.correctOptionIndex!;

    // Players 0 and 1 answer correctly, players 2 and 3 answer wrong
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: correctIndex,
    });
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[1]!,
      optionIndex: correctIndex,
    });
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[2]!,
      optionIndex: (correctIndex + 1) % 4,
    });
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[3]!,
      optionIndex: (correctIndex + 2) % 4,
    });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.answeredCount).toBe(4);
    expect(state!.notAnswered.length).toBe(0);

    // Check rope distribution
    const correctRope = state!.ropes.find((r) => r.optionIndex === correctIndex);
    expect(correctRope!.players.length).toBe(2);
    expect(correctRope!.isCorrect).toBe(true);

    // Reveal
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.questionPhase).toBe("revealed");
    expect(state!.timing.isRevealed).toBe(true);
  });

  it("handles session with disabled questions", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 5);

    // Get all questions
    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Disable questions 2 and 4 (0-indexed)
    await t.mutation(api.questions.setEnabled, {
      questionId: questions[1]!._id,
      hostId: "test-host",
      enabled: false,
    });
    await t.mutation(api.questions.setEnabled, {
      questionId: questions[3]!._id,
      hostId: "test-host",
      enabled: false,
    });

    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question

    // Should only need to play through 3 questions (0, 2, 4)
    let questionCount = 0;
    let session = await t.query(api.sessions.get, { sessionId });

    while (session?.status === "active") {
      questionCount++;

      await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

      // Get current question
      const currentQuestion = await t.query(api.questions.getCurrentQuestion, {
        sessionId,
      });

      // Answer it
      for (const playerId of playerIds) {
        await t.mutation(api.answers.submit, {
          questionId: currentQuestion!._id,
          playerId,
          optionIndex: 0,
        });
      }

      await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });
      await t.mutation(api.sessions.showResults, { sessionId, hostId: "test-host" });
      await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });

      session = await t.query(api.sessions.get, { sessionId });
    }

    // Only 3 enabled questions were played
    expect(questionCount).toBe(3);
    expect(session?.status).toBe("finished");
  });

  it("elevation can exceed summit for bonus (no longer capped)", async () => {
    const t = convexTest(schema, modules);

    // Create enough questions to exceed summit
    // Use 10 questions (default) which gives higher scaling per question
    const sessionId = await createTestSession(t, 10);
    // Add multiple players so our star player gets minority bonus
    const playerIds = await joinPlayers(t, sessionId, 5);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Track elevations to verify progress
    let previousElevation = 0;
    let hasSummited = false;

    // Answer all questions correctly
    for (let i = 0; i < questions.length; i++) {
      await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

      // Player 0 answers correctly, others answer wrong
      // This gives player 0 a minority bonus (1/5 = 80% alone ratio)
      await t.mutation(api.answers.submit, {
        questionId: questions[i]!._id,
        playerId: playerIds[0]!,
        optionIndex: questions[i]!.correctOptionIndex!,
      });

      // Other players answer wrong to give minority bonus
      const wrongIndex = (questions[i]!.correctOptionIndex! + 1) % questions[i]!.options.length;
      for (let j = 1; j < playerIds.length; j++) {
        await t.mutation(api.answers.submit, {
          questionId: questions[i]!._id,
          playerId: playerIds[j]!,
          optionIndex: wrongIndex,
        });
      }

      await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

      // Check elevation after reveal
      const player = await t.query(api.players.get, { playerId: playerIds[0]! });

      // Each correct answer should increase elevation (even above summit)
      expect(player?.elevation).toBeGreaterThanOrEqual(previousElevation);

      // Track when we first cross summit
      if (!hasSummited && player!.elevation >= 1000) {
        hasSummited = true;
        // Should have summit placement now
        expect(player?.summitPlace).toBe(1);
      }

      previousElevation = player?.elevation ?? 0;

      await t.mutation(api.sessions.showResults, { sessionId, hostId: "test-host" });

      if (i < questions.length - 1) {
        await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
      }
    }

    // Final elevation should EXCEED 1000 (no longer capped)
    const player = await t.query(api.players.get, { playerId: playerIds[0]! });
    // With 10 questions, scaled scoring, and minority bonus:
    // maxPerQuestion = 1000 / 7.5 = 133.3m
    // With minority bonus (1/5 players = 80% alone), total can reach ~129m per question
    // 10 * 129 = 1290m potential
    expect(player?.elevation).toBeGreaterThanOrEqual(1000);
    expect(player?.summitPlace).toBe(1); // First to summit
  });

  it("enforces correct phase transition order", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    await joinPlayers(t, sessionId, 1);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question

    // Can't reveal before showing answers
    await expect(
      t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" })
    ).rejects.toThrow("Can only reveal from answers_shown phase");

    // Can't show results before revealing
    await expect(
      t.mutation(api.sessions.showResults, { sessionId, hostId: "test-host" })
    ).rejects.toThrow("Can only show results from revealed phase");

    // Correct order works
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    // Can't show answers again
    await expect(
      t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" })
    ).rejects.toThrow("Can only show answers from question_shown phase");

    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Can't reveal again
    await expect(
      t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" })
    ).rejects.toThrow("Can only reveal from answers_shown phase");

    await t.mutation(api.sessions.showResults, { sessionId, hostId: "test-host" });

    // Can't show results again
    await expect(
      t.mutation(api.sessions.showResults, { sessionId, hostId: "test-host" })
    ).rejects.toThrow("Can only show results from revealed phase");
  });

  it("prevents joining finished sessions", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    await joinPlayers(t, sessionId, 1);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.finish, { sessionId, hostId: "test-host" });

    // Try to join finished session
    await expect(
      t.mutation(api.players.join, {
        sessionId,
        name: "LateComer",
      })
    ).rejects.toThrow("Game has ended");
  });

  it("prevents duplicate player names in same session", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);

    await t.mutation(api.players.join, {
      sessionId,
      name: "Alice",
    });

    // Try to join with same name
    await expect(
      t.mutation(api.players.join, {
        sessionId,
        name: "Alice",
      })
    ).rejects.toThrow("Name already taken in this session");
  });

  it("tracks answer timing info correctly", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 3);

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" }); // Move to first question
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Before any answers
    let timingInfo = await t.query(api.answers.getTimingInfo, {
      questionId: questions[0]!._id,
    });
    expect(timingInfo?.firstAnsweredAt).toBeNull();
    expect(timingInfo?.totalAnswers).toBe(0);

    // First answer
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: 0,
    });

    timingInfo = await t.query(api.answers.getTimingInfo, {
      questionId: questions[0]!._id,
    });
    expect(timingInfo?.firstAnsweredAt).not.toBeNull();
    expect(timingInfo?.totalAnswers).toBe(1);

    const firstAnsweredAt = timingInfo!.firstAnsweredAt;

    // More answers
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[1]!,
      optionIndex: 1,
    });
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[2]!,
      optionIndex: 2,
    });

    timingInfo = await t.query(api.answers.getTimingInfo, {
      questionId: questions[0]!._id,
    });
    // firstAnsweredAt should remain the same
    expect(timingInfo?.firstAnsweredAt).toBe(firstAnsweredAt);
    expect(timingInfo?.totalAnswers).toBe(3);
  });
});
