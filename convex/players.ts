import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PRESENCE_TIMEOUT_MS } from "../lib/constants";

// Helper to check if a player is currently active based on heartbeat
function isPlayerActive(player: { lastSeenAt?: number }): boolean {
  if (!player.lastSeenAt) return false; // Never seen = inactive
  if (player.lastSeenAt === 0) return false; // Explicitly disconnected
  return Date.now() - player.lastSeenAt < PRESENCE_TIMEOUT_MS;
}

export const join = mutation({
  args: {
    sessionId: v.id("sessions"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status === "finished") throw new Error("Game has ended");

    const trimmedName = args.name.trim();

    // Check for existing player with same name in session
    const existing = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("name"), trimmedName))
      .first();

    if (existing) {
      // If existing player is still active, reject the join
      if (isPlayerActive(existing)) {
        throw new Error("Name already taken in this session");
      }

      // Existing player is inactive - reactivate them (allows rejoin/refresh scenarios)
      // This preserves their elevation/progress
      await ctx.db.patch(existing._id, { lastSeenAt: Date.now() });
      return existing._id;
    }

    // No existing player with this name - create new one
    const playerId = await ctx.db.insert("players", {
      sessionId: args.sessionId,
      name: trimmedName,
      elevation: 0,
      lastSeenAt: Date.now(),
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

// Optimized leaderboard query - returns only top N players + current player's rank
// Reduces data transfer from all players to just top 10 (or 11 if current player outside top)
export const getLeaderboardSummary = query({
  args: {
    sessionId: v.id("sessions"),
    playerId: v.optional(v.id("players")),
    limit: v.optional(v.number()), // default 10
  },
  handler: async (ctx, { sessionId, playerId, limit = 10 }) => {
    const allPlayers = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    // Sort by elevation descending (highest climbers first)
    const sorted = allPlayers.sort(
      (a, b) => (b.elevation ?? 0) - (a.elevation ?? 0)
    );

    const top = sorted.slice(0, limit);

    let currentRank: number | null = null;
    let currentPlayer = null;
    if (playerId) {
      const idx = sorted.findIndex((p) => p._id === playerId);
      if (idx !== -1) {
        currentRank = idx + 1;
        currentPlayer = sorted[idx];
      }
    }

    return {
      top,
      currentRank,
      currentPlayer,
      totalPlayers: allPlayers.length,
    };
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

// Check if a stored player session is still valid for rejoining
// Returns session and player info if valid, null otherwise
export const checkStoredSession = query({
  args: {
    playerId: v.id("players"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    const player = await ctx.db.get(args.playerId);

    // Session or player doesn't exist
    if (!session || !player) {
      return null;
    }

    // Player doesn't belong to this session
    if (player.sessionId !== args.sessionId) {
      return null;
    }

    // Session is finished - can't rejoin
    if (session.status === "finished") {
      return null;
    }

    // Valid session found - return info for rejoin UI
    return {
      session: {
        code: session.code,
        status: session.status,
      },
      player: {
        name: player.name,
        elevation: player.elevation,
      },
    };
  },
});

// Reactivate a player (update lastSeenAt to mark as active again)
export const reactivate = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) throw new Error("Player not found");

    // Check the session is still joinable
    const session = await ctx.db.get(player.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status === "finished") throw new Error("Game has ended");

    // Reactivate by updating heartbeat
    await ctx.db.patch(args.playerId, { lastSeenAt: Date.now() });
    return player._id;
  },
});

// Kick a player from a session - removes them entirely
export const kick = mutation({
  args: { playerId: v.id("players"), hostId: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) throw new Error("Player not found");

    const session = await ctx.db.get(player.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");

    // Delete all answers by this player
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    for (const answer of answers) {
      await ctx.db.delete(answer._id);
    }

    // Delete the player record
    await ctx.db.delete(args.playerId);
  },
});

// Get player context for optimized player view subscription
// Returns current player, nearby players within elevation range, and total player count
// Used by PlayerView for Mountain component - reduces data transfer compared to listBySession
export const getPlayerContext = query({
  args: {
    sessionId: v.id("sessions"),
    playerId: v.id("players"),
    elevationRange: v.optional(v.number()), // default 150m above and below
  },
  handler: async (ctx, { sessionId, playerId, elevationRange = 150 }) => {
    const currentPlayer = await ctx.db.get(playerId);
    if (!currentPlayer) return null;

    // Verify player belongs to this session
    if (currentPlayer.sessionId !== sessionId) return null;

    const elevation = currentPlayer.elevation ?? 0;
    const minElevation = Math.max(0, elevation - elevationRange);
    const maxElevation = elevation + elevationRange;

    // Get all players in session
    const allPlayers = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    // Filter to nearby players only (includes current player)
    const nearbyPlayers = allPlayers.filter(
      (p) =>
        p.elevation !== undefined &&
        p.elevation >= minElevation &&
        p.elevation <= maxElevation
    );

    return {
      currentPlayer,
      nearbyPlayers,
      totalPlayers: allPlayers.length,
    };
  },
});
