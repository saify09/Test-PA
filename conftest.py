"""
Root-level conftest.py — ensures correct sys.path for all test runs from repo root.
- ai-engine tests: run with `working-directory: ai-engine` (separate PYTHONPATH=.)
- microservices tests: run from repo root, this adds service paths so imports work
"""
import sys
import os

# Add repo root so "microservices.*" package resolution works
sys.path.insert(0, os.path.dirname(__file__))
