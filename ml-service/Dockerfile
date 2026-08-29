FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1

# Build context is the repo root so /fixtures (cross-language parity data) is available.
COPY ml-service/pyproject.toml ./
COPY ml-service/app app
COPY ml-service/training training
# Dev extras installed too so `docker compose run ml_service pytest` works from the same image.
RUN pip install --no-cache-dir -e ".[dev]"

COPY ml-service/tests tests
COPY fixtures fixtures
COPY scripts scripts
RUN mkdir -p /app/models

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]