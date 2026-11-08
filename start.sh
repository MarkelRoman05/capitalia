#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH"

if [ ! -d "dist/capitalia/browser" ]; then
  echo "Compilando frontend Angular 22..."
  npm run build
fi

if [ ! -d ".venv" ]; then
  echo "Creando entorno virtual Python..."
  uv venv .venv
  uv pip install --python .venv/bin/python -r requirements.txt
fi

export CAPITALIA_HOST="${CAPITALIA_HOST:-127.0.0.1}"
export CAPITALIA_PUERTO="${CAPITALIA_PUERTO:-8766}"
export CAPITALIA_NO_ABRIR=1

echo "Iniciando Capitalia en http://${CAPITALIA_HOST}:${CAPITALIA_PUERTO} ..."
exec ./.venv/bin/python -m backend
