#!/bin/bash
# Auto-restart wrapper for reCAPTCHA Token Server
# Server akan exit setelah N token → script ini restart otomatis
# Usage: bash start.sh

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔁 reCAPTCHA Server — Auto Restart Mode"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RESTART_COUNT=0

while true; do
    RESTART_COUNT=$((RESTART_COUNT + 1))
    echo ""
    echo "🚀 Starting server (session #${RESTART_COUNT})..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    npx electron server.js

    EXIT_CODE=$?
    echo ""
    echo "⚡ Server exited (code: ${EXIT_CODE}), restarting in 3s..."
    sleep 3
done
