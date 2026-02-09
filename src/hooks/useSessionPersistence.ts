import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getFriendlyErrorMessage } from "../lib/errorMessages";

// localStorage helpers for session persistence
// Using localStorage so players can rejoin after closing the browser/tab
// Stores multiple sessions keyed by code+name to support multiple tabs with different players
const STORAGE_KEY = "blobby_player_sessions";
const OLD_STORAGE_KEY = "blobby_player"; // Legacy single-session key

interface StoredSession {
  playerId: string;
  sessionId: string;
  sessionCode: string;
  playerName: string;
}

// Storage format: { "CODE:name": StoredSession, ... }
type StoredSessions = Record<string, StoredSession>;

function getSessionKey(code: string, name: string): string {
  // Normalize: uppercase code, exact name (case-sensitive)
  return `${code.toUpperCase()}:${name}`;
}

function loadAllSessions(): StoredSessions {
  try {
    // First, check for and migrate legacy single-session format
    const oldStored = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldStored) {
      const oldSession = JSON.parse(oldStored) as StoredSession;
      // Migrate to new format
      const key = getSessionKey(oldSession.sessionCode, oldSession.playerName);
      const migrated: StoredSessions = { [key]: oldSession };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(OLD_STORAGE_KEY);
      return migrated;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as StoredSessions;
  } catch {
    return {};
  }
}

function saveSession(playerId: Id<"players">, sessionId: Id<"sessions">, sessionCode: string, playerName: string) {
  const sessions = loadAllSessions();
  const key = getSessionKey(sessionCode, playerName);
  sessions[key] = { playerId, sessionId, sessionCode, playerName };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function loadSession(code?: string, name?: string): StoredSession | null {
  const sessions = loadAllSessions();

  // If code and name provided, look up that specific session
  if (code && name) {
    const key = getSessionKey(code, name);
    return sessions[key] ?? null;
  }

  // Fallback: return the first session found (for backwards compatibility)
  // This handles the case where URL doesn't have code/name yet
  const keys = Object.keys(sessions);
  if (keys.length > 0) {
    return sessions[keys[0]!] ?? null;
  }

  return null;
}

function clearSession(code?: string, name?: string) {
  if (code && name) {
    // Clear specific session
    const sessions = loadAllSessions();
    const key = getSessionKey(code, name);
    delete sessions[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } else {
    // Clear all sessions (used when no specific session to clear)
    localStorage.removeItem(STORAGE_KEY);
  }
}

function clearCurrentSession(session: StoredSession | null) {
  if (session) {
    clearSession(session.sessionCode, session.playerName);
  }
}

export interface UseSessionPersistenceReturn {
  // Join form state
  joinCode: string;
  setJoinCode: (code: string) => void;
  playerName: string;
  setPlayerName: (name: string) => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;

  // Session identity
  playerId: Id<"players"> | null;
  sessionId: Id<"sessions"> | null;

  // Restore/rejoin state
  isRestoring: boolean;
  isRejoining: boolean;
  storedSession: StoredSession | null;
  checkStoredSession: { player: { elevation: number }; session: { code: string } } | null | undefined;

  // Error state
  error: string;
  setError: (error: string) => void;

  // Leave confirmation
  showLeaveConfirm: boolean;
  setShowLeaveConfirm: (show: boolean) => void;

  // Session lookup (for the join form)
  getByCode: { _id: Id<"sessions">; code: string } | null | undefined;

  // Actions
  handleJoin: (e: React.FormEvent) => Promise<void>;
  handleRejoin: () => Promise<void>;
  handleStartFresh: () => void;
  handleLeave: () => void;

  // For clearing session on game finish
  clearSessionForPlayer: (code: string, name: string) => void;
}

/**
 * Hook that manages session persistence, join/rejoin/leave flows,
 * and localStorage-based session restoration.
 */
export function useSessionPersistence({
  initialCode,
  initialName,
}: {
  initialCode?: string | null;
  initialName?: string | null;
}): UseSessionPersistenceReturn {
  const [joinCode, setJoinCode] = useState(initialCode ?? "");
  const [playerName, setPlayerName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [playerId, setPlayerId] = useState<Id<"players"> | null>(null);
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [error, setError] = useState("");
  const [isRestoring, setIsRestoring] = useState(true);
  const [storedSession, setStoredSession] = useState<StoredSession | null>(null);
  const [isRejoining, setIsRejoining] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Check stored session validity via Convex
  const checkStoredSession = useQuery(
    api.players.checkStoredSession,
    storedSession
      ? {
          playerId: storedSession.playerId as Id<"players">,
          sessionId: storedSession.sessionId as Id<"sessions">,
        }
      : "skip"
  );

  const reactivatePlayer = useMutation(api.players.reactivate);

  // Session lookup for the join form
  const getByCode = useQuery(
    api.sessions.getByCode,
    joinCode.length === 4 ? { code: joinCode.toUpperCase() } : "skip"
  );

  const joinSession = useMutation(api.players.join);

  // Try to restore session from localStorage on mount
  useEffect(() => {
    const stored = loadSession(initialCode ?? undefined, initialName ?? undefined);
    if (stored) {
      setStoredSession(stored);
    }
    setIsRestoring(false);
  }, [initialCode, initialName]);

  // Handle the result of checking stored session
  useEffect(() => {
    if (storedSession && checkStoredSession !== undefined) {
      if (checkStoredSession === null) {
        clearCurrentSession(storedSession);
        setStoredSession(null);
      }
    }
  }, [storedSession, checkStoredSession]);

  // Ref to track if we've tried auto-rejoining (for bookmarkable URLs)
  const hasTriedAutoRejoin = useRef(false);

  // Auto-focus name input when code is prefilled from URL
  useEffect(() => {
    if (initialCode && !isRestoring && !playerId && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [initialCode, isRestoring, playerId]);

  const handleRejoin = useCallback(async () => {
    if (!storedSession) return;
    setIsRejoining(true);
    setError("");

    try {
      await reactivatePlayer({
        playerId: storedSession.playerId as Id<"players">,
      });
      setPlayerId(storedSession.playerId as Id<"players">);
      setSessionId(storedSession.sessionId as Id<"sessions">);
      window.history.replaceState({}, "", `/play/${storedSession.sessionCode}/${encodeURIComponent(storedSession.playerName)}`);
      setStoredSession(null);
    } catch (err) {
      clearCurrentSession(storedSession);
      setStoredSession(null);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsRejoining(false);
    }
  }, [storedSession, reactivatePlayer]);

  // Auto-rejoin when URL has code matching localStorage session
  useEffect(() => {
    const codeMatches = initialCode && storedSession &&
      storedSession.sessionCode.toUpperCase() === initialCode.toUpperCase();
    const nameMatches = !initialName || storedSession?.playerName === initialName;

    if (
      codeMatches &&
      nameMatches &&
      checkStoredSession &&
      !hasTriedAutoRejoin.current &&
      !isRejoining &&
      !playerId
    ) {
      hasTriedAutoRejoin.current = true;
      handleRejoin();
    }
  }, [initialCode, initialName, storedSession, checkStoredSession, isRejoining, playerId, handleRejoin]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!getByCode) {
      setError("Game not found. Check the code and try again.");
      return;
    }

    try {
      const trimmedName = playerName.trim();
      const id = await joinSession({
        sessionId: getByCode._id,
        name: trimmedName,
      });
      setPlayerId(id);
      setSessionId(getByCode._id);
      setStoredSession(null);
      saveSession(id, getByCode._id, getByCode.code, trimmedName);
      window.history.replaceState({}, "", `/play/${getByCode.code}/${encodeURIComponent(trimmedName)}`);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    }
  }

  function handleStartFresh() {
    clearCurrentSession(storedSession);
    setStoredSession(null);
    setJoinCode(initialCode ?? "");
    setPlayerName("");
  }

  function handleLeave() {
    clearCurrentSession(storedSession);
    setStoredSession(null);
    setPlayerId(null);
    setSessionId(null);
    setJoinCode("");
    setPlayerName("");
    setShowLeaveConfirm(false);
  }

  // If restored session is invalid (player deleted, session gone), clear it
  // This needs to check player existence via the caller providing player data
  // We handle it here by exposing clearSessionForPlayer for the component to call

  return {
    joinCode,
    setJoinCode,
    playerName,
    setPlayerName,
    nameInputRef,
    playerId,
    sessionId,
    isRestoring,
    isRejoining,
    storedSession,
    checkStoredSession,
    error,
    setError,
    showLeaveConfirm,
    setShowLeaveConfirm,
    getByCode,
    handleJoin,
    handleRejoin,
    handleStartFresh,
    handleLeave,
    clearSessionForPlayer: clearSession,
  };
}
