import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const join = mutation({
  args: {
    sessionId: v.id("sessions"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status === "finished") throw new Error("Game has ended");

    // Check for duplicate names in session
    const existing = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();

    if (existing) {
      throw new Error("Name already taken in this session");
    }

    const playerId = await ctx.db.insert("players", {
      sessionId: args.sessionId,
      name: args.name.trim(),
      elevation: 0,
    });

    return playerId;
  },
});

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const get = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.playerId);
  },
});

export const getLeaderboard = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Sort by elevation descending (highest climbers first)
    return players.sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
  },
});

export const addElevation = mutation({
  args: {
    playerId: v.id("players"),
    meters: v.number(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) throw new Error("Player not found");

    // Cap at summit (1000m)
    const currentElevation = player.elevation ?? 0;
    const newElevation = Math.min(1000, currentElevation + args.meters);

    await ctx.db.patch(args.playerId, {
      elevation: newElevation,
    });

    return { elevation: newElevation, reachedSummit: newElevation >= 1000 };
  },
});

// Heartbeat for presence tracking - called periodically by client
export const heartbeat = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) return; // Silently ignore if player doesn't exist

    await ctx.db.patch(args.playerId, { lastSeenAt: Date.now() });
  },
});

// Threshold for considering a player "active" (15 seconds)
export const PRESENCE_TIMEOUT_MS = 15000;

// Disconnect mutation - marks player as immediately inactive
// Called via HTTP endpoint on page unload for instant disconnect detection
export const disconnect = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) return; // Silently ignore if player doesn't exist

    // Setting lastSeenAt to 0 immediately marks the player as inactive
    await ctx.db.patch(args.playerId, { lastSeenAt: 0 });
  },
});
