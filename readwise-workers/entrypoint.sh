#!/bin/bash
set -e

echo "Pushing Prisma schema to database..."
prisma db push --skip-generate

echo "Starting workers..."
exec python main.py
