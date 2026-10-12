# Member 3 — Recovery Scenario Planner and Ranking

## Your mission

Use the impact report and current supply-chain records to generate alternative recovery plans, calculate their metrics, reject hard-infeasible options, and rank the rest according to an explicit objective. The explanation must be grounded in numeric outputs.

## Owned paths

- `backend/app/agents/scenario_planning.py`
- `backend/app/services/option_scoring.py`
- `backend/app/schemas/scenario.py`
- `backend/app/api/routes/scenarios.py`
- Unit tests for option generation, feasibility, and ranking

Don't edit shared router aggregation or `main.py`. Member 1 registers your router. Coordinate with Member 2 to consume their `ImpactAnalysis` model and Member 4 for `policy_status`/`reason_codes` semantics.

## Input data

- Impact report from Member 2.
- Approved supplier records, capacities, unit-cost baseline/premium, and lead times.
- Current shipment and available transfer inventory.
- Configured objective and business constraints.

## Minimum three recovery alternatives

1. **Expedite delayed shipment** — ETA day 4, 800 units, incremental cost ₹90,000.
2. **Buy from approved alternate Supplier B** — ETA day 4, 800 units, incremental price premium ₹64,000.
3. **Transfer inventory from Warehouse B** — 300 units, ETA day 2, cost ₹12,000; mark partial mitigation/residual exposure because it alone doesn't bridge the full delay.

The “wait for delayed shipment” case is the baseline comparison, not one of the recovery actions.

## Planner behaviour

1. Generate candidates using current records. The scenario may be templated for this one demo; do not use an LLM to invent missing capacity or price.
2. Compute incremental cost in Python from explicit model inputs.
3. Simulate the supply timeline using arrival dates, daily demand, and inventory reservations. State the start-of-ETA-day arrival assumption.
4. Mark hard infeasibility, residual shortage units, expected production delay, and risk factors.
5. Apply lexicographic ranking: hard feasibility first; satisfy no-stockout objective second; incremental cost third; ETA fourth; risk score as tie-breaker.
6. Return `reason_codes` and a concise rationale that refers to computed metrics.
7. Persist scenario plus `plan_version`, so an approval binds to the actual plan reviewed.

## Suggested interface

```python
async def generate_scenarios(incident_id: str, impact: ImpactAnalysis) -> list[RecoveryScenario]:
    """Return deterministic, comparable, versioned recovery options."""
```

## Ranking example under the default objective

- Alternate supplier: ETA 4 days, incremental premium ₹64,000, no projected stockout under the seed assumptions; likely preferred.
- Expedited shipment: ETA 4 days, incremental freight ₹90,000, no projected stockout; more expensive than alternate supplier under this scenario.
- Transfer only: ETA 2 days, incremental cost ₹12,000, but residual shortage before the day-12 shipment; show as partial mitigation, not a complete solution.

All three must show comparable fields. Don't silently use different definitions of “cost” for each option. Show incremental cost separately from total procurement value.

## Required tests

- Exactly or at least three alternatives are generated for the demo incident.
- Costs match the documented seed assumptions.
- An unapproved or over-capacity supplier cannot be labelled feasible.
- Transfer-only option shows residual risk.
- Default ranking chooses the cheapest option that meets the no-stockout objective.
- If alternate supplier capacity is reduced, the plan becomes infeasible or partial and the ranking changes for a documented reason.
- Results include assumptions and a version ID.

## Done means

The UI can compare plans side by side and explain the recommended option with visible cost, lead time, feasibility, residual risk, policy status, and reasons. The recommendation is reproducible when run against identical data.
