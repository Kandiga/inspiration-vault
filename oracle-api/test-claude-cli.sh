#!/bin/bash
export HOME=/root
echo "hello" | claude --print --debug --debug-file /tmp/claude-full-debug.log --no-session-persistence --max-turns 1 2>&1
echo "EXIT: $?"
echo "=== DEBUG LOG ==="
head -100 /tmp/claude-full-debug.log 2>/dev/null || echo "no debug file"
