import { convexTest } from "convex-test";
import { expect, test, describe, vi, beforeEach, afterEach } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { PRESENCE_TIMEOUT_MS } from "../../lib/constants";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("players.join", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("creates a new player with initial elevation and lastSeenAt", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    const player = await t.query(api.players.get, { playerId });

    expect(player).not.toBeNull();
    expect(player?.name).toBe("TestPlayer");
    expect(player?.elevation).toBe(0);
    expect(player?.lastSeenAt).toBeDefined();
  });

  test("rejects duplicate name when existing player is active", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // First player joins
    await t.mutation(api.players.join, {
      sessionId,
      name: "Tim",
    });

    // Second player with same name should be rejected
    await expect(
      t.mutation(api.players.join, {
        sessionId,
        name: "Tim",
      })
    ).rejects.toThrowError("Name already taken in this session");
  });

  test("allows rejoin with same name when previous player is inactive (no heartbeat)", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // First player joins
    const playerId1 = await t.mutation(api.players.join, {
      sessionId,
      name: "Tim",
    });

    // Advance time past the presence timeout
    vi.advanceTimersByTime(PRESENCE_TIMEOUT_MS + 1000);

    // Same name can now rejoin (reactivates the old player)
    const playerId2 = await t.mutation(api.players.join, {
      sessionId,
      name: "Tim",
    });

    // Should return the same player ID (reactivation, not new player)
    expect(playerId2).toBe(playerId1);

    // Player should be active again with updated lastSeenAt
    const player = await t.query(api.players.get, { playerId: playerId2 });
    expect(player?.lastSeenAt).toBeDefined();
  });

  test("allows rejoin with same name when previous player explicitly disconnected", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // First player joins
    const playerId1 = await t.mutation(api.players.join, {
      sessionId,
      name: "Tim",
    });

    // Player explicitly disconnects (sets lastSeenAt to 0)
    await t.mutation(api.players.disconnect, { playerId: playerId1 });

    // Same name can now rejoin immediately (no need to wait for timeout)
    const playerId2 = await t.mutation(api.players.join, {
      sessionId,
      name: "Tim",
    });

    // Should return the same player ID (reactivation)
    expect(playerId2).toBe(playerId1);
  });

  test("preserves elevation when rejoining", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // First player joins
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "Tim",
    });

    // Give player some elevation
    await t.mutation(api.players.addElevation, {
      playerId,
      meters: 150,
    });

    // Player disconnects
    await t.mutation(api.players.disconnect, { playerId });

    // Same player rejoins
    const rejoinedPlayerId = await t.mutation(api.players.join, {
      sessionId,
      name: "Tim",
    });

    // Should have preserved elevation
    const player = await t.query(api.players.get, { playerId: rejoinedPlayerId });
    expect(player?.elevation).toBe(150);
  });

  test("trims whitespace from player name", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "  Tim  ",
    });

    const player = await t.query(api.players.get, { playerId });
    expect(player?.name).toBe("Tim");
  });

  test("prevents join when session is finished", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // Add a question so we can start the session
    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "host-1",
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Start and finish the session
    await t.mutation(api.sessions.start, { sessionId, hostId: "host-1" });
    await t.mutation(api.sessions.finish, { sessionId, hostId: "host-1" });

    // Try to join - should fail
    await expect(
      t.mutation(api.players.join, {
        sessionId,
        name: "Tim",
      })
    ).rejects.toThrowError("Game has ended");
  });
});

describe("players.heartbeat", () => {
  test("updates lastSeenAt timestamp", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    const playerBefore = await t.query(api.players.get, { playerId });
    const initialLastSeen = playerBefore?.lastSeenAt;

    // Wait a bit and send heartbeat
    await new Promise((resolve) => setTimeout(resolve, 10));
    await t.mutation(api.players.heartbeat, { playerId });

    const playerAfter = await t.query(api.players.get, { playerId });

    expect(playerAfter?.lastSeenAt).toBeGreaterThanOrEqual(initialLastSeen ?? 0);
  });
});

describe("players.disconnect", () => {
  test("sets lastSeenAt to 0 for immediate inactive status", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.players.disconnect, { playerId });

    const player = await t.query(api.players.get, { playerId });
    expect(player?.lastSeenAt).toBe(0);
  });
});

describe("players.kick", () => {
  test("removes player from session completely", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    // Verify player exists
    const playerBefore = await t.query(api.players.get, { playerId });
    expect(playerBefore).not.toBeNull();

    // Kick the player
    await t.mutation(api.players.kick, { playerId, hostId: "host-1" });

    // Player should no longer exist
    const playerAfter = await t.query(api.players.get, { playerId });
    expect(playerAfter).toBeNull();
  });

  test("deletes player answers when kicked", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    // Create a question and answer it
    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "host-1",
      text: "Test question?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Start session and show answers
    await t.mutation(api.sessions.start, { sessionId, hostId: "host-1" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "host-1" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "host-1" });

    // Submit answer
    await t.mutation(api.answers.submit, {
      playerId,
      questionId,
      optionIndex: 0,
    });

    // Verify answer exists
    const answersBefore = await t.query(api.answers.getByQuestion, { questionId });
    expect(answersBefore.length).toBe(1);

    // Kick the player
    await t.mutation(api.players.kick, { playerId, hostId: "host-1" });

    // Player's answers should be deleted
    const answersAfter = await t.query(api.answers.getByQuestion, { questionId });
    expect(answersAfter.length).toBe(0);
  });

  test("throws error when trying to kick non-existent player", async () => {
    const t = convexTest(schema, modules);

    // Create a session just to get a valid session ID format
    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    // Kick the player first
    await t.mutation(api.players.kick, { playerId, hostId: "host-1" });

    // Try to kick again - should fail
    await expect(
      t.mutation(api.players.kick, { playerId, hostId: "host-1" })
    ).rejects.toThrowError("Player not found");
  });

  test("removes player from leaderboard after kick", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, { hostId: "host-1" });

    // Join two players
    const player1Id = await t.mutation(api.players.join, {
      sessionId,
      name: "Player1",
    });
    const player2Id = await t.mutation(api.players.join, {
      sessionId,
      name: "Player2",
    });

    // Give them different elevations
    await t.mutation(api.players.addElevation, { playerId: player1Id, meters: 100 });
    await t.mutation(api.players.addElevation, { playerId: player2Id, meters: 50 });

    // Verify both are in leaderboard
    const leaderboardBefore = await t.query(api.players.getLeaderboard, { sessionId });
    expect(leaderboardBefore.length).toBe(2);

    // Kick player1
    await t.mutation(api.players.kick, { playerId: player1Id, hostId: "host-1" });

    // Leaderboard should only have player2
    const leaderboardAfter = await t.query(api.players.getLeaderboard, { sessionId });
    expect(leaderboardAfter.length).toBe(1);
    expect(leaderboardAfter[0].name).toBe("Player2");
  });
});
