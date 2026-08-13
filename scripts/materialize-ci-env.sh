#!/usr/bin/env bash
# Copy `.env.example` to `.env` / `.env.production` so Next and OpenNext see
# every documented variable. Overlay non-empty process env (GitHub secrets /
# Cloudflare Workers Builds variables).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [ ! -f .env.example ]; then
  echo "missing .env.example" >&2
  exit 1
fi

cp .env.example .env
cp .env.example .env.production

python3 - <<'PY'
import os
from pathlib import Path

example = Path(".env.example").read_text().splitlines()
keys = []
for line in example:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        continue
    key = stripped.split("=", 1)[0]
    if key:
        keys.append(key)

def overlay(path: Path, key: str, value: str) -> None:
    lines = path.read_text().splitlines()
    out = []
    found = False
    for line in lines:
        if line.startswith(f"{key}="):
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    path.write_text("\n".join(out) + "\n")

print("Build env presence (values never printed):")
for key in keys:
    val = os.environ.get(key, "")
    if val:
        overlay(Path(".env"), key, val)
        overlay(Path(".env.production"), key, val)
        print(f"  {key}=set")
    else:
        print(f"  {key}=example/default")

github_env = os.environ.get("GITHUB_ENV")
if github_env:
    with open(github_env, "a", encoding="utf-8") as out:
        for line in Path(".env").read_text().splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            key, _, value = stripped.partition("=")
            out.write(f"{key}<<ENV_EOF\n{value}\nENV_EOF\n")
PY
