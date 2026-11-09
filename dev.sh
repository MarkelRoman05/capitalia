#!/usr/bin/env bash
# Desarrollo: backend Flask + frontend Angular con recarga en caliente.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PWD/node_modules/.bin:$PATH"

if [ ! -d ".venv" ]; then
  uv venv .venv
  uv pip install --python .venv/bin/python -r requirements.txt
fi

export CAPITALIA_HOST="${CAPITALIA_HOST:-127.0.0.1}"
export CAPITALIA_PUERTO="${CAPITALIA_PUERTO:-8766}"
export CAPITALIA_NO_ABRIR=1

./.venv/bin/python -m backend &
BACK=$!
trap 'kill "$BACK" 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM

sleep 1
kill -0 "$BACK" || { echo "El backend no ha arrancado (¿puerto $CAPITALIA_PUERTO ocupado?)"; exit 1; }

ng serve --proxy-config proxy.conf.json
