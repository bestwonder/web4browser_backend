#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "${SCRIPT_DIR}/.env" ]; then
  while IFS= read -r line || [ -n "${line}" ]; do
    case "${line}" in
      ''|'#'*)
        continue
        ;;
    esac

    key="${line%%=*}"
    value="${line#*=}"
    export "${key}=${value}"
  done < "${SCRIPT_DIR}/.env"
fi

cd "${SCRIPT_DIR}"
exec node "${SCRIPT_DIR}/server.mjs"
