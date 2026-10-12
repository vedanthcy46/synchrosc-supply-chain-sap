"""SQLAlchemy models for supply chain baseline entities: suppliers, inventory, shipments, orders."""
from sqlalchemy import Column, String, Integer, Float, Boolean, JSON
from app.db.session import Base
from app.models.incident import utc_now_iso


class SupplierRecord(Base):
    __tablename__ = "suppliers"

    supplier_id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    approved = Column(Boolean, nullable=False, default=False)
    components = Column(JSON, nullable=False, default=list)
    available_capacity = Column(Integer, nullable=False, default=0)
    unit_cost = Column(Float, nullable=False, default=0.0)
    currency = Column(String(16), nullable=False, default="INR")
    lead_time_days = Column(Integer, nullable=False, default=0)
    risk_status = Column(String(32), nullable=False, default="clear")  # clear | review | blocked | unknown
    updated_at = Column(String(64), nullable=False, default=utc_now_iso)


class InventoryRecord(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    component_id = Column(String(64), nullable=False, index=True)
    warehouse_id = Column(String(64), nullable=False, index=True)
    on_hand_qty = Column(Integer, nullable=False, default=0)
    reserved_qty = Column(Integer, nullable=False, default=0)
    daily_demand = Column(Integer, nullable=False, default=0)
    unit = Column(String(32), nullable=False, default="units")
    transferable_qty = Column(Integer, nullable=True)
    as_of = Column(String(64), nullable=False, default=utc_now_iso)


class ShipmentRecord(Base):
    __tablename__ = "shipments"

    shipment_id = Column(String(64), primary_key=True, index=True)
    supplier_id = Column(String(64), nullable=False)
    component_id = Column(String(64), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=0)
    origin = Column(String(128), nullable=False)
    destination = Column(String(128), nullable=False)
    baseline_eta_days = Column(Integer, nullable=False, default=0)
    current_eta_days = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="in_transit")
    transport_mode = Column(String(32), nullable=False, default="sea")
    incremental_expedite_cost = Column(Float, nullable=False, default=0.0)
    source_type = Column(String(32), nullable=False, default="demo")


class ProductionOrderRecord(Base):
    __tablename__ = "production_orders"

    order_id = Column(String(64), primary_key=True, index=True)
    product_id = Column(String(64), nullable=False)
    component_requirements = Column(JSON, nullable=False, default=list)
    priority = Column(String(32), nullable=False, default="normal")
    due_in_days = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="planned")
