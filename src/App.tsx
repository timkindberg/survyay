import { useState, useEffect } from "react";
import { AdminView } from "./views/AdminView";
import { PlayerView } from "./views/PlayerView";
import { SpectatorView, SpectatorJoin } from "./views/SpectatorView";
import { BlobGallery } from "./components/BlobGallery";
import { MuteToggle } from "./components/MuteToggle";

type Mode = "select" | "admin" | "player" | "spectator" | "spectator-join" | "blobs";

// Check URL for routes
function getInitialMode(): { mode: Mode; spectatorCode?: string; playCode?: string } {
  const path = window.location.pathname;

  // /spectate/:code - Spectator view
  const spectateMatch = path.match(/^\/spectate\/([A-Za-z]{4})$/);
  if (spectateMatch) {
    return { mode: "spectator", spectatorCode: spectateMatch[1]!.toUpperCase() };
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

  // Update URL when mode changes (but not on initial render)
  const [isInitialRender, setIsInitialRender] = useState(true);
  useEffect(() => {
    if (isInitialRender) {
      setIsInitialRender(false);
      return;
    }
    if (mode === "select") {
      window.history.replaceState({}, "", "/");
    } else if (mode === "admin") {
      window.history.replaceState({}, "", "/admin");
    } else if (mode === "player") {
      window.history.replaceState({}, "", "/play");
    } else if (mode === "blobs") {
      window.history.replaceState({}, "", "/blobs");
    }
    // spectator and spectator-join URLs are handled separately
  }, [mode, isInitialRender]);

  function goHome() {
    setMode("select");
  }

  if (mode === "admin") {
    return <AdminView onBack={goHome} />;
  }

  if (mode === "player") {
    return <PlayerView onBack={goHome} initialCode={playCode} />;
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
      <h1>Survyay!</h1>
      <p>A fun real-time survey tool</p>
      <div className="mode-select">
        <button onClick={() => setMode("admin")}>Host a Session</button>
        <button onClick={() => setMode("player")}>Join as Player</button>
        <button onClick={() => setMode("spectator-join")} style={{ background: "#8b5cf6" }}>
          Spectator View
        </button>
        <button onClick={() => setMode("blobs")} style={{ background: "#10b981" }}>
          Blob Gallery
        </button>
      </div>
    </div>
  );
}
