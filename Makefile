.PHONY: setup build install release clean dev test lint docker help

# Default target
help:
	@echo "FlowSight AI - Development Commands"
	@echo "==================================="
	@echo ""
	@echo "Setup & Development:"
	@echo "  setup          Install dependencies and setup environment"
	@echo "  dev            Start development servers"
	@echo "  clean          Clean build artifacts"
	@echo ""
	@echo "Building:"
	@echo "  build          Build all packages"
	@echo "  build:agent    Build only the agent"
	@echo "  build:dashboard Build only the dashboard"
	@echo ""
	@echo "Testing & Quality:"
	@echo "  test           Run all tests"
	@echo "  lint           Run linting"
	@echo "  type-check     Run TypeScript type checking"
	@echo ""
	@echo "Release:"
	@echo "  release        Build and publish release"
	@echo "  install        Install locally for testing"
	@echo ""
	@echo "Docker:"
	@echo "  docker         Build Docker image"
	@echo ""
	@echo "Dependencies:"
	@echo "  setup:ocr      Install OCR dependencies (PaddleOCR)"
	@echo "  download:models Download AI models"
	@echo ""

# Setup environment
setup:
	npm install
	npm run setup:ocr
	npm run download:models

# Development
dev:
	turbo dev

dev:agent:
	pnpm --filter @flowsight/agent dev

dev:dashboard:
	pnpm --filter @flowsight/dashboard dev

# Building
build:
	turbo build

build:agent:
	pnpm --filter @flowsight/agent build

build:dashboard:
	pnpm --filter @flowsight/dashboard build

# Testing
test:
	turbo test

lint:
	turbo lint

type-check:
	turbo type-check

# Release
release: build
	npm run publish:electron
	npm run publish:models

install: build
	@echo "Installing FlowSight locally..."
	@if [ "$$(uname)" = "Darwin" ]; then \
		echo "macOS detected - installing to Applications"; \
		cp -r apps/agent/dist-electron/mac/FlowSight.app /Applications/ 2>/dev/null || echo "Manual install required"; \
	elif [ "$$(uname)" = "Linux" ]; then \
		echo "Linux detected - installing to /usr/local/bin"; \
		sudo cp apps/agent/dist-electron/linux-unpacked/flowsight /usr/local/bin/ 2>/dev/null || echo "Manual install required"; \
	else \
		echo "Windows detected - run installer.exe"; \
	fi

# Docker
docker:
	docker build -t flowsight-agent .
	docker run -it flowsight-agent

# Dependencies
setup:ocr:
	pip3 install paddlepaddle paddleocr

download:models:
	node scripts/download-models.js phi3-mini llava-phi

# Cleanup
clean:
	rm -rf node_modules
	rm -rf apps/*/node_modules
	rm -rf apps/*/dist
	rm -rf apps/*/dist-electron
	rm -rf packages/*/node_modules
	rm -rf .turbo
	rm -rf temp

# Health checks
health:
	@echo "Checking system health..."
	@command -v node >/dev/null 2>&1 && echo "✅ Node.js installed" || echo "❌ Node.js not found"
	@command -v pnpm >/dev/null 2>&1 && echo "✅ pnpm installed" || echo "❌ pnpm not found"
	@command -v python3 >/dev/null 2>&1 && echo "✅ Python3 installed" || echo "❌ Python3 not found"
	@python3 -c "import paddleocr" 2>/dev/null && echo "✅ PaddleOCR installed" || echo "❌ PaddleOCR not found"
	@ollama list >/dev/null 2>&1 && echo "✅ Ollama running" || echo "❌ Ollama not running"
	@echo ""
	@echo "Run 'make setup' to install missing dependencies"

# Version info
version:
	@echo "FlowSight AI v1.0.0"
	@node --version
	@pnpm --version
	@python3 --version




