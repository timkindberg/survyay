import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { RopeClimbingState, PlayerRopeState } from "../../lib/ropeTypes";
import { shuffleOptions } from "../../lib/shuffle";

/**
 * Hook that manages all Convex query subscriptions for the player game view.
 * Subscriptions are conditionally activated based on game state to minimize
 * data transfer (e.g., full player list only in lobby, nearby players during gameplay).
 */
export function useGameSubscriptions({
  sessionId,
  playerId,
}: {
  sessionId: Id<"sessions"> | null;
  playerId: Id<"players"> | null;
}) {
  const session = useQuery(
    api.sessions.get,
    sessionId ? { sessionId } : "skip"
  );
  const player = useQuery(
    api.players.get,
    playerId ? { playerId } : "skip"
  );
  const currentQuestion = useQuery(
    api.questions.getCurrentQuestion,
    sessionId ? { sessionId } : "skip"
  );

  // Rope climbing state for active question visualization (Mountain component)
  const ropeClimbingState = useQuery(
    api.answers.getRopeClimbingState,
    sessionId ? { sessionId } : "skip"
  ) as RopeClimbingState | null | undefined;

  // Lightweight player-specific rope state for UI logic
  const playerRopeState = useQuery(
    api.answers.getPlayerRopeState,
    sessionId && playerId ? { sessionId, playerId } : "skip"
  ) as PlayerRopeState | null | undefined;

  // Fetch full player list for lobby (shows all other players)
  const isInLobby = session?.status === "lobby";
  const players = useQuery(
    api.players.listBySession,
    sessionId && isInLobby ? { sessionId } : "skip"
  );

  // Optimized subscription for active gameplay - only fetches nearby players
  const playerContext = useQuery(
    api.players.getPlayerContext,
    sessionId && playerId && !isInLobby
      ? { sessionId, playerId, elevationRange: 150 }
      : "skip"
  );

  // Only fetch leaderboard when needed (results phase or game finished)
  const questionPhaseFromState = playerRopeState?.phase ?? null;
  const needsLeaderboard = questionPhaseFromState === "results" || session?.status === "finished";
  const leaderboardSummary = useQuery(
    api.players.getLeaderboardSummary,
    sessionId && needsLeaderboard
      ? { sessionId, playerId: playerId ?? undefined, limit: 10 }
      : "skip"
  );

  // Derived state
  const hasAnswered = useMemo(() => {
    return playerRopeState?.myAnswer.hasAnswered ?? false;
  }, [playerRopeState]);

  const timingInfo = useMemo(() => {
    if (!playerRopeState) return null;
    return {
      firstAnsweredAt: playerRopeState.timing.firstAnsweredAt,
      timeLimit: playerRopeState.timing.timeLimit,
      totalAnswers: playerRopeState.answeredCount,
    };
  }, [playerRopeState]);

  const questionPhase = playerRopeState?.phase ?? "answers_shown";

  // Compute shuffled options for deterministic randomization
  const shuffledAnswers = useMemo(() => {
    if (!currentQuestion || !session?.code || session.currentQuestionIndex < 0) {
      return null;
    }
    return shuffleOptions(
      currentQuestion.options,
      session.code,
      session.currentQuestionIndex
    );
  }, [currentQuestion, session?.code, session?.currentQuestionIndex]);

  return {
    session,
    player,
    currentQuestion,
    ropeClimbingState,
    playerRopeState,
    players,
    playerContext,
    leaderboardSummary,
    hasAnswered,
    timingInfo,
    questionPhase,
    shuffledAnswers,
  };
}
