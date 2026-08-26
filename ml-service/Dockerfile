FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY pyproject.toml ./
COPY app app
# Dev extras installed too so `docker compose run ml_service pytest` works from the same image.
RUN pip install --no-cache-dir -e ".[dev]"

COPY tests tests

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]