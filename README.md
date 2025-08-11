docker-compose.yml →
When you run docker compose up -d, Docker pulls the Postgres image, creates a container, and starts a Postgres server.
The data is stored inside a Docker volume on your machine, so it persists even if the container stops.
Port mapping in docker-compose.yml makes the DB accessible from your host or other containers.

prisma migrate dev →
Reads your prisma/schema.prisma.
Generates SQL migrations for any schema changes.
Connects to the DB at DATABASE_URL (from .env).
Applies migrations there (creates/updates tables).
Also regenerates the Prisma Client automatically after migration.

prisma generate →
Reads prisma/schema.prisma (only for types, doesn’t touch DB).
Builds a typed Prisma Client in node_modules/@prisma/client.
That client has model types and CRUD methods matching your schema.
