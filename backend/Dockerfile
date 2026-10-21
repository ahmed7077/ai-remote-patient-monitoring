FROM python:3.12-slim
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=100 \
    PIP_RETRIES=5
WORKDIR /app
COPY pyproject.toml .
COPY constraints.txt .
COPY app app
COPY alembic alembic
COPY alembic.ini .
RUN pip install --no-cache-dir --constraint constraints.txt .
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
