# bdt-cutting-plan-service

Stateless parser for plate nesting reports (.txt). bdt-app's `cutting-plan`
module (`backend/src/modules/cutting-plan/cutting-plan-api.client.ts`) uploads
the files and stores the JSON it returns.

- Cloud Run service `bdt-cutting-plan-service` (asia-northeast1), IAM only:
  callers send a Google ID token. API: `docs/api.md`, `openapi.yaml`.
- Python 3.12 (was 3.10 before the move; numpy<2.0 caps it at 3.12), Functions Framework (entry point `process_cuttingplan` in `main.py`).
- Deploy: `.github/workflows/deploy-cutting-plan.yml` on push to `staging` touching this folder
  (tests → Docker image → Cloud Run, min 0 / max 2, 1 vCPU, 1Gi, concurrency 1, IAM only).
- Moved here 2026-11-06 from `RuthW-Ssi/bdt-cutting-plan-system` (main @ 0772652);
  earlier history stays in that repo.

## Local

```sh
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -q
python -m functions_framework --target=process_cuttingplan --debug --port=8080
```
