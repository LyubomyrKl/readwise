#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_SCHEMA="$SCRIPT_DIR/readwise-shared/prisma/schema.base.prisma"

echo "Syncing Prisma schemas from: $BASE_SCHEMA"

if [ ! -f "$BASE_SCHEMA" ]; then
    echo "Error: Base schema not found at $BASE_SCHEMA"
    exit 1
fi

# Extract models (everything from 'datasource db' onwards)
MODELS_CONTENT=$(sed -n '/^datasource db/,$p' "$BASE_SCHEMA")

# =====================================================
# Generate Gateway schema (JavaScript/TypeScript)
# =====================================================
GATEWAY_SCHEMA="$SCRIPT_DIR/readwise-gateway/prisma/schema.prisma"
echo "Generating Gateway schema: $GATEWAY_SCHEMA"

cat > "$GATEWAY_SCHEMA" << 'EOF'
// AUTO-GENERATED - Do not edit directly!
// Edit: readwise-shared/prisma/schema.base.prisma
// Then run: ./sync-prisma.sh

generator client {
  provider = "prisma-client-js"
}

EOF

echo "$MODELS_CONTENT" >> "$GATEWAY_SCHEMA"
echo "Gateway schema updated"

# =====================================================
# Generate Workers schema (Python)
# =====================================================
WORKERS_SCHEMA="$SCRIPT_DIR/readwise-workers/schema.prisma"
echo "Generating Workers schema: $WORKERS_SCHEMA"

cat > "$WORKERS_SCHEMA" << 'EOF'
// AUTO-GENERATED - Do not edit directly!
// Edit: readwise-shared/prisma/schema.base.prisma
// Then run: ./sync-prisma.sh

generator client {
  provider             = "prisma-client-py"
  recursive_type_depth = "5"
}

EOF

echo "$MODELS_CONTENT" >> "$WORKERS_SCHEMA"
echo "Workers schema updated"

echo ""
echo "All schemas synced!"
echo ""
echo "Next steps:"
echo "  1. cd readwise-gateway && npx prisma generate"
echo "  2. cd readwise-workers && prisma generate"
echo "  3. Create a migration: cd readwise-gateway && npx prisma migrate dev --name <change>"
