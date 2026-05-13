.PHONY: check lint test build dev

# Run all checks (lint + types + tests)
check: lint test

lint:
	cd backend && uv run ruff check src tests
	cd backend && uv run ruff format --check src tests
	cd frontend && pnpm tsc --noEmit

test:
	cd backend && uv run pytest

build:
	pnpm tauri build

dev:
	pnpm tauri dev
