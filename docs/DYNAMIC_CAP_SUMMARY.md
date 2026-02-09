# Dynamic Elevation Cap (Rubber-Banding) Implementation

## Overview

Implemented dynamic rubber-banding to ensure games stay competitive and all questions get asked by preventing early summiting.

## How It Works

### Algorithm

After each question is revealed (but BEFORE applying elevation gains), the system calculates:

```typescript
const questionsRemaining = totalQuestions - currentQuestionIndex - 1;
const leaderElevation = getTopPlayer().elevation;
const distanceToSummit = 1000 - leaderElevation;

const targetMax = distanceToSummit / questionsRemaining;
const dynamicMax = Math.max(50, Math.min(150, targetMax));
```

### Application

- **Everyone gets the same cap** - Fair for all players
- **Cap applies AFTER base + minority scoring** - Preserves skill-based scoring
- **If calculated elevation > cap, player gets cap amount** - Prevents runaway leaders
- **Bounded by 50-150m range** - Ensures reasonable gameplay

## Implementation Details

### Files Changed

1. **lib/elevation.ts**
   - Added `calculateDynamicMax()` function
   - Takes leader elevation and questions remaining
   - Returns cap value (50-150m)

2. **convex/schema.ts**
   - Added `dynamicMaxElevation: v.optional(v.number())` to questions table
   - Stores the cap applied to each question for debugging

3. **convex/sessions.ts**
   - Modified `revealAnswer` mutation to:
     - Calculate all scores first (before applying gains)
     - Determine current leader elevation
     - Calculate dynamic cap
     - Apply cap to all elevation gains
     - Store cap on question record

### Test Coverage

#### Unit Tests (lib/elevation.test.ts)
- 24 new test cases covering:
  - Basic rubber-banding distribution
  - Bounds enforcement (50-150m)
  - Edge cases (summit reached, 0 questions remaining, etc.)
  - Realistic game scenarios
  - Rounding behavior

#### Integration Tests (tests/convex/dynamic-cap.test.ts)
- 5 comprehensive backend tests:
  - Dynamic cap prevents early summiting
  - Minimum cap ensures finish possible
  - Cap tightens as game progresses
  - All players get same cap
  - Cap calculation based on leader

## Example Scenarios

### Scenario 1: Early Game (Loose Caps)
- **State**: Leader at 100m, 9 questions remaining
- **Calculation**: (1000-100)/9 = 100m
- **Cap Applied**: 100m
- **Effect**: Natural gameplay continues

### Scenario 2: Mid Game (Normal Caps)
- **State**: Leader at 500m, 5 questions remaining
- **Calculation**: (1000-500)/5 = 100m
- **Cap Applied**: 100m
- **Effect**: Balanced progression

### Scenario 3: Late Game (Tight Caps)
- **State**: Leader at 850m, 2 questions remaining
- **Calculation**: (1000-850)/2 = 75m
- **Cap Applied**: 75m
- **Effect**: Prevents early summiting, keeps game competitive

### Scenario 4: Final Question (Minimum Cap)
- **State**: Leader at 975m, 1 question remaining
- **Calculation**: (1000-975)/1 = 25m → capped to 50m
- **Cap Applied**: 50m
- **Effect**: Still allows finish, but prevents runaway scoring

### Scenario 5: Runaway Leader (Slowdown)
- **State**: Leader at 800m, 8 questions remaining
- **Calculation**: (1000-800)/8 = 25m → capped to 50m
- **Cap Applied**: 50m
- **Effect**: Slows down leader, allows catch-up

## Edge Cases Handled

1. **Leader already at summit**: Returns MAX_CAP (150m)
2. **0 questions remaining**: Returns MAX_CAP (150m) - shouldn't happen normally
3. **Negative questions remaining**: Returns MAX_CAP (150m) - edge case safety
4. **All players tied at 0m**: Uses leader elevation (0), calculates normally
5. **Very small distance to summit**: Enforces MIN_CAP (50m) to ensure finish possible

## Verification

All tests pass:
- ✅ 50 unit tests in elevation.test.ts
- ✅ 5 integration tests in dynamic-cap.test.ts
- ✅ Schema updated with new field
- ✅ Backend mutation correctly calculates and applies cap

## Key Design Decisions

### Why calculate BEFORE applying gains?
Prevents feedback loops - cap is based on current state, not future state after this question.

### Why same cap for everyone?
Fairness - all players face same constraints, skill still matters through base + minority scoring.

### Why 50-150m bounds?
- **50m minimum**: Ensures players can always finish (2-3 good answers to summit from 900m)
- **150m maximum**: Prevents caps from being too loose in early game with few questions

### Why store dynamicMaxElevation on questions?
Debugging and analytics - allows host/developers to see how rubber-banding behaved throughout the game.

## Future Enhancements

Potential improvements to consider:
- Adjust MIN/MAX_CAP bounds based on playtesting
- Add visual indicator to players showing "competitive mode" when cap is active
- Track cap application statistics for game balance analysis
- Consider different cap curves (exponential vs linear)
