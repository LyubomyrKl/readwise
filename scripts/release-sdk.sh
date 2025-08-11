set -euo pipefail

API_URL="${API_URL:-http://localhost:3000/api/docs-json}"
OUT_DIR="sdk"
REPO_SSH="git@github.com:SatoruSatoshi/summarize-api-sdk.git"
PKG_NAME="@satoru-satoshi/summarize-api-sdk"

# 1) Generate SDK
rm -rf "$OUT_DIR"
npx openapi-generator-cli generate -i "$API_URL" -g typescript-axios -o "$OUT_DIR" --skip-validate-spec

pushd "$OUT_DIR" >/dev/null

# 2) Hash (ignore generator noise)
SPEC_HASH="$(
  { find . -type f \
      ! -path './.git/*' \
      ! -path './node_modules/*' \
      ! -path './dist/*' \
      ! -path './.openapi-generator/*' \
      ! -name 'openapitools.json' \
      ! -name 'package-lock.json' \
      -print0 \
    | sort -z \
    | xargs -0 shasum | shasum; } | awk '{print $1}'
)"
PREV_HASH="$(cat .spec-hash 2>/dev/null || true)"
[ "$SPEC_HASH" = "$PREV_HASH" ] && { echo "No SDK changes. Skip release."; exit 0; }

# 3) Git init
if [ ! -d .git ]; then
  git init
  git branch -M main
  git remote add origin "$REPO_SSH"
  git config user.email "${GIT_EMAIL:-ci@example.com}"
  git config user.name  "${GIT_NAME:-ci-bot}"
fi

# 4) package.json fields (no prepare)
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

# 5) tsconfig.json (if missing)
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

# 6) Install and build (prebuild dist for consumers)
npm pkg set devDependencies.typescript="^5" >/dev/null
npm install --silent
npm run build

# 7) Version stamp (strip old suffix)
STAMP="$(date -u +%Y%m%dT%H%M%S)"
SUFFIX="${STAMP}+${SPEC_HASH:0:8}"
BASE_VER="$(node -e "p=require('./package.json');v=p.version||'0.1.0';console.log(v.split('-')[0])")"
NEW_VER="${BASE_VER}-${SUFFIX}"
npm version "$NEW_VER" --no-git-tag-version >/dev/null

# 8) Commit and tag (keep dist tracked)
echo "$SPEC_HASH" > .spec-hash
printf '%s\n' 'node_modules' '.openapi-generator' 'openapitools.json' > .gitignore
git add -A
git commit -m "release: ${NEW_VER} (spec ${SPEC_HASH:0:12})" || true
git tag -a "v${NEW_VER}" -m "v${NEW_VER}"

# 9) Push
git fetch origin main || true
git push -u origin main --force || true
git push origin "v${NEW_VER}"

popd >/dev/null
echo "Released v${NEW_VER}"
echo "SDK available at: $REPO_SSH"
echo "Install with: npm install $PKG_NAME"
