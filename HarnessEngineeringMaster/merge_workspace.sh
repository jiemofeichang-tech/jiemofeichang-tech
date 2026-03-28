#!/usr/bin/env bash
# merge_workspace.sh
# Merges Harness workspace outputs into the main AiComedyDrama project.
# Run from: D:/AiProject/AiComedyDrama/HarnessEngineeringMaster/

set -e

MAIN="D:/AiProject/AiComedyDrama"
WS="D:/AiProject/AiComedyDrama/HarnessEngineeringMaster/workspace"

# Find the latest task1 (backend) workspace
TASK1_DIR=$(ls -d "$WS"/20*python-d-aiproject-aicomedydrama-server/ 2>/dev/null | sort | tail -1)
echo "Task1 workspace: $TASK1_DIR"

if [ -z "$TASK1_DIR" ]; then
  echo "ERROR: No task1 workspace found"
  exit 1
fi

# --- Backup existing server.py ---
echo "Backing up server.py..."
cp "$MAIN/server.py" "$MAIN/server.py.backup.$(date +%Y%m%d_%H%M%S)"

# --- Copy Python modules to main project ---
echo "Copying Python modules..."
for f in script_engine.py character_factory.py storyboard_generator.py video_composer.py; do
  if [ -f "$TASK1_DIR/$f" ]; then
    cp "$TASK1_DIR/$f" "$MAIN/$f"
    echo "  Copied $f"
  else
    echo "  SKIP $f (not found)"
  fi
done

# --- Create data directories ---
mkdir -p "$MAIN/data/scripts"
mkdir -p "$MAIN/data/characters"
mkdir -p "$MAIN/data/storyboards"
mkdir -p "$MAIN/data/video_tasks"
echo "Created data directories"

# --- Patch server.py: add workflow routes ---
# Instead of replacing server.py, we append the workflow routes to the existing one.
# The task1 server.py is used as a reference to extract the route handlers.
echo ""
echo "NOTE: server.py patching requires manual review."
echo "Task1 server.py is at: $TASK1_DIR/server.py"
echo "Compare with main server.py and merge the /api/workflow/* routes."
echo ""
echo "Key routes to add to server.py:"
echo "  GET  /api/workflow/script/{id}"
echo "  POST /api/workflow/script/generate"
echo "  POST /api/workflow/character/create"
echo "  GET  /api/workflow/character/{id}"
echo "  GET  /api/workflow/character/list/{project_id}"
echo "  GET  /api/workflow/storyboard/{id}"
echo "  POST /api/workflow/storyboard/generate"
echo "  GET  /api/workflow/video/task/{id}"
echo "  POST /api/workflow/video/compose"
echo "  GET  /api/workflow/status/{project_id}"
echo ""

# --- Verify Python syntax ---
echo "Verifying Python syntax..."
for f in script_engine.py character_factory.py; do
  if [ -f "$MAIN/$f" ]; then
    python -m py_compile "$MAIN/$f" && echo "  OK: $f" || echo "  FAIL: $f"
  fi
done

echo ""
echo "Merge complete!"
echo "Next steps:"
echo "1. Review and patch server.py with workflow routes"
echo "2. npm run dev (in oii前端/oiioii-clone/) to test frontend"
echo "3. python server.py to test backend"
