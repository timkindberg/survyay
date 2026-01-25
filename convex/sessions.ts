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

    // Check there's at least one question
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    if (questions.length === 0) {
      throw new Error("Add at least one question before starting");
    }

    await ctx.db.patch(args.sessionId, {
      status: "active",
      currentQuestionIndex: 0,
      questionStartedAt: Date.now(),
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

    const nextIndex = session.currentQuestionIndex + 1;

    if (nextIndex >= questions.length) {
      // No more questions, finish the session
      await ctx.db.patch(args.sessionId, { status: "finished" });
      return { finished: true };
    }

    await ctx.db.patch(args.sessionId, {
      currentQuestionIndex: nextIndex,
      questionStartedAt: Date.now(),
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
