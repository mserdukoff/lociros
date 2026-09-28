import os
import tempfile
from pathlib import Path

# Must run before any `app` import: the app engine is built from DATABASE_URL at import
# time, and backend/.env may point at the production database. Tests call drop_all().
_TEST_DB = Path(tempfile.mkdtemp(prefix="lociros-tests-")) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ["SKIP_SEED"] = "true"
