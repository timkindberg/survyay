# Spectator View Performance Test - 50 Players

## Test Implementation Complete ✅

I've created a comprehensive E2E performance test for the spectator view with 50 concurrent players. This test ensures the spectator view will look good when screen-shared during live events.

## Files Created

1. **`tests/e2e/spectator-performance.test.ts`** - Main test suite (8 comprehensive tests)
2. **`tests/e2e/PERFORMANCE_TEST_README.md`** - Detailed documentation
3. **`docs/event-validation/run-performance-test.sh`** - Helper script to run the test with prerequisites check

## How to Run

### Method 1: Using the Helper Script (Recommended)

```bash
# Terminal 1: Start dev server
bun run dev

# Terminal 2: Start Convex
bun run convex:dev

# Terminal 3: Run the test
./docs/event-validation/run-performance-test.sh
```

### Method 2: Direct Playwright Command

```bash
# Prerequisites: dev and convex:dev servers running
npx playwright test spectator-performance --reporter=list

# Or with UI for visual debugging
npx playwright test spectator-performance --ui
```

## What the Test Does

### 8 Comprehensive Test Scenarios

1. **Rendering 50 Blobs at Various Elevations**
   - Creates 50 player contexts and joins them to the session
   - Opens spectator view at 1920x1080 (common projector resolution)
   - Verifies all 50 blobs render correctly
   - Checks for visual overlapping or crowding issues
   - Takes screenshot: `spectator-50-players-lobby.png`

2. **Game Start and Pre-Game Phase**
   - Host starts the game
   - Verifies "Get Ready!" screen appears
   - Checks all 50 blobs are visible on the mountain
   - Takes screenshot: `spectator-50-players-pregame.png`

3. **First Question - Rope Climbing Animations**
   - Host shows question and answers
   - All 50 players submit answers (distributed across all 4 options)
   - Verifies ropes appear
   - Checks all climbers are positioned correctly
   - Takes screenshots:
     - `spectator-50-players-ropes-shown.png` (before answers)
     - `spectator-50-players-climbing.png` (all 50 on ropes)

4. **Reveal Phase - Scissors and Falling Animations**
   - Host triggers reveal
   - Verifies scissors appear
   - Watches falling/celebrating animations
   - Takes screenshots:
     - `spectator-50-players-reveal-scissors.png`
     - `spectator-50-players-reveal-falling.png`

5. **Leaderboard Display**
   - Checks if leaderboard shows all 50 players
   - Verifies sorting is correct
   - Takes screenshot: `spectator-50-players-leaderboard.png`

6. **Browser Performance Metrics**
   - Measures FPS (frame rate)
   - Checks memory usage
   - Monitors for console errors
   - Expects >30 fps minimum

7. **Visual Quality Check**
   - Verifies mountain component renders
   - Checks viewport size (1920x1080)
   - Ensures no players disappear
   - Takes final screenshot: `spectator-50-players-final.png`

8. **Summary Report**
   - Prints comprehensive test results
   - Lists all screenshots generated
   - Provides checklist for pre-event verification

## Expected Output

### Console Output

The test provides detailed logging:
```
=== Test 1: Rendering 50 Blobs ===
Creating 50 players...
  10 players joined
  20 players joined
  30 players joined
  40 players joined
  50 players joined
All 50 players joined successfully
Spectator view loaded
Player count verified: 50 players
Screenshot saved: spectator-50-players-lobby.png
Rendering metrics: { blobsRendered: 50, viewportWidth: 1920, ... }
✓ Rendered 50 blobs without visual issues

=== Test 2: Game Start ===
...

=== PERFORMANCE TEST SUMMARY ===
Session Code: XXXX
Resolution: 1920x1080 (Projector)
Player Count: 50

Test Results:
  ✓ All 50 blobs rendered correctly
  ✓ Lobby animations working
  ✓ Pre-game phase displays properly
  ✓ Rope climbing animations smooth
  ✓ Reveal phase (scissors + falling) working
  ✓ Leaderboard displays correctly
  ✓ Performance metrics acceptable
  ✓ No visual glitches detected

Screenshots saved in test-results/ directory
================================
```

### Screenshots Generated

All saved to `test-results/` directory:

1. `spectator-50-players-lobby.png` - 50 blobs in lobby
2. `spectator-50-players-pregame.png` - Pre-game "Get Ready!" screen
3. `spectator-50-players-ropes-shown.png` - Ropes visible, before answers
4. `spectator-50-players-climbing.png` - All 50 players climbing ropes
5. `spectator-50-players-reveal-scissors.png` - Scissors animation
6. `spectator-50-players-reveal-falling.png` - Blobs falling/celebrating
7. `spectator-50-players-leaderboard.png` - Leaderboard with all players
8. `spectator-50-players-final.png` - Final state

**IMPORTANT**: Manually review these screenshots before your live event!

## Performance Expectations

### Passing Criteria

- ✅ **FPS**: Should be >30 fps consistently (test measures this)
- ✅ **Rendering**: All 50 blobs visible without overlap issues
- ✅ **Animations**: Smooth transitions (no stuttering)
- ✅ **Layout**: No elements outside viewport
- ✅ **Console**: No errors or warnings
- ✅ **Memory**: Reasonable heap usage

### What to Watch For

❌ **Performance Issues:**
- Frame rate drops below 30 fps
- Visible stuttering during animations
- Blobs disappearing or overlapping
- Console errors

❌ **Visual Issues:**
- Players outside visible area
- Text unreadable at 1920x1080
- Mountain graphics not rendering
- Ropes not aligned correctly

## Manual Verification Still Needed

The automated test can't verify:

1. **Sound Effects** - You must manually test:
   - Player join sounds (pop/giggle)
   - Question reveal
   - Rope tension
   - Scissors cutting (snip)
   - Blob sad/happy sounds
   - Celebration fanfare

2. **Projector Quality** - Test on actual hardware:
   - Connect to real projector
   - Verify colors look good
   - Check text readability from distance
   - Test at event venue if possible

3. **Network Stability** - During live event:
   - Ensure stable internet connection
   - Monitor Convex backend responsiveness
   - Have backup plan for connectivity issues

## Troubleshooting

### Test Fails - Players Not Joining

**Problem**: Players can't join the session

**Solutions**:
- Ensure Convex dev server is running (`bun run convex:dev`)
- Check Convex dashboard for errors
- Verify session code is generated correctly
- Try manually joining as a player first to test

### Test Fails - Spectator View Not Loading

**Problem**: Spectator view doesn't display properly

**Solutions**:
- Check dev server is running (`bun run dev`)
- Verify the spectator route works manually
- Check browser console for errors
- Try with `--headed` flag to see what's happening

### Test Fails - Performance Issues

**Problem**: FPS drops below 30 or animations lag

**Solutions**:
- Close other applications to free up resources
- Try on a more powerful machine
- Consider reducing player count for live event
- Optimize blob rendering (simplify SVG complexity)

### Test Timeout

**Problem**: Test times out after 2 minutes

**Solutions**:
- Increase timeout in test file (line 11: `test.setTimeout(120000)`)
- Check for infinite loops or stuck animations
- Verify all servers are responsive
- Monitor network requests in browser DevTools

## Pre-Event Checklist

Run this checklist before your live event:

- [ ] Performance test passes completely
- [ ] All screenshots reviewed and look good
- [ ] Sound effects tested manually with projector audio
- [ ] Tested with actual projector/screen at venue
- [ ] Network connection is stable
- [ ] Convex backend is responsive
- [ ] Backup plan prepared (lower player count if needed)
- [ ] Host controls tested (start game, show questions, reveal)
- [ ] Session creation tested multiple times

## Known Limitations

1. **Resource Intensive**: Test creates 50+ browser contexts (uses significant memory)
2. **Requires Local Setup**: Must have both dev and Convex servers running
3. **No Sound Verification**: Sounds must be tested manually
4. **Timing Sensitive**: Some animations may need timing adjustments based on machine speed

## Next Steps

1. **Run the test now** to verify everything works
2. **Review all screenshots** for visual quality
3. **Test sounds manually** with projector audio
4. **Test on actual event hardware** (projector, screen, network)
5. **Do a dry run** with real people joining if possible

## Support

If you encounter issues:

1. Check the detailed README: `tests/e2e/PERFORMANCE_TEST_README.md`
2. Review Playwright documentation: https://playwright.dev
3. Check Convex logs for backend issues
4. Use `--headed` mode to see what's happening visually
5. Take screenshots at failure points for debugging

---

**Remember**: This test validates technical performance. Always do a full dress rehearsal with actual participants before the live event! 🎉
