.PHONY: install test demo collect report

install:
	pip install -e ".[dev,db]"

test:
	python -m pytest -q

# Runs offline: no keys, no database. Reads data/snapshot/.
demo:
	python -m assayer.demo

# One collection round. Needs FINNHUB_KEY; DATABASE_URL is optional.
collect:
	python -m assayer.collect.reference
	python -m assayer.collect.quotes

# Thesis charts and numbers. Built from day 7 onward.
report:
	@echo "report: not built yet (planned for day 7 onward)"; exit 1
