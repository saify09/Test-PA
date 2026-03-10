# Alias module — imports from actual service
import sys, os

sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "..", "payer-integration")
)
from app.main import *
from app.main import app
