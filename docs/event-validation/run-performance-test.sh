#!/bin/bash

# Spectator Performance Test Runner
# This script helps run the 50-player performance test

set -e

echo "========================================="
echo "Spectator View Performance Test"
echo "========================================="
echo ""

# Check if dev server is running
if ! curl -s http://localhost:5173 > /dev/null; then
    echo "❌ Dev server is not running on http://localhost:5173"
    echo ""
    echo "Please start the dev server first:"
    echo "  bun run dev"
    echo ""
    exit 1
fi

echo "✅ Dev server is running"

# Check if Convex is running (basic check)
# Note: This is a simple check, might not be fully accurate
if ! pgrep -f "convex dev" > /dev/null; then
    echo "⚠️  Warning: Convex dev server might not be running"
    echo ""
    echo "Please make sure Convex is running:"
    echo "  bun run convex:dev"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Convex dev server is running"
fi

echo ""
echo "Starting performance test..."
echo "This will:"
echo "  - Create 50 virtual players"
echo "  - Test rendering at 1920x1080 resolution"
echo "  - Run through a complete game cycle"
echo "  - Take screenshots at each phase"
echo "  - Measure performance metrics"
echo ""
echo "Expected duration: ~2 minutes"
echo ""

# Run the test
npx playwright test spectator-performance --reporter=list

echo ""
echo "========================================="
echo "Test Complete!"
echo "========================================="
echo ""
echo "Screenshots saved to: test-results/"
echo ""
echo "Review the screenshots to verify visual quality:"
echo "  - spectator-50-players-lobby.png"
echo "  - spectator-50-players-pregame.png"
echo "  - spectator-50-players-climbing.png"
echo "  - spectator-50-players-reveal-*.png"
echo "  - spectator-50-players-leaderboard.png"
echo ""
echo "Check the test output above for performance metrics!"
echo ""
