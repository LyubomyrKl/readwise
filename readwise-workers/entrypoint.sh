#!/bin/bash
set -e

# Database migrations are applied by the gateway (prisma migrate deploy);
# the workers only need the generated client, which the image build provides.
echo "Starting workers..."
exec python main.py
