#!/bin/sh
set -e
echo "Waiting for Postgres to be ready..."
while ! nc -z postgres 5432; do
  sleep 1
done

echo "Postgres is up - applying migrations"
python3 manage.py makemigrations
python3 manage.py migrate

# Execute the CMD from Dockerfile (Daphne)
exec "$@"