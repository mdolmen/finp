.PHONY: check lint test build dev install-hooks

# Full CI gate: lint → tests → frontend build
check: lint test
	cd frontend && pnpm build

lint:
	cd backend && uv run ruff check src tests
	cd backend && uv run ruff format --check src tests
	cd frontend && pnpm tsc --noEmit
	cd frontend && pnpm lint

test:
	cd backend && uv run pytest

build:
	pnpm tauri build

dev:
	pnpm tauri dev

# Point git at the versioned hooks directory (run once after cloning)
install-hooks:
	git config core.hooksPath hooks
	@echo "Hooks installed."
