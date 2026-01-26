# Survyay!

A fun real-time survey/quiz game for teams and events. Players climb a mountain by answering questions correctly - pick the right rope to ascend, pick wrong and watch it get cut!

## Tech Stack

### Frontend
- **React** - UI library
- **Vite** - Build tool and dev server
- **Park UI** - Component library for styling (planned)

### Backend
- **Convex** - Backend-as-a-service with real-time subscriptions (WebSocket-based reactivity built-in)

### Runtime & Tooling
- **Bun** - Runtime (use instead of Node.js for everything)
- **TypeScript** - Strict mode enabled

### Libraries
- **Effect.ts** - For type-safe error handling, services, and composition (planned)

## Game Design: Mountain Climb

### Core Concept
Players are blob creatures racing to climb a mountain. Each question = choosing a rope to climb. Correct answers ascend, wrong answers get their rope cut and stay put.

### Mechanics

#### Elevation System
- Players have continuous **elevation** (0 to 1000m) instead of discrete levels
- Mountain has visual **checkpoints/camps** every ~100m for clustering
- Speed of correct answer determines elevation gain:
  - Fast correct answer: +100m
  - Slow correct answer: +50m
  - Wrong answer: +0m (stay in place)

#### Question Flow
1. Question appears → ropes drop down (one per answer option)
2. Players pick a rope → their blob starts climbing
3. Early pickers climb higher on the rope (visual tension)
4. Timer runs out OR everyone answers → **REVEAL**
5. Correct rope: climbers complete ascent (elevation gain based on speed)
6. Wrong ropes: **SNIP** ✂️ → blobs fall back to their current elevation
7. Repeat until someone summits (1000m)

#### Catch-up Rules
- No mercy mode: Players stay where they are. Pure skill/speed wins.

### Visual Design

#### Blob Creatures (Player Avatars)
- Procedurally generated from player name (deterministic)
- Variables: body shape (round, tall, wide), color palette, eye style, tiny accessories
- SVG-based for crisp scaling and smooth animation

#### Host Screen (Screen-shared at events)
- Full chaos mode - blobs constantly moving, bouncing, climbing
- Shows top 2-3 elevation ranges, or zooms out as players spread apart
- Dramatic rope-cutting animations
- Celebrations when players reach checkpoints

#### Player Screen (Phones)
- Reactive chaos - calmer normally, bursts of activity on events
- Shows player's current elevation + ~150m above
- Can see nearby climbers
- Focused on their own rope choice and progress

#### Sound Design
- Tiny squeaks on movement/collision
- "Boop" on answer submit
- Rope tension sounds while climbing
- SNIP sound effect for wrong answers
- Celebration sounds for correct answers
- Gibberish voice clips for reactions (Animal Crossing / Minion style)
- Global mute toggle

## Architecture

### Views
- **Host View** - Create/manage sessions, display questions, show mountain with all climbers
- **Player View** - Join sessions, answer questions, see personal progress on mountain

### Requirements
- Support 50+ concurrent players per session
- Real-time updates (Convex handles this via subscriptions)
- Mobile-friendly player view (phones)
- Smooth animations at 60fps

## Project Structure

```
lib/                      # Shared code (imported by both src/ and convex/)
└── elevation.ts          # Elevation/scoring calculations

src/
├── main.tsx              # Entry point with Convex provider
├── App.tsx               # Mode selection (host/player)
├── index.css             # Global styles
├── lib/
│   └── blobGenerator.ts  # Deterministic avatar generation
├── components/
│   ├── Blob.tsx          # SVG blob renderer
│   ├── BlobGallery.tsx   # Blob preview gallery
│   └── Mountain.tsx      # Mountain visualization with players
└── views/
    ├── HostView.tsx      # Host session management
    └── PlayerView.tsx    # Player join and gameplay

convex/
├── schema.ts             # Database schema
├── sessions.ts           # Session CRUD and state management
├── players.ts            # Player join, scores, elevation
├── questions.ts          # Question CRUD
└── answers.ts            # Answer submission and scoring (imports from lib/)

tests/
├── unit/                 # Vitest unit tests
│   ├── blobGenerator.test.ts
│   └── elevation.test.ts
├── convex/               # Convex backend tests
│   └── answers.test.ts
└── e2e/                  # Playwright E2E tests
    └── smoke.test.ts
```

### Shared Code Architecture

Code that needs to be used by both frontend (`src/`) and backend (`convex/`) lives in the root `lib/` folder. This prevents cyclic dependencies:

```
lib/ ←── convex/ imports from here
  ↑
  └── src/ can also import from here
```

**Rule**: `convex/` and `src/` can both import from `lib/`, but `lib/` should never import from either.

## Commands

```bash
bun run dev          # Start Vite dev server
bun run convex:dev   # Start Convex dev server
bun run build        # Production build
bun run preview      # Preview production build
bun run test         # Run unit tests in watch mode
bun run test:run     # Run unit tests once
bun run test:e2e     # Run Playwright E2E tests
```

## Testing

### Test Types

| Type | Framework | Location | Purpose |
|------|-----------|----------|---------|
| Unit | Vitest | `tests/unit/` | Pure functions, utilities, isolated logic |
| Convex | convex-test + Vitest | `tests/convex/` | Backend mutations, queries, database logic |
| E2E | Playwright | `tests/e2e/` | Full browser integration, user flows |

### When to Write Tests

- **Always test**: Core game logic (elevation calculation, scoring), deterministic generators (blobs), Convex mutations that affect game state
- **Consider testing**: Complex UI interactions, edge cases discovered during development
- **Skip testing**: Simple pass-through components, one-off styling, prototypes being actively iterated

### When to Run Tests

- **Before committing**: Run `bun run test:run` to catch regressions
- **After Convex changes**: Run `bun run test:run tests/convex/` to verify backend logic
- **Before PR/deploy**: Run both `bun run test:run && bun run test:e2e`

### Test Examples

```typescript
// Unit test (Vitest) - tests/unit/elevation.test.ts
import { calculateElevationGain } from "../../src/lib/elevation";
test("fast answers get max elevation", () => {
  expect(calculateElevationGain(1000)).toBe(100);
});

// Convex test - tests/convex/answers.test.ts
import { convexTest } from "convex-test";
const t = convexTest(schema, modules);
const result = await t.mutation(api.answers.submit, { ... });

// E2E test (Playwright) - tests/e2e/smoke.test.ts
test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Survyay!" })).toBeVisible();
});
```

## Task Management

When asked to do work that involves multiple steps or non-trivial implementation:
- **Create tasks** using `TaskCreate` to track progress
- **Update task status** to `in_progress` when starting, `completed` when done
- **Set dependencies** between tasks using `addBlockedBy` when order matters
- Tasks help maintain context across conversation and show progress to the user

## Development Notes

- Convex provides real-time sync out of the box - no manual WebSocket management
- `convex.json` configures `VITE_CONVEX_URL` env var for Vite compatibility
- Players can join mid-game (only blocked when session is "finished")
- Blob generation should be deterministic (same name = same blob every time)

## TODO

- [x] Set up Convex schema and functions
- [x] Set up React with Vite
- [x] Create basic host and player views
- [x] Implement session/room joining
- [x] Add question/answer flow
- [x] Add scoring system
- [x] Replace points with elevation system
- [x] Create blob creature avatar generator
- [x] Set up testing infrastructure (Vitest + Playwright)
- [x] Build mountain visualization component
- [x] Add rope climbing animations
- [ ] Implement rope cutting animation
- [x] Add sound effects system
- [ ] Polish host view (full chaos mode)
- [ ] Polish player view (reactive chaos)
- [x] Add checkpoints/camps visual markers
