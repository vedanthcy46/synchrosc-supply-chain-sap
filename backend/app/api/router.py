"""Central API router aggregator (Owned by Member 1).

Includes all domain routers without circular imports.
"""
from fastapi import APIRouter
from app.api.routes import (
    health,
    dashboard,
    disruptions,
    incidents,
    impact,
    scenarios,
    approvals,
    actions,
    audit,
)

api_router = APIRouter()

# Health check
api_router.include_router(health.router)

# Dashboard summary
api_router.include_router(dashboard.router)

# Disruption detection & sensing
api_router.include_router(disruptions.router)

# Incidents workflow and details
api_router.include_router(incidents.router)

# Impact analysis
api_router.include_router(impact.router)

# Scenario planning and ranking
api_router.include_router(scenarios.router)

# Human approvals & decisions
api_router.include_router(approvals.router)

# Simulated action execution
api_router.include_router(actions.router)

# Audit log timeline
api_router.include_router(audit.router)
