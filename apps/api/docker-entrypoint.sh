#!/bin/sh
# Container entrypoint. The image is built from the repository root, so the
# hoisted node_modules live in /repo/node_modules; the Prisma CLI is called by
# path to avoid depending on npm's PATH handling.
set -e

echo "Applying database migrations..."
node /repo/node_modules/prisma/build/index.js migrate deploy

echo "Starting application..."
exec node dist/main
