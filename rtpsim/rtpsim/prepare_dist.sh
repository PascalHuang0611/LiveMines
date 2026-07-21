#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST="$(cd "$(dirname "$0")" && pwd)/dist"
DOCS="$ROOT/../docs"

mkdir -p "$DIST"
cp "$DOCS"/TG001_LM01_*_Config.json "$DIST/"
cp "$DOCS"/LM_Qualified_test_data20260612_ServerSimulation.csv "$DIST/"
echo "Synced data files to $DIST"
