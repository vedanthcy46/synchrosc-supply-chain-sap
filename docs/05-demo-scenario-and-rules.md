# 05 — Demo Scenario, Seed Data, and Calculation Rules

> All data and values in this file are invented for the prototype. They are not live market, freight, SAP, or supplier data.

## Story

A factory uses critical component `CMP-201`. Its shipment `SHP-102` is delayed and now arrives 12 days from today. The factory has only five days of usable inventory at its current demand rate. The operator needs to avoid production interruption.

## Demo facts

| Record | Value |
|---|---|
| Component | `CMP-201` — critical controller module |
| Warehouse A on hand | 700 units |
| Warehouse A reserved | 200 units |
| Available stock | 500 units |
| Average daily demand | 100 units/day |
| Current shipment | `SHP-102`, 800 units, revised ETA +12 days |
| Baseline stock coverage | 500 / 100 = 5 days |
| Supplier A | Approved; original shipment delayed |
| Supplier B | Approved; 800 units available, 4-day delivery |
| Supplier B unit price | ₹1,080 vs. baseline ₹1,000; premium ₹80/unit |
| Alternate supplier premium | 800 × ₹80 = ₹64,000 incremental cost |
| Expedited current shipment | Arrives in 4 days; incremental freight estimate ₹90,000 |
| Warehouse B transfer option | 300 free units; 2-day transit; transfer cost ₹12,000 |
| Demo auto-execution threshold | ₹50,000 incremental recovery cost |

These numbers intentionally make the options meaningfully different. The threshold is a configurable demo policy only, not a real procurement rule.

## Options the planner should compare

### Option 0 — Wait for delayed shipment (baseline)
- No incremental recovery cost.
- Current usable stock covers five days; revised shipment ETA is day 12.
- The model should show that supply arrives after projected stockout and that production demand is exposed before the shipment arrives.
- This is a baseline, not a recommended action.

### Option 1 — Expedite `SHP-102`
- Bring 800 units forward to day 4 for ₹90,000 incremental cost.
- With arrivals modelled at the start of the ETA day, available stock should not fall below zero before arrival.
- Feasible in the demo fixture, but incremental cost exceeds ₹50,000, so `APPROVAL_REQUIRED`.

### Option 2 — Buy from approved Supplier B
- Purchase 800 units for arrival on day 4.
- Incremental premium: ₹64,000.
- Feasible by stock continuity under the demo assumptions. It exceeds the threshold, so `APPROVAL_REQUIRED`.
- Because arrival is before the projected stockout and the premium is less than expedited freight, this is the expected recommendation when “avoid production stoppage, then minimise incremental recovery cost” is the configured objective.

### Option 3 — Transfer 300 units from Warehouse B
- Arrival on day 2; incremental transfer cost ₹12,000.
- It reduces the exposure but does not cover the entire gap to day 12. The planner must flag residual shortage risk and not describe it as a complete recovery.
- If the business objective forbids any production stoppage, label the standalone option not sufficient/partially mitigating. It can be combined with another action if combined plans are implemented.

## Calculation definitions

### Available stock
`available_qty = max(0, on_hand_qty - reserved_qty)`

### Baseline coverage
`coverage_days = available_qty / daily_demand` when `daily_demand > 0`. If demand is zero, use `null` and explain why; never divide by zero.

### Stockout before ETA
For a simple deterministic demo, `stockout_before_eta = (coverage_days < arrival_days)`. State whether arrivals are treated as start-of-day or end-of-day; this kit assumes **arrivals at the start of the ETA day**.

### Shortage exposure
For an initial approximation, `demand_until_arrival = daily_demand * arrival_days`. Compute how much demand is uncovered by usable supply available before the arrival. Use an explicit event timeline for alternatives rather than adding all supply as if it arrives immediately. Keep units non-negative and document rounding.

### Incremental cost
`incremental_cost = extra_freight + alternate_supplier_price_premium + transfer_cost + other explicitly modelled recovery charges`. Never have the LLM calculate this.

## Ranking rule

Use a transparent lexicographic ranking rather than an unexplained LLM score:

1. Reject hard-infeasible options (unapproved/blocked supplier, insufficient capacity, negative available inventory, missing compliance status where policy requires it).
2. Prefer options that satisfy the no-stockout / no-production-stoppage objective.
3. Among options that satisfy the objective, minimise incremental recovery cost.
4. Break ties using shorter arrival time, then lower risk score.
5. Show the metric that caused a plan to win and every assumption that could change the rank.

The objective is configurable. If the user instead prioritises lowest cash outlay, transfer stock could rank higher but must show residual risk. Do not hide that trade-off.

## Impact report should include

- Event and source evidence.
- Shipment ETA change and affected component.
- Usable stock, consumption rate, coverage, projected stockout.
- Affected production order IDs and due dates.
- Estimated uncovered quantity or days under the baseline.
- Assumptions, calculation timestamp, and data provenance.
