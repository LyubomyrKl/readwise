# Summarizer Infrastructure

This repository contains the Docker infrastructure setup for the Summarizer application, including PostgreSQL database and MinIO object storage.

## Services

### PostgreSQL Database

- **Image**: postgres:16
- **Container**: summarizer-db
- **Port**: 5432
- **Database**: appdb
- **Credentials**: postgres/postgres
### MinIO Object Storage

- **Image**: minio/minio:latest
- **Container**: summarizer-minio
- **API Port**: 9000
- **Console Port**: 9001
- **Credentials**: minioadmin/minioadmin

## Quick Start

1. **Start all services**:

   ```bash
   docker compose up -d
   ```

2. **Check service status**:

   ```bash
   docker compose ps
   ```

3. **View logs**:
   ```bash
   docker compose logs -f
   ```

## Access Points

- **MinIO Console**: http://localhost:9001
- **MinIO API**: http://localhost:9000
- **PostgreSQL**: localhost:5432
- **Application** (if running): http://localhost:8000

## Database Management

If you have Prisma configured in your main application:

```bash
npx prisma studio
```

## Useful Commands

- **Stop services**: `docker compose down`
- **Restart services**: `docker compose restart`
- **View service logs**: `docker compose logs [service_name]`
- **Remove everything**: `docker compose down -v` (⚠️ This will delete all data)

## Data Persistence

- PostgreSQL data is stored in the `pg` volume
- MinIO data is stored in the `minio_data` volume

Both volumes will persist data between container restarts.
