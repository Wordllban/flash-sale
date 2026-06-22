# 16 — k6 load test: prove zero oversell

**Phase:** 2 · **Depends on:** #07, #10 · **Implements:** ADR-014

## Goal
Demonstrate the headline guarantee: under 500+ req/s with many users fighting for the last few
items, **orders created == initial stock** — never more. A failing invariant fails the test.

## Concepts you'll learn
- **k6** scenarios, arrival-rate executors, per-VU unique data, and **thresholds** as pass/fail gates.
- Designing a test that proves **correctness**, not just throughput.
- Reading the result to confirm no oversell and acceptable latency.

## Steps
1. `brew install k6`. Add `loadtest/oversell.js`.
2. Scenario: `constant-arrival-rate` at ~600/s for ~30s, large `preAllocatedVUs`. Each iteration:
   - unique `X-Session-Id` (`uuidv4()` per VU/iter) and unique `X-Idempotency-Key`.
   - `POST /checkout` for a sale seeded with small stock (e.g. 100).
   - `check()` status ∈ {202, 409, 410}.
3. **Threshold** that fails the run if oversell occurred. Two ways:
   - count `202` responses in a `Counter` and assert it never exceeds initial stock; and/or
   - a teardown step querying the DB/`/sales/:id` to assert `orders == initialStock` and
     `remaining == 0`.
4. Provide a runbook in the README: activate a sale → `k6 run loadtest/oversell.js` → read result.
5. (Optional) `npx autocannon` one-liner for a quick raw-throughput smoke test.

## Acceptance criteria
- [ ] `k6 run` sustains ≥500 rps against `/checkout`.
- [ ] Successful `202`s == initial stock; never more (threshold **PASS**).
- [ ] Post-run: `remaining == 0`, `count(orders) == count(ledger) == initialStock`, no dup `(userId,saleId)`.
- [ ] Re-running with retries/duplicate keys does not create extra orders (idempotency holds under load).

## Docs to read
- k6 docs: https://grafana.com/docs/k6/latest/
- k6 arrival-rate executors: https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/
- k6 thresholds (pass/fail): https://grafana.com/docs/k6/latest/using-k6/thresholds/
- k6 checks: https://grafana.com/docs/k6/latest/using-k6/checks/
- autocannon: https://github.com/mcollina/autocannon
