"""Synthetic Demo Seed Data loader."""
import json
import os
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session
from app.db.session import SessionLocal, init_db
from app.models.incident import Incident, DisruptionEventRecord, utc_now_iso
from app.models.supply_chain import (
    SupplierRecord,
    InventoryRecord,
    ShipmentRecord,
    ProductionOrderRecord,
)
from app.schemas.common import WorkflowState


def get_demo_seed_path() -> Path:
    """Resolve location of demo_seed.json."""
    # Look in data/demo_seed.json relative to project root or current working dir
    possible_paths = [
        Path("data/demo_seed.json"),
        Path("../data/demo_seed.json"),
        Path(__file__).resolve().parent.parent.parent.parent / "data" / "demo_seed.json",
    ]
    for p in possible_paths:
        if p.is_file():
            return p.resolve()
    return Path("data/demo_seed.json")


def seed_demo_data(db: Optional[Session] = None) -> None:
    """Load synthetic demo scenario data into the database."""
    init_db()
    close_db_when_done = False
    if db is None:
        db = SessionLocal()
        close_db_when_done = True

    try:
        # Check if already seeded with suppliers
        if db.query(SupplierRecord).count() > 0:
            return

        seed_path = get_demo_seed_path()
        if not seed_path.exists():
            return

        with open(seed_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        now_iso = utc_now_iso()

        # 1. Suppliers
        for s in data.get("suppliers", []):
            db.add(
                SupplierRecord(
                    supplier_id=s["supplier_id"],
                    name=s["name"],
                    approved=s["approved"],
                    components=s["components"],
                    available_capacity=s["available_capacity"],
                    unit_cost=s["unit_cost"],
                    currency=s["currency"],
                    lead_time_days=s["lead_time_days"],
                    risk_status=s["risk_status"],
                    updated_at=now_iso,
                )
            )

        # 2. Inventory
        for inv in data.get("inventory", []):
            db.add(
                InventoryRecord(
                    component_id=inv["component_id"],
                    warehouse_id=inv["warehouse_id"],
                    on_hand_qty=inv["on_hand_qty"],
                    reserved_qty=inv["reserved_qty"],
                    daily_demand=inv["daily_demand"],
                    unit=inv.get("unit", "units"),
                    transferable_qty=inv.get("transferable_qty"),
                    as_of=now_iso,
                )
            )

        # 3. Shipments
        for shp in data.get("shipments", []):
            db.add(
                ShipmentRecord(
                    shipment_id=shp["shipment_id"],
                    supplier_id=shp["supplier_id"],
                    component_id=shp["component_id"],
                    quantity=shp["quantity"],
                    origin=shp["origin"],
                    destination=shp["destination"],
                    baseline_eta_days=shp["baseline_eta_days"],
                    current_eta_days=shp["current_eta_days"],
                    status=shp["status"],
                    transport_mode=shp["transport_mode"],
                    incremental_expedite_cost=shp["incremental_expedite_cost"],
                    source_type="demo",
                )
            )

        # 4. Production Orders
        for po in data.get("production_orders", []):
            db.add(
                ProductionOrderRecord(
                    order_id=po["order_id"],
                    product_id=po["product_id"],
                    component_requirements=po["component_requirements"],
                    priority=po["priority"],
                    due_in_days=po["due_in_days"],
                    status=po["status"],
                )
            )

        # 5. Default Demo Disruption & Incident (INC-001)
        disruption = data.get("demo_disruption")
        if disruption:
            evt_record = DisruptionEventRecord(
                event_id="EVT-001",
                incident_id="INC-001",
                event_type=disruption["event_type"],
                title=disruption["title"],
                description=disruption["description"],
                severity=disruption["severity"],
                source_type=disruption["source_type"],
                source_name=disruption["source_name"],
                confidence=disruption["confidence"],
                affected_shipment_ids=disruption["affected_shipment_ids"],
                evidence=disruption["evidence"],
                detected_at=now_iso,
            )
            db.add(evt_record)

            inc_record = Incident(
                incident_id="INC-001",
                event_id="EVT-001",
                title=disruption["title"],
                status=WorkflowState.DETECTED.value,
                severity=disruption["severity"],
                created_at=now_iso,
                updated_at=now_iso,
            )
            db.add(inc_record)

        db.commit()

    finally:
        if close_db_when_done:
            db.close()


def reset_demo_database(db: Optional[Session] = None) -> None:
    """Clean slate and re-seed demo data."""
    init_db()
    close_db_when_done = False
    if db is None:
        db = SessionLocal()
        close_db_when_done = True

    try:
        from app.db.session import Base, engine
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        seed_demo_data(db)
    finally:
        if close_db_when_done:
            db.close()
