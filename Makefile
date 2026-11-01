.PHONY: install test demo collect report

install:
	pip install -e ".[dev,db]"

test:
	python -m pytest -q

# Runs offline: no keys, no database. Reads data/snapshot/.
demo:
	python -m assayer.demo

# Needs FINNHUB_KEY (and DATABASE_URL to write to Postgres).
collect:
	python -m assayer.collect.reference

# Thesis charts and numbers. Built from day 7 onward.
report:
	@echo "report: not built yet (planned for day 7 onward)"; exit 1
