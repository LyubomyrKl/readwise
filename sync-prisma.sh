#!/bin/bash
# Regenerates the Prisma schema copies from the single source of truth.
#   source:  apps/api/prisma/schema.base.prisma
#   outputs: apps/api/prisma/schema.prisma (Prisma JS), apps/workers/schema.prisma (Prisma Python)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_SCHEMA="$SCRIPT_DIR/apps/api/prisma/schema.base.prisma"

echo "Syncing Prisma schemas from: $BASE_SCHEMA"

if [ ! -f "$BASE_SCHEMA" ]; then
    echo "Error: Base schema not found at $BASE_SCHEMA"
    exit 1
fi

# Everything from 'datasource db' onwards (models, enums, datasource)
MODELS_CONTENT=$(sed -n '/^datasource db/,$p' "$BASE_SCHEMA")

API_SCHEMA="$SCRIPT_DIR/apps/api/prisma/schema.prisma"
echo "Generating API schema: $API_SCHEMA"
cat > "$API_SCHEMA" << 'HDR'
// AUTO-GENERATED - Do not edit directly!
// Edit: apps/api/prisma/schema.base.prisma
// Then run: ./sync-prisma.sh

generator client {
  provider = "prisma-client-js"
}

HDR
echo "$MODELS_CONTENT" >> "$API_SCHEMA"

WORKERS_SCHEMA="$SCRIPT_DIR/apps/workers/schema.prisma"
echo "Generating workers schema: $WORKERS_SCHEMA"
cat > "$WORKERS_SCHEMA" << 'HDR'
// AUTO-GENERATED - Do not edit directly!
// Edit: apps/api/prisma/schema.base.prisma
// Then run: ./sync-prisma.sh

generator client {
  provider             = "prisma-client-py"
  recursive_type_depth = "5"
}

HDR
echo "$MODELS_CONTENT" >> "$WORKERS_SCHEMA"

echo ""
echo "All schemas synced. Next steps:"
echo "  1. cd apps/api && npx prisma generate"
echo "  2. cd apps/workers && prisma generate"
echo "  3. Create a migration: cd apps/api && npx prisma migrate dev --name <change>"
