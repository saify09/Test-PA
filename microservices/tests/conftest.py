"""
Microservices test conftest — sets up PYTHONPATH for all service imports.
Tests use: from microservices.intake_service.app.main import app
This works because:
  1. PYTHONPATH=. (repo root) in CI/CD
  2. microservices/__init__.py exists
  3. microservices/intake_service/ (underscore alias) re-exports from intake-service/
"""
import sys
import os

# Ensure repo root is in path
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Add each service's parent dir so `from app.main import app` works within aliases
SERVICES = ['intake-service', 'payer-integration', 'appeals-service', 
            'notification-service', 'document-service']
for svc in SERVICES:
    svc_path = os.path.join(ROOT, 'microservices', svc)
    if svc_path not in sys.path:
        sys.path.insert(0, svc_path)
