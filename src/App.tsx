import { useState, useEffect } from "react";
import { AdminView } from "./views/AdminView";
import { PlayerView } from "./views/PlayerView";
import { SpectatorView, SpectatorJoin } from "./views/SpectatorView";
import { BlobGallery } from "./components/BlobGallery";
import { MuteToggle } from "./components/MuteToggle";

type Mode = "select" | "admin" | "player" | "spectator" | "spectator-join" | "blobs";

// Check URL for routes
function getInitialMode(): {
  mode: Mode;
  spectatorCode?: string;
  playCode?: string;
  playName?: string;
  hostCode?: string;
  hostToken?: string;
} {
  const path = window.location.pathname;

  // /host/:code/:token - Host view with shareable link
  const hostMatch = path.match(/^\/host\/([A-Za-z]{4})\/([a-f0-9-]{36})$/i);
  if (hostMatch) {
    return {
      mode: "admin",
      hostCode: hostMatch[1]!.toUpperCase(),
      hostToken: hostMatch[2]!,
    };
  }

  // /spectate/:code - Spectator view
  const spectateMatch = path.match(/^\/spectate\/([A-Za-z]{4})$/);
  if (spectateMatch) {
    return { mode: "spectator", spectatorCode: spectateMatch[1]!.toUpperCase() };
  }

  // /play/:code/:name - Player view with code and name from URL
  const playCodeNameMatch = path.match(/^\/play\/([A-Za-z]{4})\/(.+)$/);
  if (playCodeNameMatch) {
    return {
      mode: "player",
      playCode: playCodeNameMatch[1]!.toUpperCase(),
      playName: decodeURIComponent(playCodeNameMatch[2]!),
    };
  }

  // /play/:code - Player view with prefilled code
  const playCodeMatch = path.match(/^\/play\/([A-Za-z]{4})$/);
  if (playCodeMatch) {
    return { mode: "player", playCode: playCodeMatch[1]!.toUpperCase() };
  }

  // /admin or /host - Admin panel
  if (path === "/admin" || path === "/host") {
    return { mode: "admin" };
  }

  // /play or /player - Player view
  if (path === "/play" || path === "/player") {
    return { mode: "player" };
  }

  // /blobs - Blob gallery
  if (path === "/blobs") {
    return { mode: "blobs" };
  }

  return { mode: "select" };
}

// Get initial state synchronously from URL
const initialState = getInitialMode();

export function App() {
  const [mode, setMode] = useState<Mode>(initialState.mode);
  const [spectatorCode, setSpectatorCode] = useState<string | null>(initialState.spectatorCode ?? null);
  const [playCode, setPlayCode] = useState<string | null>(initialState.playCode ?? null);
  const [playName, setPlayName] = useState<string | null>(initialState.playName ?? null);
  const [hostCode, setHostCode] = useState<string | null>(initialState.hostCode ?? null);
  const [hostToken, setHostToken] = useState<string | null>(initialState.hostToken ?? null);

  // Update URL when mode changes (but not on initial render)
  const [isInitialRender, setIsInitialRender] = useState(true);
  useEffect(() => {
    if (isInitialRender) {
      setIsInitialRender(false);
      return;
    }
    if (mode === "select") {
      window.history.replaceState({}, "", "/");
    } else if (mode === "player") {
      window.history.replaceState({}, "", "/play");
    } else if (mode === "blobs") {
      window.history.replaceState({}, "", "/blobs");
    }
    // admin URLs are managed by AdminView directly (/admin or /host/:code/:token)
    // spectator and spectator-join URLs are handled separately
  }, [mode, isInitialRender]);

  function goHome() {
    setMode("select");
  }

  if (mode === "admin") {
    return <AdminView onBack={goHome} initialCode={hostCode} initialToken={hostToken} />;
  }

  if (mode === "player") {
    return <PlayerView onBack={goHome} initialCode={playCode} initialName={playName} />;
  }

  if (mode === "spectator" && spectatorCode) {
    return (
      <SpectatorView
        sessionCode={spectatorCode}
        onBack={() => {
          setSpectatorCode(null);
          goHome();
        }}
      />
    );
  }

  if (mode === "spectator-join") {
    return (
      <SpectatorJoin
        onJoin={(code) => {
          setSpectatorCode(code);
          setMode("spectator");
          window.history.pushState({}, "", `/spectate/${code}`);
        }}
        onBack={goHome}
      />
    );
  }

  if (mode === "blobs") {
    return (
      <div>
        <button onClick={goHome} style={{ margin: 20 }}>Back</button>
        <BlobGallery />
      </div>
    );
  }

  return (
    <div className="app">
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <MuteToggle size={40} />
      </div>
      <h1>Blobby: Summit</h1>
      <p>Race your blob to the mountain top!</p>
      <div className="mode-select">
        <button className="btn-primary" onClick={() => setMode("player")}>Join Game</button>
        <button className="btn-secondary" onClick={() => setMode("spectator-join")}>
          Spectate
        </button>
        <button className="btn-ghost" onClick={() => setMode("admin")}>Host a Game</button>
      </div>
      <a href="#" className="blob-gallery-link" onClick={(e) => { e.preventDefault(); setMode("blobs"); }}>
        View Blob Gallery
      </a>
    </div>
  );
}
