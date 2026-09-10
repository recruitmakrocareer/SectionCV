#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if command -v open >/dev/null 2>&1; then
  open index.html
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open index.html
else
  printf 'Open this file in your browser:\n%s/index.html\n' "$PWD"
fi
