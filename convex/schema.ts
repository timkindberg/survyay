import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Survey sessions (rooms)
  sessions: defineTable({
    code: v.string(), // Join code like "ABCD"
    hostId: v.string(), // Anonymous host identifier
    secretToken: v.optional(v.string()), // Secret token for shareable host links
    status: v.union(v.literal("lobby"), v.literal("active"), v.literal("finished")),
    currentQuestionIndex: v.number(), // -1 means no question shown yet
    questionStartedAt: v.optional(v.number()), // When current question was shown (for speed calc)
    // Question phase for controlling flow: pre_game -> question_shown -> answers_shown -> revealed -> results
    questionPhase: v.optional(v.union(
      v.literal("pre_game"),        // Game started, players ready at base, no question yet
      v.literal("question_shown"),  // Question text visible, answers hidden
      v.literal("answers_shown"),   // Answer options visible, timer starts on first answer
      v.literal("revealed"),        // Correct answer revealed (manual host trigger)
      v.literal("results")          // Results screen showing stats
    )),
    summitThreshold: v.optional(v.number()), // Percentage of correct answers needed to summit (0-1, default 0.75)
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_hostId", ["hostId"]),

  // Questions in a session
  questions: defineTable({
    sessionId: v.id("sessions"),
    text: v.string(),
    options: v.array(v.object({ text: v.string() })),
    correctOptionIndex: v.optional(v.number()), // Optional: for quiz mode
    order: v.number(),
    timeLimit: v.number(), // Seconds to answer
    enabled: v.optional(v.boolean()), // Whether question is active (default true if undefined)
    followUpText: v.optional(v.string()), // Fun fact / educational content shown after reveal
  }).index("by_session", ["sessionId"]),

  // Players in a session
  players: defineTable({
    sessionId: v.id("sessions"),
    name: v.string(),
    elevation: v.number(), // 0+ meters, summit at 1000m (can exceed for bonus)
    lastSeenAt: v.optional(v.number()), // Heartbeat timestamp for presence tracking
    lastOptionIndex: v.optional(v.number()), // Cached last answer's option index for column positioning
    summitPlace: v.optional(v.number()), // Locked placement (1, 2, 3...) when player crossed 1000m
    summitElevation: v.optional(v.number()), // Elevation when crossed 1000m threshold
  }).index("by_session", ["sessionId"]),

  // Player answers
  answers: defineTable({
    questionId: v.id("questions"),
    playerId: v.id("players"),
    optionIndex: v.number(),
    answeredAt: v.number(), // Timestamp for speed bonus
    elevationAtAnswer: v.number(), // Player's elevation when they grabbed the rope
    // Scoring components (calculated on reveal)
    baseScore: v.optional(v.number()), // Base elevation for correct answer
    speedBonus: v.optional(v.number()), // First-answerer bonus (top 20% of correct answerers)
    elevationGain: v.optional(v.number()), // Total elevation gain (baseScore + speedBonus)
  })
    .index("by_question", ["questionId"])
    .index("by_player", ["playerId"])
    .index("by_question_and_player", ["questionId", "playerId"]),
});
