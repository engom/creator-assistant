# Omicron Creator Agent — project task runner
#
# Usage:  make <target>
#         make help           list all targets
#         make install        first-time setup
#         make serve          start the API (hot-reload)
#         make test           run the test suite
#         make lint           check + auto-fix + format
#         make compile-insight  compile the insight-agent
#
# Variables you can override on the command line:
#   MODEL         LiteLLM model string    (default: LLM_MODEL from .env, else anthropic/claude-sonnet-4-6)
#   EFFORT        MIPROv2 effort level    light | medium | heavy  (default: light)
#   TRAIN_FRAC    train/val split ratio   (default: 0.7)
#
# Example:
#   make compile-insight EFFORT=medium
#   make compile-insight MODEL=anthropic/claude-opus-4-8 EFFORT=heavy

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

PYTHON     := .venv/bin/python
# PY always sets PYTHONPATH=app so the omicron_agent_kit package is importable
# in every subprocess (uvicorn reloader, pytest workers, compile scripts).
PY         := PYTHONPATH=app $(PYTHON)
RUFF       := .venv/bin/ruff

SRC_DIRS   := app/ scripts/ tests/

PYTEST     := API_KEYS=test-key $(PY) -m pytest

_ENV_MODEL  := $(shell grep -E '^LLM_MODEL=' .env 2>/dev/null | cut -d= -f2- | tr -d ' \r')
MODEL       ?= $(if $(_ENV_MODEL),$(_ENV_MODEL),anthropic/claude-sonnet-4-6)
EFFORT      ?= light
TRAIN_FRAC  ?= 0.7

INSIGHT_EXAMPLES  := data/examples/insight_agent.jsonl
INSIGHT_ARTIFACT  := data/compiled/insight_agent.json

# --------------------------------------------------------------------------- #
# Shared compile recipe — call as $(call compile-agent,AGENT,EXAMPLES,ARTIFACT)
# --------------------------------------------------------------------------- #

define compile-agent
$(PY) scripts/compile.py \
  --agent     $(1) \
  --examples  $(2) \
  --output    $(3) \
  --model     $(MODEL) \
  --effort    $(EFFORT) \
  --train-fraction $(TRAIN_FRAC)
endef

# --------------------------------------------------------------------------- #
# Frontend config
# --------------------------------------------------------------------------- #

NPM           := npm
FRONTEND      := frontend
FRONTEND_PORT := 5173
BACKEND_PORT  := 8000
COMPOSE       := docker compose --project-directory . -f docker/docker-compose.yml
COMPOSE_FILE  := docker/docker-compose.yml

# EC2 instance ID — read from Terraform output if available, else override on CLI:
#   make tunnel EC2_INSTANCE_ID=i-0abc123
EC2_INSTANCE_ID ?= $(shell cd infra/ec2 && terraform output -raw instance_id 2>/dev/null)
AWS_REGION      ?= eu-west-3

# E2E_API_KEY is read from E2E_API_KEY= in .env (a dedicated test key, not API_KEYS).
E2E_API_KEY      ?= $(shell grep -E '^E2E_API_KEY=' .env 2>/dev/null | cut -d= -f2- | tr -d ' \r')
E2E_BASE_URL     ?= http://localhost:$(BACKEND_PORT)
E2E_FRONTEND_URL ?= http://localhost:$(FRONTEND_PORT)

# --------------------------------------------------------------------------- #
# Phony declarations
# --------------------------------------------------------------------------- #

.PHONY: help \
        install install-% install-frontend install-all \
        serve serve-mcp tunnel e2e-ec2 db-init db-start db-stop \
        dev dev-backend dev-frontend dev-all \
        test test-v test-one \
        e2e e2e-live _e2e-run-and-stop \
        lint fmt check \
        compile-insight recompile-insight \
        clean clean-compiled clean-cache frontend-build \
        sync-env

# --------------------------------------------------------------------------- #
# Help
# --------------------------------------------------------------------------- #

help:                              ## Show this help
	@grep -E '^[a-zA-Z_%/-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

# --------------------------------------------------------------------------- #
# Setup
# --------------------------------------------------------------------------- #

.venv:
	uv venv

install: .venv                     ## First-time setup: venv + dev deps + .env stub
	uv pip install -e ".[dev]"
	@if [ ! -f .env ]; then \
	  cp .env.example .env; \
	  echo "  → .env created from .env.example — fill in credentials before running agents"; \
	fi

install-%: .venv                   ## Install an optional extra, e.g. make install-mcp
	uv pip install -e ".[$*]"

install-frontend:                  ## Install frontend npm dependencies
	cd $(FRONTEND) && $(NPM) install

install-all: .venv                 ## Install Python + frontend deps in parallel
	@$(MAKE) -j2 install install-frontend

# --------------------------------------------------------------------------- #
# Run
# --------------------------------------------------------------------------- #

serve:                             ## Start the API with hot-reload on :8000
	$(PY) -m uvicorn omicron_agent_kit.api.main:app --reload --port $(BACKEND_PORT)

serve-mcp:                         ## Start the MCP adapter (requires .[mcp] and API running)
	$(PY) -m omicron_agent_kit.mcp.server

tunnel:                            ## Forward localhost:8000 → EC2:8000 via SSM (no SSH needed)
	@if [ -z "$(EC2_INSTANCE_ID)" ]; then \
	  echo "  ✗ EC2_INSTANCE_ID not set. Run: make tunnel EC2_INSTANCE_ID=i-xxxx"; exit 1; \
	fi
	@echo "  → Forwarding localhost:$(BACKEND_PORT) → EC2 $(EC2_INSTANCE_ID):$(BACKEND_PORT)"
	@echo "  → Press Ctrl-C to stop the tunnel"
	aws ssm start-session \
	  --target "$(EC2_INSTANCE_ID)" \
	  --region "$(AWS_REGION)" \
	  --document-name AWS-StartPortForwardingSession \
	  --parameters '{"portNumber":["$(BACKEND_PORT)"],"localPortNumber":["$(BACKEND_PORT)"]}'

sync-env:                          ## Push .env secrets to SSM + hot-reload API container on EC2
	@if [ -z "$(EC2_INSTANCE_ID)" ]; then \
	  echo "  ✗ EC2_INSTANCE_ID not set. Run: make sync-env EC2_INSTANCE_ID=i-xxxx"; exit 1; \
	fi
	@echo "  → Pushing secrets from .env to SSM Parameter Store (/pubiq/*)..."
	@_push() { \
	    local name="$$1" val="$$2"; \
	    if [ -z "$$val" ] || [ "$$val" = "CHANGE_ME" ]; then return; fi; \
	    aws ssm put-parameter --region "$(AWS_REGION)" \
	        --name "/pubiq/$$name" --type SecureString \
	        --value "$$val" --overwrite > /dev/null; \
	    echo "    ✓ /pubiq/$$name"; \
	  }; \
	  _env() { grep -E "^$$1=" .env 2>/dev/null | cut -d= -f2- | tr -d '\r'; }; \
	  _push API_KEYS             "$$(_env API_KEYS)"; \
	  _push TIKTOK_CLIENT_ID     "$$(_env TIKTOK_CLIENT_ID)"; \
	  _push TIKTOK_CLIENT_SECRET "$$(_env TIKTOK_CLIENT_SECRET)"; \
	  _push TIKTOK_REDIRECT_URI  "$$(_env TIKTOK_REDIRECT_URI)"; \
	  _push JWT_SECRET           "$$(_env JWT_SECRET)"; \
	  _push POSTGRES_USER        "$$(_env POSTGRES_USER)"; \
	  _push POSTGRES_PASSWORD    "$$(_env POSTGRES_PASSWORD)"; \
	  _push POSTGRES_DB          "$$(_env POSTGRES_DB)"; \
	  for plain_var in CORS_ORIGINS LLM_MODEL; do \
	    val="$$(_env $$plain_var)"; \
	    if [ -n "$$val" ]; then \
	      aws ssm put-parameter --region "$(AWS_REGION)" \
	          --name "/pubiq/$$plain_var" --type String \
	          --value "$$val" --overwrite > /dev/null; \
	      echo "    ✓ /pubiq/$$plain_var"; \
	    fi; \
	  done; \
	  aws ssm put-parameter --region "$(AWS_REGION)" \
	      --name "/pubiq/AWS_REGION" --type String \
	      --value "$(AWS_REGION)" --overwrite > /dev/null; \
	  echo "    ✓ /pubiq/AWS_REGION"
	@echo "  → Updating /opt/pubiq/.env on EC2..."
	@aws ssm send-command \
	    --region "$(AWS_REGION)" \
	    --instance-ids "$(EC2_INSTANCE_ID)" \
	    --document-name AWS-RunShellScript \
	    --parameters 'commands=["set -e","cd /opt/pubiq","for param in API_KEYS TIKTOK_CLIENT_ID TIKTOK_CLIENT_SECRET TIKTOK_REDIRECT_URI JWT_SECRET POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB CORS_ORIGINS LLM_MODEL AWS_REGION; do val=$$(aws ssm get-parameter --region eu-west-3 --name \"/pubiq/$$param\" --with-decryption --query Parameter.Value --output text 2>/dev/null) || continue; grep -q \"^$$param=\" .env && sed -i \"s|^$$param=.*|$$param=$$val|\" .env || echo \"$$param=$$val\" >> .env; done","docker compose --project-directory /opt/pubiq -f docker/docker-compose.yml up -d --force-recreate api","echo done"]' \
	    --comment "sync-env from Makefile" \
	    --output text --query Command.CommandId
	@echo "  → Container restarting with updated env (check: make tunnel then curl localhost:8000/health)"

e2e-ec2: tunnel &                  ## Run e2e tests against EC2 (starts tunnel in background, waits, runs, kills)
	@echo "  → Waiting for tunnel on :$(BACKEND_PORT)..."
	@for i in $$(seq 1 20); do \
	  curl -sf http://localhost:$(BACKEND_PORT)/health > /dev/null 2>&1 && break; \
	  sleep 0.5; \
	done
	E2E_BASE_URL=http://localhost:$(BACKEND_PORT) E2E_API_KEY=$(E2E_API_KEY) \
	  $(PYTEST) tests/test_e2e.py -v; \
	kill %1 2>/dev/null || true

db-start:                          ## Start Postgres via docker compose
	$(COMPOSE) up -d postgres

db-stop:                           ## Stop Postgres via docker compose
	$(COMPOSE) stop postgres

# Stamp-file: re-applies only when schema.sql is newer than the stamp.
# Safe to re-run unconditionally (all DDL is IF NOT EXISTS).
.db-schema-applied: app/omicron_agent_kit/db/schema.sql
	$(COMPOSE) exec -T postgres \
	  psql -U postgres -d omicron < $<
	@touch $@

db-init: .db-schema-applied        ## Apply schema.sql to Postgres (skips if schema is current)

# Aliases used in e2e and dev workflows
dev-backend: serve                 ## Alias: start backend (same as serve)

dev-frontend:                      ## Start frontend Vite dev server on :5173
	cd $(FRONTEND) && $(NPM) run dev

dev-all:                           ## Start backend + frontend in parallel (requires make 4.x)
	@echo "  → Starting backend on :$(BACKEND_PORT) and frontend on :$(FRONTEND_PORT)"
	@$(MAKE) -j2 dev-backend dev-frontend

frontend-build:                    ## Build frontend for production (dist/)
	cd $(FRONTEND) && $(NPM) run build

# --------------------------------------------------------------------------- #
# Test
# --------------------------------------------------------------------------- #

test:                              ## Run unit test suite (no server/LLM required)
	$(PYTEST) tests/ -q --ignore=tests/test_e2e.py

test-v:                            ## Run unit tests with verbose output
	$(PYTEST) tests/ -v --ignore=tests/test_e2e.py

test-one:                          ## Run one test: make test-one T=tests/test_health.py::name
	$(PYTEST) $(T) -v

# --------------------------------------------------------------------------- #
# E2E tests — require a running backend (and optionally a running frontend)
# --------------------------------------------------------------------------- #

e2e: _e2e-start-postgres _e2e-start-backend _e2e-wait _e2e-run-and-stop  ## Start postgres+backend, run e2e, stop backend (server always cleaned up)

# Ensure Postgres is up (idempotent — docker compose up is safe if already running)
_e2e-start-postgres:
	@echo "  → Ensuring Postgres is up…"
	$(COMPOSE) up -d postgres
	@$(COMPOSE) exec -T postgres \
	  sh -c 'until pg_isready -U postgres; do sleep 0.5; done' > /dev/null 2>&1
	@echo "  → Postgres is ready"

# Start backend in background, write PID to .e2e-server.pid
_e2e-start-backend:
	@echo "  → Starting backend on :$(BACKEND_PORT) for e2e tests…"
	@PYTHONPATH=app API_KEYS="$(E2E_API_KEY)" \
	  $(PYTHON) -m uvicorn omicron_agent_kit.api.main:app \
	    --port $(BACKEND_PORT) --host 127.0.0.1 --no-access-log \
	  & echo $$! > .e2e-server.pid
	@echo "  → Backend PID $$(cat .e2e-server.pid)"

# Wait until /health responds — 60 iterations × 0.5 s = 30 s ceiling
_e2e-wait:
	@echo "  → Waiting for backend to be ready…"
	@for i in $$(seq 1 60); do \
	   curl -sf $(E2E_BASE_URL)/health > /dev/null 2>&1 \
	     && echo "  → Backend is ready" && exit 0; \
	   sleep 0.5; \
	 done; \
	 echo "  ✗ Backend did not start in 30 s"; \
	 cat .e2e-server.pid | xargs kill 2>/dev/null; exit 1

# Run e2e tests and always stop backend afterwards (pass or fail)
_e2e-run-and-stop:
	@set +e; \
	 E2E_BASE_URL=$(E2E_BASE_URL) E2E_API_KEY=$(E2E_API_KEY) \
	   $(PYTEST) tests/test_e2e.py -v; \
	 RESULT=$$?; \
	 if [ -f .e2e-server.pid ]; then \
	   kill $$(cat .e2e-server.pid) 2>/dev/null || true; \
	   rm -f .e2e-server.pid; \
	   echo "  → Backend stopped"; \
	 fi; \
	 exit $$RESULT

e2e-live:                          ## Run e2e against already-running backend (port 8000)
	E2E_BASE_URL=$(E2E_BASE_URL) E2E_API_KEY=$(E2E_API_KEY) \
	  $(PYTEST) tests/test_e2e.py -v

# --------------------------------------------------------------------------- #
# Lint & format  (ruff replaces black + isort + flake8)
# --------------------------------------------------------------------------- #

lint:                              ## Auto-fix lint issues then reformat
	$(RUFF) check $(SRC_DIRS) --fix
	$(RUFF) format $(SRC_DIRS)

fmt: lint                          ## Alias for lint

check:                             ## Lint check only — no writes, exit 1 on violations (CI)
	$(RUFF) check $(SRC_DIRS)
	$(RUFF) format $(SRC_DIRS) --check

# --------------------------------------------------------------------------- #
# Compile (offline MIPROv2 optimisation — requires live LLM credentials)
# --------------------------------------------------------------------------- #

data/compiled:
	@mkdir -p $@

$(INSIGHT_ARTIFACT): $(INSIGHT_EXAMPLES) | data/compiled
	$(call compile-agent,insight-agent,$(INSIGHT_EXAMPLES),$(INSIGHT_ARTIFACT))

compile-insight: $(INSIGHT_ARTIFACT)  ## Compile the insight-agent (skips if artifact is current)
	@echo "  → insight-agent artifact: $(INSIGHT_ARTIFACT)"

recompile-insight:                 ## Force-recompile the insight-agent (ignores existing artifact)
	$(call compile-agent,insight-agent,$(INSIGHT_EXAMPLES),$(INSIGHT_ARTIFACT))
	@echo "  → insight-agent artifact: $(INSIGHT_ARTIFACT)"

# --------------------------------------------------------------------------- #
# Clean
# --------------------------------------------------------------------------- #

clean-compiled:                    ## Remove compiled DSPy artifacts (triggers fresh compile)
	rm -f $(INSIGHT_ARTIFACT)
	@echo "  → compiled artifacts removed"

clean-cache:                       ## Remove Python bytecode and pytest caches
	find . -type d \( -name __pycache__ -o -name .pytest_cache \) \
	  -not -path "./.venv/*" -exec rm -rf {} + 2>/dev/null || true
	@echo "  → caches cleared"
	rm -rf .mypy_cache 2>/dev/null || true
	rm -rf .ruff_cache 2>/dev/null || true

clean: clean-cache clean-compiled  ## Remove caches and compiled artifacts (keeps .venv)
	rm -f .e2e-server.pid .db-schema-applied
