FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y gcc libpq-dev curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app
RUN addgroup --gid 1001 appgroup && adduser --uid 1001 --gid 1001 --no-create-home appuser
USER appuser
EXPOSE 8005
HEALTHCHECK --interval=30s --timeout=10s CMD curl -f http://localhost:8005/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005", "--workers", "2"]
