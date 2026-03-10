# Alias module — imports from actual service
import sys, os

sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "..", "notification-service")
)
from app.main import *
from app.main import app
