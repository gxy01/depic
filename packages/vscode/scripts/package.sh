#!/bin/bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$PACKAGE_DIR/../.." && pwd)"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

cp "$PACKAGE_DIR/package.json" "$STAGE_DIR/package.json"
cp "$PACKAGE_DIR/README.md" "$PACKAGE_DIR/README.zh-CN.md" "$STAGE_DIR/"
cp "$ROOT_DIR/LICENSE" "$STAGE_DIR/LICENSE"
cp -R "$PACKAGE_DIR/dist" "$STAGE_DIR/dist"

# Core and Web are already bundled into extension.js. Keep only the native runtime
# dependency in the staged extension manifest so npm/vsce never resolve workspace:.
node -e '
const fs = require("node:fs");
const path = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
manifest.dependencies = { "@swc/core": manifest.dependencies["@swc/core"] };
delete manifest.devDependencies;
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
' "$STAGE_DIR/package.json"

echo "==> Staging runtime dependencies..."
swc_spec="$(node -p "require('$STAGE_DIR/package.json').dependencies['@swc/core']")"
npm install --prefix "$STAGE_DIR" "@swc/core@$swc_spec" \
  --no-save --package-lock=false \
  --omit=dev --ignore-scripts --legacy-peer-deps --no-audit --no-fund

echo "==> Packaging VSIX..."
cd "$STAGE_DIR"
if command -v vsce >/dev/null 2>&1; then
  VSCE_CMD=(vsce)
else
  VSCE_CMD=(npx --yes @vscode/vsce)
fi
"${VSCE_CMD[@]}" package --out "$PACKAGE_DIR/depic-vscode-$(node -p "require('./package.json').version").vsix"

echo "==> Done: $(find "$PACKAGE_DIR" -maxdepth 1 -name '*.vsix' -printf '%f\n')"
