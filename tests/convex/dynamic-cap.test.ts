import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("dynamic elevation cap (rubber-banding)", () => {
  test("applies dynamic cap and scaled scoring to prevent early summiting", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    // Create 3 questions total
    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 2",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q3 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 3",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Add 2 players
    const p1 = await t.mutation(api.players.join, {
      sessionId,
      name: "Alice",
    });
    const p2 = await t.mutation(api.players.join, {
      sessionId,
      name: "Bob",
    });

    await t.mutation(api.sessions.start, { sessionId });

    // Q1: Both answer instantly and correctly
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p1,
      optionIndex: 0,
    });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p2,
      optionIndex: 0,
    });

    // Reveal Q1: Scoring is scaled for 3 questions (max ~444m per question)
    // But dynamic cap: leader at 0, 2 questions remaining -> (1000-0)/2 = 500m (boost!)
    // Both get their scaled score (under the cap)
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    let alice = await t.run(async (ctx) => await ctx.db.get(p1));
    let bob = await t.run(async (ctx) => await ctx.db.get(p2));

    // With 3 questions, scaled base score is around 317m for instant answer
    // Both should get meaningful elevation
    expect(alice!.elevation).toBeGreaterThan(0);
    expect(bob!.elevation).toBeGreaterThan(0);
    expect(bob!.elevation).toBeLessThanOrEqual(alice!.elevation);

    const aliceQ1Elevation = alice!.elevation;

    // Dynamic cap boosted to 909m because (1000-0)/(2*0.55) = 909 > 175
    const question1 = await t.run(async (ctx) => await ctx.db.get(q1));
    expect(question1!.dynamicMaxElevation).toBe(909);

    // Q2: Only Alice answers correctly (and fast)
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q2,
      playerId: p1,
      optionIndex: 0, // Correct
    });
    await t.mutation(api.answers.submit, {
      questionId: q2,
      playerId: p2,
      optionIndex: 1, // Wrong
    });

    // Reveal Q2: Alice gets scaled score + minority bonus
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    alice = await t.run(async (ctx) => await ctx.db.get(p1));
    bob = await t.run(async (ctx) => await ctx.db.get(p2));

    // Alice should have gained more elevation
    expect(alice!.elevation).toBeGreaterThan(aliceQ1Elevation);
    // Bob stays at previous elevation (wrong answer)
    expect(bob!.elevation).toBeLessThanOrEqual(aliceQ1Elevation);

    const question2 = await t.run(async (ctx) => await ctx.db.get(q2));
    // Dynamic cap should be a boost based on leader position
    expect(question2!.dynamicMaxElevation).toBeGreaterThanOrEqual(175);
  });

  test("summit placement and bonus elevation tracking", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    // Create 2 questions
    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q2",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Manually set player to 900m to simulate late game
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    // Manually boost player to 900m
    await t.run(async (ctx) => {
      await ctx.db.patch(playerId, { elevation: 900 });
    });

    await t.mutation(api.sessions.start, { sessionId });

    // Q1: Player answers correctly and fast
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId,
      optionIndex: 0,
    });

    // Reveal: Player gets scaled score
    // Dynamic cap is 175m floor (or boost if needed)
    // After Q1: 900 + gain = above summit!
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    let player = await t.run(async (ctx) => await ctx.db.get(playerId));
    expect(player!.elevation).toBeGreaterThanOrEqual(1000); // Above summit
    expect(player!.summitPlace).toBe(1); // First to summit
    expect(player!.summitElevation).toBe(player!.elevation); // Elevation when summited

    const q1Elevation = player!.elevation;

    const question1 = await t.run(async (ctx) => await ctx.db.get(q1));
    expect(question1!.dynamicMaxElevation).toBeGreaterThanOrEqual(175);

    // Q2: Player is summited, gets uncapped bonus elevation
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q2,
      playerId,
      optionIndex: 0,
    });

    await t.mutation(api.sessions.revealAnswer, { sessionId });

    player = await t.run(async (ctx) => await ctx.db.get(playerId));
    // Gets more elevation uncapped
    expect(player!.elevation).toBeGreaterThan(q1Elevation);
    expect(player!.summitPlace).toBe(1); // Still 1st (unchanged)

    // Dynamic max is 175 (no non-summited players)
    const question2 = await t.run(async (ctx) => await ctx.db.get(q2));
    expect(question2!.dynamicMaxElevation).toBe(175);
  });

  test("175m floor ensures players can always summit easily", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Final question",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Player starts at 975m (very close to summit)
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "ClosePlayer",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(playerId, { elevation: 975 });
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId,
      optionIndex: 0,
    });

    // Reveal: Leader at 975m, 0 questions remaining after this
    // Dynamic cap = 175m (floor, questionsRemaining=0 edge case)
    // Player gets scaled score
    // Final: 975 + gain = above summit!
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    const player = await t.run(async (ctx) => await ctx.db.get(playerId));
    expect(player!.elevation).toBeGreaterThanOrEqual(1000); // Above summit
    expect(player!.summitPlace).toBe(1); // First to summit

    const question = await t.run(async (ctx) => await ctx.db.get(q1));
    // When questionsRemaining=0 (this is the last question), we return 175m floor
    expect(question!.dynamicMaxElevation).toBe(175);
  });

  test("cap maintains 175m floor throughout game", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    // Create 5 questions
    const questionIds = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        t.mutation(api.questions.create, {
          sessionId,
          text: `Q${i + 1}`,
          options: [{ text: "A" }, { text: "B" }],
          correctOptionIndex: 0,
          timeLimit: 30,
        })
      )
    );

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "Leader",
    });

    await t.mutation(api.sessions.start, { sessionId });

    const dynamicCaps: number[] = [];

    // Play through all questions
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.sessions.nextQuestion, { sessionId });
      await t.mutation(api.sessions.showAnswers, { sessionId });
      await t.mutation(api.answers.submit, {
        questionId: questionIds[i]!,
        playerId,
        optionIndex: 0,
      });
      await t.mutation(api.sessions.revealAnswer, { sessionId });

      const question = await t.run(async (ctx) =>
        await ctx.db.get(questionIds[i]!)
      );
      dynamicCaps.push(question!.dynamicMaxElevation!);
    }

    // Verify caps were calculated (should always be at least 175m floor)
    expect(dynamicCaps.length).toBe(5);
    for (const cap of dynamicCaps) {
      expect(cap).toBeGreaterThanOrEqual(175); // New floor
    }

    // First cap: leader at 0, 4 questions remaining -> (1000-0)/(4*0.55) = 455m (boost)
    expect(dynamicCaps[0]).toBe(455);
  });

  test("all non-summited players get same cap based on leader", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Create 3 players at different elevations
    const p1 = await t.mutation(api.players.join, {
      sessionId,
      name: "Leader",
    });
    const p2 = await t.mutation(api.players.join, {
      sessionId,
      name: "Middle",
    });
    const p3 = await t.mutation(api.players.join, {
      sessionId,
      name: "Behind",
    });

    // Set different starting elevations
    await t.run(async (ctx) => {
      await ctx.db.patch(p1, { elevation: 700 });
      await ctx.db.patch(p2, { elevation: 400 });
      await ctx.db.patch(p3, { elevation: 100 });
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // All answer correctly
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p1,
      optionIndex: 0,
    });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p2,
      optionIndex: 0,
    });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p3,
      optionIndex: 0,
    });

    await t.mutation(api.sessions.revealAnswer, { sessionId });

    // Check that all answers have same dynamic cap applied
    const answers = await t.query(api.answers.getByQuestion, {
      questionId: q1,
    });

    // All should get same cap (175m floor)
    const question = await t.run(async (ctx) => await ctx.db.get(q1));
    const cap = question!.dynamicMaxElevation!;

    // Verify cap was calculated as 175m floor
    // 0 questions remaining after this one (it's the only question)
    // cap = 175m (floor)
    expect(cap).toBe(175);

    // All elevation gains should be <= cap
    for (const answer of answers) {
      expect(answer.elevationGain).toBeLessThanOrEqual(cap);
    }
  });

  test("dense ranking for summit placement", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Create 4 players all close to summit
    const p1 = await t.mutation(api.players.join, { sessionId, name: "Player1" });
    const p2 = await t.mutation(api.players.join, { sessionId, name: "Player2" });
    const p3 = await t.mutation(api.players.join, { sessionId, name: "Player3" });
    const p4 = await t.mutation(api.players.join, { sessionId, name: "Player4" });

    // Set elevations so they all summit with different final elevations
    // (using elevationAtAnswer captured at submit time)
    await t.run(async (ctx) => {
      await ctx.db.patch(p1, { elevation: 970 }); // Will reach 970 + 125 = 1095
      await ctx.db.patch(p2, { elevation: 925 }); // Will reach 925 + 125 = 1050
      await ctx.db.patch(p3, { elevation: 925 }); // Will reach 925 + 125 = 1050 (same as p2)
      await ctx.db.patch(p4, { elevation: 905 }); // Will reach 905 + 125 = 1030
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // All answer correctly (instant)
    await t.mutation(api.answers.submit, { questionId: q1, playerId: p1, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId: q1, playerId: p2, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId: q1, playerId: p3, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId: q1, playerId: p4, optionIndex: 0 });

    await t.mutation(api.sessions.revealAnswer, { sessionId });

    // Check summit placements using DENSE RANKING
    const player1 = await t.run(async (ctx) => await ctx.db.get(p1));
    const player2 = await t.run(async (ctx) => await ctx.db.get(p2));
    const player3 = await t.run(async (ctx) => await ctx.db.get(p3));
    const player4 = await t.run(async (ctx) => await ctx.db.get(p4));

    // All should have summited
    expect(player1!.elevation).toBeGreaterThanOrEqual(1000);
    expect(player2!.elevation).toBeGreaterThanOrEqual(1000);
    expect(player3!.elevation).toBeGreaterThanOrEqual(1000);
    expect(player4!.elevation).toBeGreaterThanOrEqual(1000);

    // Check dense ranking: 1st (highest), 2nd (tied), 2nd (tied), 3rd
    expect(player1!.summitPlace).toBe(1); // Highest elevation
    expect(player2!.summitPlace).toBe(2); // Tied for second
    expect(player3!.summitPlace).toBe(2); // Tied for second (same elevation)
    expect(player4!.summitPlace).toBe(3); // Third (dense ranking, no skip)
  });
});
