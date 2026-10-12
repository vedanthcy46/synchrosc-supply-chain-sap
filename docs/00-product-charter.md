# 00 — Product Charter

## Product statement

**SynchroSC** is an agentic supply-chain control tower prototype. It detects disruptions, maps their impact on inventory and production, compares recovery plans, enforces policy controls, and records outcomes so a human operator can recover operations quickly and explainably.

## User and job to be done

**Primary user:** supply-chain control tower analyst / operations manager.

**Job:** “When a supplier or shipment disruption threatens production, show me what is affected, compare feasible recovery plans, and help me execute the safest permitted response with a complete audit trail.”

## MVP success path

1. User triggers or imports a shipping-delay event.
2. System validates and classifies the event, retaining source evidence.
3. System identifies the affected shipment, component, warehouse stock, and production orders.
4. System computes stock coverage and shortage exposure.
5. System creates and ranks at least three recovery alternatives using deterministic calculations.
6. Policy engine marks each option as `AUTO_ALLOWED`, `APPROVAL_REQUIRED`, or `BLOCKED` with reasons.
7. User reviews an approval request and approves or rejects the selected option.
8. Only an authorised action can run; execution is simulated and idempotent.
9. System recalculates outcomes and appends audit events, including before/after state.
10. Dashboard shows the result and estimated value protected.

## MVP scope

- One polished, complete critical-component shortage scenario.
- Synthetic but internally consistent data for suppliers, inventory, shipments, production orders, and costs.
- Disruption ingestion from a deterministic demo fixture; optional LLM extraction from a text alert behind an adapter.
- Deterministic impact analysis and scenario comparison.
- Supplier fallback, expedited shipment, and warehouse transfer alternatives.
- Human approval for configurable thresholds and other risk conditions.
- Simulated execution, outcome verification, audit timeline, dashboard.
- Mock SAP adapter and a clearly defined integration boundary.

## Explicit non-goals for the first version

- Executing real procurement, booking real freight, or changing a live SAP system.
- Full global multi-echelon optimisation, live maritime threat intelligence, or production-grade forecasting.
- A multi-agent framework for its own sake. Simple, testable Python modules are acceptable.
- Letting an LLM determine quantities, costs, supplier approval, sanctions/compliance status, or authorise actions.
- Supporting many scenarios before the first vertical slice works reliably.

## Business outcomes to display

- Orders/components at risk.
- Days until projected stockout and expected shortage units.
- Recovery option lead time and incremental cost.
- Residual demand exposure after the option.
- Whether the action is allowed, requires approval, or is blocked.
- Simulated outcome against the “do nothing / wait” baseline.

Use “estimated” for projections. Never claim an amount saved or a shipment rerouted in reality when the system has only simulated it.

## Definition of done

The MVP is done when a team member can start the stack from the README, trigger the demo event, see impact and at least three options, review an approval gate, approve one option, execute it in simulation, and see the verified result and audit trail — with tests for approval enforcement and duplicate execution.
