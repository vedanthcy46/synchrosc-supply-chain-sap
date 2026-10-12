"""Seed the demo database with synthetic supply chain records."""
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.seed.seed_demo import seed_demo_data

if __name__ == "__main__":
    print("Seeding SynchroSC demo database...")
    seed_demo_data()
    print("Seeding complete.")
