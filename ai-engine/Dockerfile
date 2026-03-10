FROM python:3.11-slim AS base
WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS builder
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM base AS runner
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
COPY . .

# Download spaCy model
RUN python -m spacy download en_core_web_sm || true

RUN addgroup --gid 1001 appgroup && adduser --uid 1001 --gid 1001 --no-create-home appuser
USER appuser

EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:8001/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", \
     "--workers", "4", "--loop", "uvloop", "--http", "httptools"]
