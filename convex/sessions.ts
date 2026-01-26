import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Generate a random 4-character join code
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // No I or O to avoid confusion
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Sample questions for rapid testing
const SAMPLE_QUESTIONS = [
  {
    text: "What is the largest planet in our solar system?",
    options: [
      { text: "Mars" },
      { text: "Jupiter" },
      { text: "Saturn" },
      { text: "Neptune" },
    ],
    correctOptionIndex: 1,
    timeLimit: 15,
  },
  {
    text: "Which director won an Oscar for 'Oppenheimer'?",
    options: [
      { text: "Steven Spielberg" },
      { text: "Christopher Nolan" },
      { text: "Denis Villeneuve" },
      { text: "Martin Scorsese" },
    ],
    correctOptionIndex: 1,
    timeLimit: 15,
  },
  {
    text: "What do you call a group of flamingos?",
    options: [
      { text: "A flock" },
      { text: "A colony" },
      { text: "A flamboyance" },
      { text: "A squadron" },
    ],
    correctOptionIndex: 2,
    timeLimit: 18,
  },
  {
    text: "Which country has the most Michelin-starred restaurants?",
    options: [
      { text: "France" },
      { text: "Italy" },
      { text: "Japan" },
      { text: "Germany" },
    ],
    correctOptionIndex: 0,
    timeLimit: 17,
  },
  {
    text: "What is the smallest country in the world by area?",
    options: [
      { text: "Monaco" },
      { text: "Liechtenstein" },
      { text: "Vatican City" },
      { text: "San Marino" },
    ],
    correctOptionIndex: 2,
    timeLimit: 16,
  },
  {
    text: "In what year was the first iPhone released?",
    options: [
      { text: "2005" },
      { text: "2007" },
      { text: "2009" },
      { text: "2011" },
    ],
    correctOptionIndex: 1,
    timeLimit: 15,
  },
  {
    text: "What is the only mammal capable of true flight?",
    options: [
      { text: "Flying squirrel" },
      { text: "Bat" },
      { text: "Flying fish" },
      { text: "Sugar glider" },
    ],
    correctOptionIndex: 1,
    timeLimit: 16,
  },
  {
    text: "Which famous scientist won the Nobel Prize twice?",
    options: [
      { text: "Albert Einstein" },
      { text: "Marie Curie" },
      { text: "Isaac Newton" },
      { text: "Nikola Tesla" },
    ],
    correctOptionIndex: 1,
    timeLimit: 18,
  },
  {
    text: "What is the capital of Australia?",
    options: [
      { text: "Sydney" },
      { text: "Melbourne" },
      { text: "Canberra" },
      { text: "Brisbane" },
    ],
    correctOptionIndex: 2,
    timeLimit: 15,
  },
  {
    text: "Which element has the chemical symbol 'Au'?",
    options: [
      { text: "Silver" },
      { text: "Aluminum" },
      { text: "Gold" },
      { text: "Argon" },
    ],
    correctOptionIndex: 2,
    timeLimit: 17,
  },
];

export const create = mutation({
  args: {
    hostId: v.string(),
  },
  handler: async (ctx, args) => {
    // Generate unique code
    let code = generateCode();
    let existing = await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    // Keep generating until we find a unique one
    while (existing) {
      code = generateCode();
      existing = await ctx.db
        .query("sessions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
    }

    const sessionId = await ctx.db.insert("sessions", {
      code,
      hostId: args.hostId,
      status: "lobby",
      currentQuestionIndex: -1,
      createdAt: Date.now(),
    });

    // Add 10 sample questions for rapid testing
    for (let i = 0; i < SAMPLE_QUESTIONS.length; i++) {
      const question = SAMPLE_QUESTIONS[i]!;
      await ctx.db.insert("questions", {
        sessionId,
        text: question.text,
        options: question.options,
        correctOptionIndex: question.correctOptionIndex,
        order: i,
        timeLimit: question.timeLimit,
      });
    }

    return { sessionId, code };
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();
  },
});

export const get = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const start = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "lobby") throw new Error("Session already started");

    // Check there's at least one enabled question
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Filter to only enabled questions (undefined or true means enabled)
    const enabledQuestions = questions.filter((q) => q.enabled !== false);

    if (enabledQuestions.length === 0) {
      throw new Error("Add at least one enabled question before starting");
    }

    await ctx.db.patch(args.sessionId, {
      status: "active",
      currentQuestionIndex: 0,
      questionStartedAt: Date.now(),
      questionPhase: "question_shown", // Start with just the question visible
    });
  },
});

export const nextQuestion = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Session not active");

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Filter to only enabled questions (undefined or true means enabled)
    const enabledQuestions = questions.filter((q) => q.enabled !== false);

    const nextIndex = session.currentQuestionIndex + 1;

    if (nextIndex >= enabledQuestions.length) {
      // No more questions, finish the session
      await ctx.db.patch(args.sessionId, { status: "finished", questionPhase: undefined });
      return { finished: true };
    }

    await ctx.db.patch(args.sessionId, {
      currentQuestionIndex: nextIndex,
      questionStartedAt: Date.now(),
      questionPhase: "question_shown", // Reset to question_shown phase
    });
    return { finished: false };
  },
});

export const finish = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: "finished" });
  },
});

// Get all sessions for a host (not finished)
export const listByHost = query({
  args: { hostId: v.string() },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_hostId", (q) => q.eq("hostId", args.hostId))
      .collect();

    // Filter out finished sessions and sort by creation date (newest first)
    return sessions
      .filter((s) => s.status !== "finished")
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Delete a session and all related data
export const remove = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    // Delete all answers for questions in this session
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const question of questions) {
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_question", (q) => q.eq("questionId", question._id))
        .collect();
      for (const answer of answers) {
        await ctx.db.delete(answer._id);
      }
      await ctx.db.delete(question._id);
    }

    // Delete all players in this session
    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const player of players) {
      await ctx.db.delete(player._id);
    }

    // Delete the session itself
    await ctx.db.delete(args.sessionId);
  },
});

// Transition from question_shown to answers_shown (reveals answer options to players)
export const showAnswers = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Session not active");
    if (session.questionPhase !== "question_shown") {
      throw new Error("Can only show answers from question_shown phase");
    }

    await ctx.db.patch(args.sessionId, {
      questionPhase: "answers_shown",
    });
  },
});

// Transition to revealed phase (manual host trigger to show correct answer)
export const revealAnswer = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Session not active");
    if (session.questionPhase !== "answers_shown") {
      throw new Error("Can only reveal from answers_shown phase");
    }

    await ctx.db.patch(args.sessionId, {
      questionPhase: "revealed",
    });
  },
});

// Transition to results phase (shows detailed stats after reveal)
export const showResults = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Session not active");
    if (session.questionPhase !== "revealed") {
      throw new Error("Can only show results from revealed phase");
    }

    await ctx.db.patch(args.sessionId, {
      questionPhase: "results",
    });
  },
});

// Go back to lobby state (from active) to allow editing questions
export const backToLobby = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Can only go back to lobby from active state");

    // Reset question index and status
    await ctx.db.patch(args.sessionId, {
      status: "lobby",
      currentQuestionIndex: -1,
      questionStartedAt: undefined,
      questionPhase: undefined,
    });

    // Reset all player elevations to 0
    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const player of players) {
      await ctx.db.patch(player._id, { elevation: 0 });
    }

    // Delete all answers for this session's questions
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const question of questions) {
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_question", (q) => q.eq("questionId", question._id))
        .collect();
      for (const answer of answers) {
        await ctx.db.delete(answer._id);
      }
    }
  },
});
