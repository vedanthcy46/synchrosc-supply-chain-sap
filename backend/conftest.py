"""Pytest configuration ensuring backend app is on sys.path and DB is initialized."""
import sys
from pathlib import Path
import pytest

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db.session import init_db
from app.seed.seed_demo import seed_demo_data


@pytest.fixture(autouse=True, scope="session")
def setup_test_database():
    """Ensure all database tables exist and demo seed data is available for test suite."""
    init_db()
    seed_demo_data()
