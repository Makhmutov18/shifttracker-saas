# Dockerfile for Railway — single container with FastAPI + React static files

# ─── Stage 1: Build Frontend ─────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ─── Stage 1b: Build Web Admin ─────────────────────────────────────────────
FROM node:20-alpine AS web-admin-builder

WORKDIR /app/web-admin
COPY web-admin/package*.json ./
RUN npm ci
COPY web-admin/ .
RUN npm run build

# ─── Stage 2: Build Backend ──────────────────────────────────────────────────
FROM python:3.12-slim AS backend-builder

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Stage 3: Final Image ────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Copy backend
COPY --from=backend-builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin
COPY backend/ .

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY --from=web-admin-builder /app/web-admin/dist /app/web-admin/dist

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
