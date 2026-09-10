#!/usr/bin/env bash
# Count git-tracked source lines per bucket. Run before and after a cleanup.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
SKIP='(node_modules/|dist/|build/|coverage/|generated/|prisma/migrations/|\.d\.ts$)'
count() { # count <git pathspec>...  (git globs: * also matches "/")
  local files
  files=$(git ls-files -- "$@" | grep -vE "$SKIP" | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done || true)
  [ -z "$files" ] && { echo 0; return; }
  printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 cat | wc -l | tr -d ' '
}
be_src=$(count 'backend/*.ts' ':!backend/*.spec.ts' ':!backend/*.e2e-spec.ts')
be_test=$(count 'backend/*.spec.ts' 'backend/*.e2e-spec.ts')
fe_src=$(count 'src/*.ts' 'src/*.tsx' ':!src/*.test.ts' ':!src/*.test.tsx')
fe_test=$(count 'src/*.test.ts' 'src/*.test.tsx')
schema=$(count 'backend/prisma/schema.prisma')
kc=$(count 'keycloak-theme/*.ts' 'keycloak-theme/*.tsx' 'keycloak-theme/*.js')
all=$(count '*.ts' '*.tsx' '*.js' '*.jsx' '*.prisma' '*.css' '*.scss')
printf '%-24s %8s\n' \
  'backend src (non-test)' "$be_src"  'backend tests'  "$be_test" \
  'frontend src (non-test)' "$fe_src" 'frontend tests' "$fe_test" \
  'prisma schema' "$schema" 'keycloak-theme' "$kc" \
  'other' "$((all-be_src-be_test-fe_src-fe_test-schema-kc))" 'TOTAL' "$all"
