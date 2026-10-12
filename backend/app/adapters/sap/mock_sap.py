"""Mock SAP Adapter.

Defines the integration boundary for SAP read/write operations.
All prototype actions are simulated; live SAP write capability is strictly gated.
"""
from typing import Dict, Any


class MockSAPAdapter:
    """Mock adapter simulating SAP S/4HANA or ERP integrations."""

    def __init__(self, simulation_mode: bool = True) -> None:
        self.simulation_mode = simulation_mode

    def get_purchase_order(self, po_id: str) -> Dict[str, Any]:
        return {
            "po_id": po_id,
            "status": "simulated",
            "source": "MockSAPAdapter",
        }

    def simulate_purchase_order_creation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "status": "simulated_success",
            "sap_document_id": f"SAP-SIM-{payload.get('supplier_id', 'PO')}",
            "execution_mode": "simulation",
        }
