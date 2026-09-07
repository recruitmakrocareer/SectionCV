#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
echo "Makro game: http://localhost:8000"
echo "Keep this terminal open while playing. Press Ctrl+C to stop."
python3 -m http.server 8000
