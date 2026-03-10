# AI-Driven Prior Authorization Platform

This repository contains the complete microservices and frontend portals for the Prior Authorization (PA) system. This is a prototype system demonstrating end-to-end functionality using mock data for demonstration purposes.

## Architecture
The system consists of several components:
- **Intake Service:** Handles incoming PA requests via portal, EDI, or FHIR.
- **AI Engine:** Provides criteria matching, data extraction, and clinical decision support.
- **Provider Portal:** Frontend for providers to submit and track PA requests.
- **Reviewer Workbench:** Frontend for clinical reviewers to process cases.

## Usage
The system defaults to a demonstration mode featuring mocked responses, placeholders for ML inferences, and synthetic PA generation logic to facilitate a complete review flow demonstration.
