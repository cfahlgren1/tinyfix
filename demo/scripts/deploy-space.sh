#!/usr/bin/env bash
# Publishes the built demo to the Hugging Face Space. The Space serves dist/ as is, with no build step on the Hub.
set -euo pipefail
cd "$(dirname "$0")/.."
SPACE="${SPACE:-paperweight/tinyfix}"
npm run build
stage="$(mktemp -d)"
cp -R dist/. "$stage/"
cp scripts/space-readme.md "$stage/README.md"
hf upload "$SPACE" "$stage" . --repo-type space --delete "*" --commit-message "${1:-deploy the demo}"
rm -rf "$stage"
