#!/usr/bin/env bash
#
# Start all three demo agents in parallel.
# Usage: ./run.sh "Write a blog post about AI agents"
#
set -euo pipefail
cd "$(dirname "$0")"

TASK="${1:?Usage: ./run.sh \"<task description>\"}"

echo "═══════════════════════════════════════════════════"
echo "  AgentLink Demo — 3 agents working together"
echo "═══════════════════════════════════════════════════"
echo "  Task: $TASK"
echo "  Broker: ${BROKER_URL:-http://localhost:3000}"
echo "  Registry: ${REGISTRY_URL:-http://localhost:3001}"
echo "═══════════════════════════════════════════════════"
echo ""

# Start worker and critic first (they listen for messages)
echo "[run] Starting worker agent..."
./node_modules/.bin/tsx src/agents/worker.ts &
WORKER_PID=$!

echo "[run] Starting critic agent..."
./node_modules/.bin/tsx src/agents/critic.ts &
CRITIC_PID=$!

# Give them time to register and subscribe
sleep 3

# Start planner (sends work to worker)
echo "[run] Starting planner agent with task..."
./node_modules/.bin/tsx src/agents/planner.ts "$TASK" &
PLANNER_PID=$!

# Wait for planner to finish (worker and critic stay running)
wait $PLANNER_PID 2>/dev/null || true

# Give critic time to process the broadcast
sleep 5

# Clean up
echo ""
echo "[run] Shutting down agents..."
kill $WORKER_PID $CRITIC_PID 2>/dev/null || true
wait $WORKER_PID $CRITIC_PID 2>/dev/null || true
echo "[run] ✅ Done!"
