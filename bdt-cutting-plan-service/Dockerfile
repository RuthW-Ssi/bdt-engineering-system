# bdt-cutting-plan-service (Functions Framework) — Cloud Run image, built by
# .github/workflows/deploy-cutting-plan.yml. Python 3.12: newest that numpy<2.0
# (requirements.txt) supports; 3.10, its runtime before the move, is EOL.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./

# The ETL writes each request's files under ./data (cwd), so the app user owns it;
# a home dir too, or gunicorn's control server fails to start (Errno 13).
RUN useradd --system --uid 10001 --create-home cuttingplan \
    && mkdir data && chown cuttingplan data
USER cuttingplan

EXPOSE 8080
# exec: functions-framework becomes PID 1 and receives Cloud Run's SIGTERM directly
CMD ["sh", "-c", "exec functions-framework --target=process_cuttingplan --host 0.0.0.0 --port ${PORT:-8080}"]
