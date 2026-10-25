.PHONY: all install db run ui ui-install ui-dev graph graph-dev warm-cache

install:
	pip install -r requirements.txt

warm-cache:
	python -m app.warm_cache

db:
	docker compose up -d

run:
	uvicorn app.main:app --reload

ui-install:
	cd frontend && npm install

ui: ui-install
	cd frontend && npm run build

ui-dev:
	cd frontend && npm run dev

# The React bundle used to be the graph alone; keep the old target names working.
graph: ui
graph-dev: ui-dev

all: db ui run
