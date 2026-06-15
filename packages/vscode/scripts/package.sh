#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "==> Installing runtime dependencies (npm flat install)..."
rm -rf node_modules
npm install @swc/core --production --no-save --ignore-scripts --legacy-peer-deps

echo "==> Hiding pnpm root files..."
ROOT_DIR="$(cd ../.. && pwd)"
mv "$ROOT_DIR/package.json" "$ROOT_DIR/package.json.bak" 2>/dev/null || true
mv "$ROOT_DIR/pnpm-workspace.yaml" "$ROOT_DIR/pnpm-workspace.yaml.bak" 2>/dev/null || true

echo "==> Packaging VSIX..."
vsce package

echo "==> Restoring pnpm root files..."
mv "$ROOT_DIR/package.json.bak" "$ROOT_DIR/package.json" 2>/dev/null || true
mv "$ROOT_DIR/pnpm-workspace.yaml.bak" "$ROOT_DIR/pnpm-workspace.yaml" 2>/dev/null || true

echo "==> Done: $(ls *.vsix)"
