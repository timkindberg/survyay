import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Survey sessions (rooms)
  sessions: defineTable({
    code: v.string(), // Join code like "ABCD"
    hostId: v.string(), // Anonymous host identifier
    status: v.union(v.literal("lobby"), v.literal("active"), v.literal("finished")),
    currentQuestionIndex: v.number(), // -1 means no question shown yet
    questionStartedAt: v.optional(v.number()), // When current question was shown (for speed calc)
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  // Questions in a session
  questions: defineTable({
    sessionId: v.id("sessions"),
    text: v.string(),
    options: v.array(v.object({ text: v.string() })),
    correctOptionIndex: v.optional(v.number()), // Optional: for quiz mode
    order: v.number(),
    timeLimit: v.number(), // Seconds to answer
  }).index("by_session", ["sessionId"]),

  // Players in a session
  players: defineTable({
    sessionId: v.id("sessions"),
    name: v.string(),
    elevation: v.number(), // 0-1000m, summit at 1000
  }).index("by_session", ["sessionId"]),

  // Player answers
  answers: defineTable({
    questionId: v.id("questions"),
    playerId: v.id("players"),
    optionIndex: v.number(),
    answeredAt: v.number(), // Timestamp for speed bonus
  })
    .index("by_question", ["questionId"])
    .index("by_player", ["playerId"])
    .index("by_question_and_player", ["questionId", "playerId"]),
});
