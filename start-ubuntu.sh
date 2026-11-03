#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Install Node.js LTS and npm, then run this script again.'
  exit 1
fi
if [ ! -d node_modules/playwright ]; then
  npm install
fi
npx playwright install chromium
node server.js
