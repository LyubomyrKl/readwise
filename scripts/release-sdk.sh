#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000/api/docs-json}"
REPO_SSH="git@github.com:SatoruSatoshi/summarize-api-sdk.git"
PKG_NAME="@satoru-satoshi/summarize-api-sdk"

# paths
GEN_DIR=".sdk-gen"        # clean, regenerated each run
REPO_DIR="sdk"            # persistent git repo checkout

# 0) Tools check
command -v jq >/dev/null || { echo "jq required"; exit 1; }

# 1) Generate SDK into a TEMP folder (never a git repo)
rm -rf "$GEN_DIR"
npx openapi-generator-cli generate -i "$API_URL" -g typescript-axios -o "$GEN_DIR" --skip-validate-spec

# 2) Compute spec hash from generated sources only
SPEC_HASH="$(
  { find "$GEN_DIR" -type f \
      ! -path "$GEN_DIR/node_modules/*" \
      ! -path "$GEN_DIR/dist/*" \
      ! -path "$GEN_DIR/.openapi-generator/*" \
      ! -name 'openapitools.json' \
      ! -name 'package-lock.json' \
      -print0 \
    | sort -z \
    | xargs -0 shasum | shasum; } | awk '{print $1}'
)"

# 3) Ensure we have a cloned repo with history (never delete .git)
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone "$REPO_SSH" "$REPO_DIR"
else
  git -C "$REPO_DIR" fetch origin
  git -C "$REPO_DIR" checkout main
  git -C "$REPO_DIR" reset --hard origin/main
fi

# 4) Skip if same spec
PREV_HASH="$(cat "$REPO_DIR/.spec-hash" 2>/dev/null || true)"
if [ "$SPEC_HASH" = "$PREV_HASH" ]; then
  echo "No SDK changes. Skip release."
  rm -rf "$GEN_DIR"
  exit 0
fi

# 5) Rsync generated files INTO repo working tree (preserve history)
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.openapi-generator' \
  --exclude 'openapitools.json' \
  "$GEN_DIR"/ "$REPO_DIR"/

pushd "$REPO_DIR" >/dev/null

# 6) package.json and tsconfig (idempotent)
[ -f package.json ] || npm init -y >/dev/null
jq --arg name "$PKG_NAME" '
  .name = $name
| .type = "module"
| .main = "dist/index.js"
| .types = "dist/index.d.ts"
| .files = ["dist","README.md","LICENSE"]
| .scripts.build = "tsc"
| del(.scripts.prepare)
' package.json > package.tmp && mv package.tmp package.json

[ -f tsconfig.json ] || cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,
    "emitDeclarationOnly": false,
    "module": "ESNext",
    "target": "ES2020",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["**/*.ts"],
  "exclude": ["dist","node_modules","**/*.spec.ts"]
}
JSON

# 7) Build dist so consumers can install from tarball/git
git config user.email "${GIT_EMAIL:-nakamura.saturu.cony@gmail.com}"
git config user.name  "${GIT_NAME:-nakamura-satoru}"
npm pkg set devDependencies.typescript="^5" >/dev/null
npm install --silent
npm run build

# 8) Version and commit
STAMP="$(date -u +%Y%m%dT%H%M%S)"
SUFFIX="${STAMP}+${SPEC_HASH:0:8}"
BASE_VER="$(node -e "p=require('./package.json');v=p.version||'0.1.0';console.log(v.split('-')[0])")"
NEW_VER="${BASE_VER}-${SUFFIX}"
npm version "$NEW_VER" --no-git-tag-version >/dev/null

echo "$SPEC_HASH" > .spec-hash
printf '%s\n' 'node_modules' '.openapi-generator' 'openapitools.json' > .gitignore

git add -A
git commit -m "release: ${NEW_VER} (spec ${SPEC_HASH:0:12})"

# 9) Tag and push WITHOUT force (history preserved)
git tag -a "v${NEW_VER}" -m "v${NEW_VER}" || true
git push origin main
git push origin "v${NEW_VER}" || true

popd >/dev/null
rm -rf "$GEN_DIR"

echo "Released v${NEW_VER}"
echo "Repo: $REPO_SSH"
echo "Install: npm i $PKG_NAME"
