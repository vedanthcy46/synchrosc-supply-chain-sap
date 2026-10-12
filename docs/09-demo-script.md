# 09 — Five-Minute Demo Script

## Setup before presentation

- Reset the synthetic demo database.
- Ensure the event fixture is available and all API calls return from the deployed backend.
- Confirm the UI identifies data as a simulation.
- Have a backup local recording or screenshots only as a fallback; prefer the live workflow.
- Confirm no actual purchase/logistics/SAP write is possible from the demo environment.

## Storyboard

### 0:00–0:30 — The disruption
“SynchroSC is a supply-chain resilience control tower. We simulate a critical component shipment delayed to day 12 while the factory has only five days of usable stock.”

Action: open dashboard and trigger `SHP-102` disruption.

### 0:30–1:20 — Impact analysis
“The system does not stop at summarising the alert. It connects the shipment to the component, inventory coverage, and affected production orders.”

Action: open incident detail. Show evidence, 500 available units, demand of 100/day, 5-day coverage, and 12-day ETA.

### 1:20–2:20 — Scenario comparison
“The planner evaluates alternatives with deterministic calculations. We can expedite, buy from an approved alternate supplier, or transfer stock. The transfer is cheaper but leaves residual shortage; alternatives that avoid stockout cost more.”

Action: compare at least three options and explain the ranking objective.

### 2:20–3:20 — Governance
“The selected alternate supplier requires approval because the demo incremental premium is ₹64,000 and the configured auto-approval limit is ₹50,000. The model cannot bypass this rule.”

Action: attempt execute before approval and show the blocked response; open approval details.

### 3:20–4:15 — Approved action and verification
“After an authorised reviewer approves the exact plan version, the simulated executor applies the change once and re-evaluates the inventory timeline.”

Action: approve, execute simulation, show verified result.

### 4:15–5:00 — Audit and value
“Every decision records evidence, calculations, policy reasons, approval, and outcome. This is designed so an operator can understand not only what the system recommends but why.”

Action: show audit timeline and before/after metrics. Close by distinguishing current simulated integration from any future live SAP connection.

## Claims the demo may and may not make

May say: “This prototype simulates an alternate supplier purchase and shows the projected effect under these stated assumptions.”

Do not say: “We autonomously rerouted a real shipment,” “we are live-connected to SAP,” or “we guarantee no shortage” unless that capability is actually implemented and verified. In this kit the action and data are simulated.
