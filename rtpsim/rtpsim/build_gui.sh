#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/tools/rtpsim"
go build -mod=mod -trimpath -ldflags "-s -w" -tags gui -o rtpsim-gui .
echo "Built: tools/rtpsim/rtpsim-gui"
