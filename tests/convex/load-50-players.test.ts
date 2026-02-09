import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.ts");

/**
 * 50-PLAYER LOAD TEST
 *
 * This test simulates a real event with 50 concurrent players:
 * - Creates a session with 10 questions
 * - Joins 50 players with unique names
 * - Plays through 10 questions with:
 *   - Varied answer timing (fast, medium, slow)
 *   - Mix of correct and incorrect answers (~80% correct)
 *   - Different answer distributions to test minority bonus
 * - Validates leaderboard, scoring, and game state throughout
 * - Checks for any performance issues or race conditions
 */
describe("50-Player Concurrent Load Test", () => {
  /**
   * Helper to create a test session with N questions
   */
  async function createTestSession(
    t: ReturnType<typeof convexTest>,
    questionCount: number
  ) {
    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "load-test-host",
    });

    // Remove auto-created sample questions
    const existingQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of existingQuestions) {
      await t.mutation(api.questions.remove, { questionId: q._id, hostId: "load-test-host" });
    }

    // Add test questions with known correct answers
    for (let i = 0; i < questionCount; i++) {
      await t.mutation(api.questions.create, {
        sessionId,
        hostId: "load-test-host",
        text: `Load Test Question ${i + 1}: What is the best answer?`,
        options: [
          { text: "Option A" },
          { text: "Option B" },
          { text: "Option C" },
          { text: "Option D" },
        ],
        correctOptionIndex: i % 4, // Rotate correct answer across all options
        timeLimit: 30,
      });
    }

    return sessionId;
  }

  /**
   * Helper to join N players with unique names
   */
  async function joinPlayers(
    t: ReturnType<typeof convexTest>,
    sessionId: Id<"sessions">,
    count: number,
    namePrefix: string = "Player"
  ): Promise<Id<"players">[]> {
    const playerIds: Id<"players">[] = [];

    // Join players in parallel for realistic load
    const joinPromises = [];
    for (let i = 0; i < count; i++) {
      joinPromises.push(
        t.mutation(api.players.join, {
          sessionId,
          name: `${namePrefix}${i + 1}`,
        })
      );
    }

    const results = await Promise.all(joinPromises);
    playerIds.push(...results);

    return playerIds;
  }

  /**
   * Simulate varied answer timing patterns for realistic load
   */
  function getAnswerDelay(playerIndex: number): number {
    // Fast players (0-2s): 20%
    if (playerIndex % 5 === 0) return Math.random() * 2000;
    // Medium players (2-5s): 50%
    if (playerIndex % 5 < 4) return 2000 + Math.random() * 3000;
    // Slow players (5-10s): 30%
    return 5000 + Math.random() * 5000;
  }

  /**
   * Determine if player answers correctly (80% correct rate)
   */
  function shouldAnswerCorrectly(playerIndex: number): boolean {
    // Every 5th player gets it wrong (20% wrong rate)
    return playerIndex % 5 !== 0;
  }

  it("handles 50 concurrent players through 10 questions", async () => {
    const t = convexTest(schema, modules);
    const PLAYER_COUNT = 50;
    const QUESTION_COUNT = 10;

    console.log(`\n🎮 Starting 50-player load test with ${QUESTION_COUNT} questions...`);

    // Setup: Create session and join 50 players
    console.log("📝 Creating session...");
    const sessionId = await createTestSession(t, QUESTION_COUNT);

    console.log(`👥 Joining ${PLAYER_COUNT} players in parallel...`);
    const startJoin = Date.now();
    const playerIds = await joinPlayers(t, sessionId, PLAYER_COUNT);
    const joinDuration = Date.now() - startJoin;
    console.log(`✅ ${PLAYER_COUNT} players joined in ${joinDuration}ms (${(joinDuration / PLAYER_COUNT).toFixed(1)}ms per player)`);

    expect(playerIds.length).toBe(PLAYER_COUNT);

    // Verify all players are in the leaderboard
    let leaderboard = await t.query(api.players.getLeaderboard, { sessionId });
    expect(leaderboard.length).toBe(PLAYER_COUNT);

    // Start the game
    console.log("\n🚀 Starting game...");
    await t.mutation(api.sessions.start, { sessionId, hostId: "load-test-host" });

    let session = await t.query(api.sessions.get, { sessionId });
    expect(session?.status).toBe("active");
    expect(session?.questionPhase).toBe("pre_game");

    // Get all questions
    const questions = await t.query(api.questions.listBySession, { sessionId });
    const enabledQuestions = questions.filter((q) => q.enabled !== false);
    expect(enabledQuestions.length).toBe(QUESTION_COUNT);

    // Play through all questions
    for (let qIndex = 0; qIndex < enabledQuestions.length; qIndex++) {
      const question = enabledQuestions[qIndex]!;
      const correctIndex = question.correctOptionIndex ?? 0;

      console.log(`\n📋 Question ${qIndex + 1}/${QUESTION_COUNT}: "${question.text}"`);

      // Move to next question
      await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "load-test-host" });
      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("question_shown");

      // Show answers
      await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "load-test-host" });
      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("answers_shown");

      // Simulate 50 players answering with varied timing and accuracy
      console.log(`⏱️  Simulating ${PLAYER_COUNT} players answering...`);
      const startAnswers = Date.now();

      // Submit answers in parallel (simulating concurrent load)
      const answerPromises = playerIds.map((playerId, pIndex) => {
        const answerCorrectly = shouldAnswerCorrectly(pIndex);
        const optionIndex = answerCorrectly
          ? correctIndex
          : (correctIndex + 1 + (pIndex % 3)) % 4; // Spread wrong answers

        // Simulate realistic answer timing by adding a small delay
        const delay = getAnswerDelay(pIndex);

        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              t.mutation(api.answers.submit, {
                questionId: question._id,
                playerId,
                optionIndex,
              })
            );
          }, delay);
        });
      });

      await Promise.all(answerPromises);
      const answerDuration = Date.now() - startAnswers;
      console.log(`✅ All answers submitted in ${answerDuration}ms`);

      // Verify all players answered
      const results = await t.query(api.answers.getResults, {
        questionId: question._id,
      });
      expect(results?.totalAnswers).toBe(PLAYER_COUNT);

      // Log answer distribution
      const correctCount = results?.optionCounts[correctIndex] ?? 0;
      const wrongCount = PLAYER_COUNT - correctCount;
      console.log(`📊 Correct: ${correctCount}, Wrong: ${wrongCount} (${((correctCount / PLAYER_COUNT) * 100).toFixed(1)}% correct rate)`);

      // Check rope climbing state
      const ropeState = await t.query(api.answers.getRopeClimbingState, {
        sessionId,
      });
      expect(ropeState).not.toBeNull();
      expect(ropeState!.answeredCount).toBe(PLAYER_COUNT);
      expect(ropeState!.totalPlayers).toBe(PLAYER_COUNT);

      // Verify all ropes combined have all players
      const totalPlayersOnRopes = ropeState!.ropes.reduce(
        (sum, rope) => sum + rope.players.length,
        0
      );
      expect(totalPlayersOnRopes).toBe(PLAYER_COUNT);

      // Reveal answer
      console.log("🎯 Revealing answer...");
      await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "load-test-host" });
      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("revealed");

      // Show results
      await t.mutation(api.sessions.showResults, { sessionId, hostId: "load-test-host" });
      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("results");

      // Verify leaderboard is properly sorted
      leaderboard = await t.query(api.players.getLeaderboard, { sessionId });
      expect(leaderboard.length).toBe(PLAYER_COUNT);

      // Check leaderboard ordering (descending elevation)
      for (let i = 1; i < leaderboard.length; i++) {
        expect(leaderboard[i - 1]!.elevation).toBeGreaterThanOrEqual(
          leaderboard[i]!.elevation
        );
      }

      // Log top 5 and bottom 5
      console.log("🏆 Top 5:");
      for (let i = 0; i < Math.min(5, leaderboard.length); i++) {
        const player = leaderboard[i]!;
        console.log(`   ${i + 1}. ${player.name}: ${player.elevation}m`);
      }
      console.log("📉 Bottom 5:");
      for (let i = Math.max(0, leaderboard.length - 5); i < leaderboard.length; i++) {
        const player = leaderboard[i]!;
        console.log(`   ${i + 1}. ${player.name}: ${player.elevation}m`);
      }

      // Check that top player has positive elevation (unless all answered wrong)
      if (correctCount > 0) {
        expect(leaderboard[0]!.elevation).toBeGreaterThan(0);
      }
    }

    // Final verification
    console.log("\n🏁 Game complete! Final verification...");

    const finalLeaderboard = await t.query(api.players.getLeaderboard, {
      sessionId,
    });

    // Top player should have high elevation
    const topPlayer = finalLeaderboard[0]!;
    console.log(`\n🥇 Winner: ${topPlayer.name} with ${topPlayer.elevation}m`);
    expect(topPlayer.elevation).toBeGreaterThan(0);

    // Check that players who always answered correctly have higher elevation than those who didn't
    // Player1 (index 0) always answered wrong (every 5th)
    // Player2 (index 1) always answered correctly
    const player1 = finalLeaderboard.find((p) => p.name === "Player1");
    const player2 = finalLeaderboard.find((p) => p.name === "Player2");

    if (player1 && player2) {
      console.log(`Player1 (always wrong): ${player1.elevation}m`);
      console.log(`Player2 (always correct): ${player2.elevation}m`);
      expect(player2.elevation).toBeGreaterThan(player1.elevation);
    }

    // Check elevation distribution - should have variety based on performance
    const elevations = finalLeaderboard.map((p) => p.elevation);
    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);
    const avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length;

    console.log(`\n📊 Elevation Stats:`);
    console.log(`   Max: ${maxElevation}m`);
    console.log(`   Avg: ${avgElevation.toFixed(1)}m`);
    console.log(`   Min: ${minElevation}m`);
    console.log(`   Range: ${maxElevation - minElevation}m`);

    // Should have spread between top and bottom players
    expect(maxElevation).toBeGreaterThan(minElevation);

    // Count players at various elevations
    const summitPlayers = finalLeaderboard.filter((p) => p.elevation >= 1000).length;
    const highPlayers = finalLeaderboard.filter((p) => p.elevation >= 500 && p.elevation < 1000).length;
    const midPlayers = finalLeaderboard.filter((p) => p.elevation >= 100 && p.elevation < 500).length;
    const lowPlayers = finalLeaderboard.filter((p) => p.elevation < 100).length;

    console.log(`\n⛰️  Elevation Distribution:`);
    console.log(`   Summit (1000m): ${summitPlayers} players`);
    console.log(`   High (500-999m): ${highPlayers} players`);
    console.log(`   Mid (100-499m): ${midPlayers} players`);
    console.log(`   Low (0-99m): ${lowPlayers} players`);

    // Verify bonus elevation is tracked correctly (players can exceed 1000m for bonus meters)
    // Players who summit should have summitPlace assigned
    const summitersWithPlace = finalLeaderboard.filter(p => p.elevation >= 1000 && p.summitPlace);
    console.log(`   Summiters with place assigned: ${summitersWithPlace.length}`);

    // All summiters should have a summit place
    for (const player of finalLeaderboard) {
      if (player.elevation >= 1000) {
        expect(player.summitPlace).toBeDefined();
      }
    }

    console.log("\n✅ 50-player load test completed successfully!");
  }, 120000); // 2 minute timeout for this comprehensive test

  it("handles concurrent player joins without race conditions", async () => {
    const t = convexTest(schema, modules);
    const sessionId = await createTestSession(t, 5);

    console.log("\n🔄 Testing concurrent joins for race conditions...");

    // Try to join 50 players simultaneously
    const startTime = Date.now();
    const joinPromises = Array.from({ length: 50 }, (_, i) =>
      t.mutation(api.players.join, {
        sessionId,
        name: `ConcurrentPlayer${i + 1}`,
      })
    );

    const playerIds = await Promise.all(joinPromises);
    const duration = Date.now() - startTime;

    console.log(`✅ 50 concurrent joins completed in ${duration}ms`);
    console.log(`   Average: ${(duration / 50).toFixed(1)}ms per join`);

    // Verify all joins succeeded and we have unique player IDs
    expect(playerIds.length).toBe(50);
    const uniqueIds = new Set(playerIds);
    expect(uniqueIds.size).toBe(50); // No duplicate IDs

    // Verify all players are in database
    const leaderboard = await t.query(api.players.getLeaderboard, { sessionId });
    expect(leaderboard.length).toBe(50);

    // Verify all names are unique
    const names = leaderboard.map((p) => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(50);
  });

  it("rejects duplicate names during concurrent joins", async () => {
    const t = convexTest(schema, modules);
    const sessionId = await createTestSession(t, 5);

    console.log("\n🚫 Testing duplicate name rejection...");

    // Try to join multiple players with the same name concurrently
    const joinPromises = Array.from({ length: 10 }, () =>
      t.mutation(api.players.join, {
        sessionId,
        name: "DuplicateName",
      })
    );

    // Should have some failures due to duplicate names
    const results = await Promise.allSettled(joinPromises);
    const successful = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    console.log(`   Successful: ${successful.length}`);
    console.log(`   Failed: ${failed.length}`);

    // Only one should succeed (the first one)
    expect(successful.length).toBe(1);
    expect(failed.length).toBe(9);

    // Verify the error messages
    for (const result of failed) {
      if (result.status === "rejected") {
        expect(result.reason.message).toContain("Name already taken");
      }
    }
  });

  it("maintains correct answer counts with concurrent submissions", async () => {
    const t = convexTest(schema, modules);
    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 50);

    await t.mutation(api.sessions.start, { sessionId, hostId: "load-test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "load-test-host" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "load-test-host" });

    const questions = await t.query(api.questions.listBySession, { sessionId });
    const question = questions[0]!;

    console.log("\n📝 Testing concurrent answer submissions...");
    const startTime = Date.now();

    // All 50 players answer simultaneously
    const answerPromises = playerIds.map((playerId, index) =>
      t.mutation(api.answers.submit, {
        questionId: question._id,
        playerId,
        optionIndex: index % 4, // Distribute across all options
      })
    );

    await Promise.all(answerPromises);
    const duration = Date.now() - startTime;

    console.log(`✅ 50 concurrent answers submitted in ${duration}ms`);

    // Verify answer counts are correct
    const results = await t.query(api.answers.getResults, {
      questionId: question._id,
    });

    expect(results?.totalAnswers).toBe(50);

    // Check distribution (should be roughly 12-13 per option)
    const expectedPerOption = 50 / 4;
    for (let i = 0; i < 4; i++) {
      const count = results?.optionCounts[i] ?? 0;
      expect(count).toBeGreaterThanOrEqual(expectedPerOption - 1);
      expect(count).toBeLessThanOrEqual(expectedPerOption + 1);
    }

    console.log(`   Distribution: ${results?.optionCounts.join(", ")}`);
  });

  it("prevents duplicate answers from same player with concurrent submissions", async () => {
    const t = convexTest(schema, modules);
    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 1);
    const playerId = playerIds[0]!;

    await t.mutation(api.sessions.start, { sessionId, hostId: "load-test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "load-test-host" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "load-test-host" });

    const questions = await t.query(api.questions.listBySession, { sessionId });
    const question = questions[0]!;

    console.log("\n🔒 Testing duplicate answer prevention...");

    // Try to submit 10 answers simultaneously from the same player
    const submitPromises = Array.from({ length: 10 }, () =>
      t.mutation(api.answers.submit, {
        questionId: question._id,
        playerId,
        optionIndex: 0,
      })
    );

    const results = await Promise.allSettled(submitPromises);
    const successful = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    console.log(`   Successful: ${successful.length}`);
    console.log(`   Failed: ${failed.length}`);

    // Only one should succeed
    expect(successful.length).toBe(1);
    expect(failed.length).toBe(9);

    // Verify only one answer is recorded
    const answerResults = await t.query(api.answers.getResults, {
      questionId: question._id,
    });
    expect(answerResults?.totalAnswers).toBe(1);
  });
});
