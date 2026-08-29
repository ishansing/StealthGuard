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
	docker compose run --rm -v /var/run/docker.sock:/var/run/docker.sock java-gateway ./mvnw test && \
	docker compose run --rm ml-service pytest && \
	docker compose run --rm frontend bun run test

lint:
	$(COMPOSE) run --rm java-gateway ./mvnw checkstyle:check && \
	docker compose run --rm ml-service ruff check app training tests && \
	$(COMPOSE) run --rm frontend bun run lint

# Phase 6: bot simulator + human session recorder (writes CSV + populates DB).
seed:
	cd scripts/bot-sim && bun run seed --human 5 --naive 3 --jitter 2 --out out --demo http://localhost:5173 --gateway http://localhost:8080

# Phase 2/6: train + register a model from seeded data, then reload the ML service.
train:
	$(COMPOSE) run --rm -v ./scripts/bot-sim/out:/data:ro ml-service python -m training.train --data /data/sessions.csv --output-dir /app/models --version v1 --register-db
	$(COMPOSE) restart ml-service

# Phase 8: fold reviewer feedback into training; save a shadow model + report.
retrain:
	$(COMPOSE) run --rm -v ./scripts:/scripts:ro -v ./scripts/bot-sim/out:/data ml-service python /scripts/retrain_from_feedback.py --data /data/sessions.csv --models-dir /app/models --report /data/retrain-report.md

# Phase 8: optional Prometheus + Grafana overlay (docker-compose.observability.yml).
observability:
	$(COMPOSE) -f docker-compose.yml -f docker-compose.observability.yml up -d prometheus grafana

demo: up seed train
	@echo "Stack is up, seeded, and trained — ready to demo."