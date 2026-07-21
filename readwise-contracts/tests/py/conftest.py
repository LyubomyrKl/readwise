"""
Pytest configuration for summarizer-contracts tests
"""

import pytest
import sys
from pathlib import Path

# Add the packages/py/src directory to Python path for importing
test_dir = Path(__file__).parent
repo_root = test_dir.parent.parent
py_package_src = repo_root / "packages" / "py" / "src"

if str(py_package_src) not in sys.path:
    sys.path.insert(0, str(py_package_src))

@pytest.fixture
def repo_root_path():
    """Fixture providing path to repository root"""
    return Path(__file__).parent.parent.parent