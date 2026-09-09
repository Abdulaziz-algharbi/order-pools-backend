#!/usr/bin/env sh
# Generates a self-signed TLS cert for LOCAL/DEV use only, so nginx has
# something to terminate HTTPS with. Never used for real deployments —
# swap in a real certificate (e.g. Let's Encrypt/certbot) once there's an
# actual domain to serve, and never commit either cert or key to git
# (see the sibling .gitignore entry).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$DIR/privkey.pem" ] && [ -f "$DIR/fullchain.pem" ]; then
  echo "Dev cert already exists at $DIR — remove privkey.pem/fullchain.pem first to regenerate."
  exit 0
fi

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$DIR/privkey.pem" \
  -out "$DIR/fullchain.pem" \
  -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Dev cert generated: $DIR/fullchain.pem + $DIR/privkey.pem"
