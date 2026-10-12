"""Reset and re-seed the SynchroSC demo database."""
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.seed.seed_demo import reset_demo_database

if __name__ == "__main__":
    print("Resetting SynchroSC demo database...")
    reset_demo_database()
    print("Reset and re-seed complete.")
