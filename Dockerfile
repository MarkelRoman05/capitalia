FROM node:22-slim AS frontend-builder
WORKDIR /build
COPY package.json package-lock.json angular.json tsconfig.json tsconfig.app.json ./
RUN npm ci
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CAPITALIA_HOST=0.0.0.0 \
    CAPITALIA_PUERTO=8766 \
    CAPITALIA_NO_ABRIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY demo/ ./demo/
COPY --from=frontend-builder /build/dist/capitalia/browser ./dist/capitalia/browser

RUN useradd -u 1001 -m -s /usr/sbin/nologin capitalia \
    && mkdir -p /app/datos \
    && chown -R capitalia:capitalia /app

USER capitalia
EXPOSE 8766

CMD ["python", "-m", "backend"]
