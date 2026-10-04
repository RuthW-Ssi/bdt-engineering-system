# prod-scheduler (FastAPI) — Cloud Run image, built by .github/workflows/deploy-scheduler.yml.
# Python 3.13 matches the tested backend-schedule/.venv. No DDL / migrations here: Prisma owns the schema.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --system --uid 10001 --no-create-home scheduler
USER scheduler

EXPOSE 8080
# exec: uvicorn becomes PID 1 and receives Cloud Run's SIGTERM directly
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
