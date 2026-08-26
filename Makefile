COMPOSE := docker compose

.PHONY: up down logs smoke test lint seed train demo

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f

smoke:
	./scripts/smoke_test.sh

test:
	docker compose run --rm -v /var/run/docker.sock:/var/run/docker.sock java_gateway ./mvnw test && \
	docker compose run --rm ml_service pytest && \
	docker compose run --rm frontend bun run test

lint:
	$(COMPOSE) run --rm java_gateway ./mvnw checkstyle:check && \
	docker compose run --rm ml_service ruff check app training tests && \
	$(COMPOSE) run --rm frontend bun run lint

# Phase 6: bot simulator + human session recorder.
seed:
	@echo "Phase 6: 'make seed' not implemented yet"

# Phase 2/6: train + register a model from seeded data.
train:
	@echo "Phase 2: 'make train' not implemented yet"

demo: up seed train
	@echo "Stack is up, seeded, and trained — ready to demo."