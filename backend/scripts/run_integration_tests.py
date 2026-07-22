from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = REPO_ROOT / "docker-compose.test.yml"


def run(command: list[str], *, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, cwd=REPO_ROOT, env=env, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run PostgreSQL integration tests from the repository root")
    parser.add_argument("--repeat", type=int, default=1, choices=range(1, 6))
    parser.add_argument("--external", action="store_true", help="Use an existing TEST_DATABASE_URL; do not manage Docker")
    parser.add_argument("--keep", action="store_true", help="Keep the Docker test service running")
    args = parser.parse_args()

    env = os.environ.copy()
    if args.external:
        if not env.get("TEST_DATABASE_URL"):
            raise SystemExit("--external requires TEST_DATABASE_URL")
        manages_docker = False
    else:
        docker = shutil.which("docker")
        if not docker:
            raise SystemExit(
                "Docker is not available. Install/start Docker, or pass --external with an isolated TEST_DATABASE_URL."
            )
        manages_docker = True
        port = env.get("SHIFTTRACKER_TEST_POSTGRES_PORT", "55432")
        env.setdefault(
            "TEST_DATABASE_URL",
            f"postgresql+asyncpg://shifttracker_test:shifttracker_test_only@127.0.0.1:{port}/shifttracker_test",
        )
        run([docker, "compose", "-f", str(COMPOSE_FILE), "up", "-d", "--wait"])

    try:
        for attempt in range(1, args.repeat + 1):
            print(f"PostgreSQL integration run {attempt}/{args.repeat}")
            run([sys.executable, "-m", "pytest", "backend/tests/integration", "-q"], env=env)
    finally:
        if manages_docker and not args.keep:
            docker = shutil.which("docker")
            if docker:
                run([docker, "compose", "-f", str(COMPOSE_FILE), "down", "-v"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
