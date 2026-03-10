# NOTE: This file is from the original AI_Prior_Auth_System.zip (ai-models/inference/).
# It is preserved here for compatibility. The pa-system AI engine integrates
# this via app.services.criteria_engine (primary) with this module as
# an optional enhanced inference backend when FAISS/transformers are available.
# Install optional deps: pip install faiss-cpu transformers torch rank-bm25
# See app/core/config.py: ENABLE_RAG_ENGINE=true to activate.

"""
Clinical Guidelines Loader
Loads and processes MCG and InterQual guidelines for RAG system

Supports:
- MCG Care Guidelines API integration
- InterQual API integration
- Local JSON/CSV guideline files
- Automatic index building and updates
"""

import json
import csv
import requests
from typing import List, Dict, Optional
from pathlib import Path
import logging
from datetime import datetime

from rag_engine import ClinicalGuideline, ClinicalCriteriaRAG

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GuidelinesLoader:
    """Load clinical guidelines from various sources"""

    def __init__(
        self,
        mcg_api_key: Optional[str] = None,
        interqual_api_key: Optional[str] = None,
        guidelines_dir: str = "/data/guidelines",
    ):
        """
        Initialize guidelines loader

        Args:
            mcg_api_key: API key for MCG Care Guidelines
            interqual_api_key: API key for InterQual
            guidelines_dir: Directory for local guideline files
        """
        self.mcg_api_key = mcg_api_key
        self.interqual_api_key = interqual_api_key
        self.guidelines_dir = Path(guidelines_dir)
        self.guidelines_dir.mkdir(parents=True, exist_ok=True)

    def load_from_mcg_api(self) -> List[ClinicalGuideline]:
        """
        Load guidelines from MCG Care Guidelines API

        API Documentation: https://www.mcg.com/api-docs

        Returns:
            List of clinical guidelines
        """
        if not self.mcg_api_key:
            logger.warning("MCG API key not provided. Skipping MCG guidelines.")
            return []

        logger.info("Loading guidelines from MCG API...")

        # MCG API endpoint (example - actual endpoint from MCG documentation)
        base_url = "https://api.mcg.com/v1/guidelines"
        headers = {
            "Authorization": f"Bearer {self.mcg_api_key}",
            "Content-Type": "application/json",
        }

        guidelines = []

        try:
            # Fetch imaging guidelines
            response = requests.get(f"{base_url}/imaging", headers=headers, timeout=30)
            response.raise_for_status()

            data = response.json()

            for item in data.get("guidelines", []):
                guideline = self._parse_mcg_guideline(item)
                if guideline:
                    guidelines.append(guideline)

            logger.info(f"Loaded {len(guidelines)} MCG guidelines")

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to load MCG guidelines: {e}")

        return guidelines

    def _parse_mcg_guideline(self, data: Dict) -> Optional[ClinicalGuideline]:
        """Parse MCG API response into ClinicalGuideline"""
        try:
            return ClinicalGuideline(
                guideline_id=data.get("id", ""),
                source="MCG",
                category=data.get("category", "General"),
                procedure_codes=data.get("cpt_codes", []),
                diagnosis_codes=data.get("icd10_codes", []),
                title=data.get("title", ""),
                criteria_text=data.get("criteria", ""),
                indications=data.get("indications", []),
                contraindications=data.get("contraindications", []),
                documentation_requirements=data.get("documentation_required", []),
                references=[data.get("source", "MCG Care Guidelines")],
                effective_date=data.get(
                    "effective_date", datetime.now().isoformat()[:10]
                ),
            )
        except Exception as e:
            logger.error(f"Error parsing MCG guideline: {e}")
            return None

    def load_from_interqual_api(self) -> List[ClinicalGuideline]:
        """
        Load guidelines from InterQual API

        API Documentation: https://www.changehealthcare.com/interqual

        Returns:
            List of clinical guidelines
        """
        if not self.interqual_api_key:
            logger.warning(
                "InterQual API key not provided. Skipping InterQual guidelines."
            )
            return []

        logger.info("Loading guidelines from InterQual API...")

        # InterQual API endpoint (example - actual endpoint from InterQual docs)
        base_url = "https://api.interqual.com/v1/criteria"
        headers = {
            "X-API-Key": self.interqual_api_key,
            "Content-Type": "application/json",
        }

        guidelines = []

        try:
            response = requests.get(
                f"{base_url}/inpatient", headers=headers, timeout=30
            )
            response.raise_for_status()

            data = response.json()

            for item in data.get("criteria", []):
                guideline = self._parse_interqual_guideline(item)
                if guideline:
                    guidelines.append(guideline)

            logger.info(f"Loaded {len(guidelines)} InterQual guidelines")

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to load InterQual guidelines: {e}")

        return guidelines

    def _parse_interqual_guideline(self, data: Dict) -> Optional[ClinicalGuideline]:
        """Parse InterQual API response into ClinicalGuideline"""
        try:
            return ClinicalGuideline(
                guideline_id=data.get("criteria_id", ""),
                source="InterQual",
                category=data.get("level_of_care", "General"),
                procedure_codes=data.get("procedure_codes", []),
                diagnosis_codes=data.get("diagnosis_codes", []),
                title=data.get("criteria_name", ""),
                criteria_text=data.get("criteria_text", ""),
                indications=data.get("admission_criteria", []),
                contraindications=data.get("exclusions", []),
                documentation_requirements=data.get("required_documentation", []),
                references=[data.get("reference", "InterQual Criteria")],
                effective_date=data.get(
                    "effective_date", datetime.now().isoformat()[:10]
                ),
            )
        except Exception as e:
            logger.error(f"Error parsing InterQual guideline: {e}")
            return None

    def load_from_json(self, filepath: str) -> List[ClinicalGuideline]:
        """
        Load guidelines from JSON file

        JSON format:
        [
            {
                "guideline_id": "MCG-001",
                "source": "MCG",
                "category": "Imaging",
                ...
            }
        ]
        """
        logger.info(f"Loading guidelines from JSON: {filepath}")

        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            guidelines = [ClinicalGuideline(**item) for item in data]
            logger.info(f"Loaded {len(guidelines)} guidelines from JSON")
            return guidelines

        except Exception as e:
            logger.error(f"Failed to load JSON guidelines: {e}")
            return []

    def load_from_csv(self, filepath: str) -> List[ClinicalGuideline]:
        """
        Load guidelines from CSV file

        CSV columns: guideline_id,source,category,procedure_codes,diagnosis_codes,
                     title,criteria_text,indications,contraindications,
                     documentation_requirements,references,effective_date
        """
        logger.info(f"Loading guidelines from CSV: {filepath}")

        guidelines = []

        try:
            with open(filepath, "r") as f:
                reader = csv.DictReader(f)

                for row in reader:
                    # Parse list fields
                    procedure_codes = (
                        row["procedure_codes"].split("|")
                        if row["procedure_codes"]
                        else []
                    )
                    diagnosis_codes = (
                        row["diagnosis_codes"].split("|")
                        if row["diagnosis_codes"]
                        else []
                    )
                    indications = (
                        row["indications"].split("|") if row["indications"] else []
                    )
                    contraindications = (
                        row["contraindications"].split("|")
                        if row["contraindications"]
                        else []
                    )
                    documentation_requirements = (
                        row["documentation_requirements"].split("|")
                        if row["documentation_requirements"]
                        else []
                    )
                    references = (
                        row["references"].split("|") if row["references"] else []
                    )

                    guideline = ClinicalGuideline(
                        guideline_id=row["guideline_id"],
                        source=row["source"],
                        category=row["category"],
                        procedure_codes=procedure_codes,
                        diagnosis_codes=diagnosis_codes,
                        title=row["title"],
                        criteria_text=row["criteria_text"],
                        indications=indications,
                        contraindications=contraindications,
                        documentation_requirements=documentation_requirements,
                        references=references,
                        effective_date=row["effective_date"],
                    )
                    guidelines.append(guideline)

            logger.info(f"Loaded {len(guidelines)} guidelines from CSV")
            return guidelines

        except Exception as e:
            logger.error(f"Failed to load CSV guidelines: {e}")
            return []

    def load_all_guidelines(
        self, use_api: bool = True, use_local: bool = True
    ) -> List[ClinicalGuideline]:
        """
        Load guidelines from all available sources

        Args:
            use_api: Load from MCG/InterQual APIs
            use_local: Load from local files

        Returns:
            Combined list of all guidelines
        """
        all_guidelines = []

        # Load from APIs
        if use_api:
            all_guidelines.extend(self.load_from_mcg_api())
            all_guidelines.extend(self.load_from_interqual_api())

        # Load from local files
        if use_local:
            # Check for JSON files
            for json_file in self.guidelines_dir.glob("*.json"):
                all_guidelines.extend(self.load_from_json(str(json_file)))

            # Check for CSV files
            for csv_file in self.guidelines_dir.glob("*.csv"):
                all_guidelines.extend(self.load_from_csv(str(csv_file)))

        logger.info(f"Total guidelines loaded: {len(all_guidelines)}")
        return all_guidelines

    def create_sample_guidelines(self) -> List[ClinicalGuideline]:
        """
        Create sample guidelines for testing
        These represent real MCG/InterQual guideline structure
        """
        logger.info("Creating sample guidelines for testing...")

        guidelines = [
            # Imaging Guidelines
            ClinicalGuideline(
                guideline_id="MCG-IMG-001",
                source="MCG",
                category="Imaging",
                procedure_codes=["72148", "72149", "72158"],
                diagnosis_codes=["M54.5", "M51.26", "M51.16", "M47.26"],
                title="Lumbar Spine MRI - Low Back Pain with Radiculopathy",
                criteria_text="""
                MRI of the lumbar spine without and with contrast is medically necessary when ALL of the following are met:
                
                1. Patient has low back pain with radicular symptoms lasting more than 6 weeks
                2. Conservative treatment has been attempted including:
                   - Physical therapy (minimum 4-6 weeks)
                   - Anti-inflammatory medications
                   - Activity modification
                3. Physical examination demonstrates neurological findings such as:
                   - Positive straight leg raise test
                   - Sensory deficits in dermatomal distribution
                   - Motor weakness in myotomal distribution
                   - Absent or diminished reflexes
                4. One of the following is present:
                   - Progressive neurological deficit
                   - Severe or disabling symptoms despite conservative care
                   - Surgical consultation is being considered
                   - Red flags requiring immediate evaluation (cauda equina, infection, tumor)
                """,
                indications=[
                    "Radicular pain lasting > 6 weeks with failed conservative treatment",
                    "Neurological deficits (motor weakness, sensory loss, reflex changes)",
                    "Progressive symptoms despite treatment",
                    "Surgical planning for herniated disc or spinal stenosis",
                    "Red flag symptoms (bowel/bladder dysfunction, saddle anesthesia)",
                ],
                contraindications=[
                    "Acute low back pain < 6 weeks without radiculopathy",
                    "No prior conservative treatment attempted",
                    "No neurological findings on examination",
                    "Isolated back pain without leg symptoms",
                ],
                documentation_requirements=[
                    "Duration and character of symptoms (back pain + leg pain)",
                    "Details of conservative treatment (PT, medications, duration)",
                    "Physical examination findings (neurological assessment)",
                    "Functional impact on daily activities",
                    "Response to prior treatments",
                    "Presence or absence of red flag symptoms",
                ],
                references=["MCG Care Guidelines 27th Edition - Lumbar Spine Imaging"],
                effective_date="2025-01-01",
            ),
            # Surgery Guidelines
            ClinicalGuideline(
                guideline_id="MCG-SUR-002",
                source="MCG",
                category="Surgery",
                procedure_codes=["27447", "27486"],
                diagnosis_codes=["M17.11", "M17.12", "M17.0"],
                title="Total Knee Arthroplasty (TKA) - Osteoarthritis",
                criteria_text="""
                Total knee arthroplasty is medically necessary when ALL of the following criteria are met:
                
                1. Diagnosis of severe knee osteoarthritis confirmed by:
                   - Radiographic evidence (Kellgren-Lawrence Grade 3 or 4)
                   - Significant joint space narrowing
                   - Osteophyte formation
                   - Subchondral sclerosis
                   
                2. Significant functional impairment:
                   - Pain interfering with daily activities
                   - Difficulty with ambulation
                   - Impaired quality of life
                   
                3. Failed conservative treatment for minimum 3 months including:
                   - Physical therapy
                   - Weight management (if BMI > 30)
                   - NSAIDs or other pain management
                   - Intra-articular corticosteroid injections
                   - Assistive devices (cane, walker)
                   
                4. Patient is appropriate surgical candidate:
                   - Medically stable for surgery
                   - No active infection
                   - Realistic expectations regarding outcomes
                """,
                indications=[
                    "Kellgren-Lawrence Grade 3-4 osteoarthritis on X-ray",
                    "Persistent pain despite 3+ months conservative treatment",
                    "Significant functional limitation affecting daily activities",
                    "Failed intra-articular injections",
                    "Patient is appropriate surgical candidate",
                ],
                contraindications=[
                    "Active knee infection",
                    "Inadequate trial of conservative treatment (< 3 months)",
                    "Mild osteoarthritis (KL Grade 1-2)",
                    "Medical comorbidities making surgery high risk",
                    "Unrealistic patient expectations",
                ],
                documentation_requirements=[
                    "X-ray reports confirming osteoarthritis severity (KL grade)",
                    "Detailed conservative treatment history with dates and response",
                    "Physical therapy notes and outcomes",
                    "Functional assessment (WOMAC, Oxford Knee Score, etc.)",
                    "Pain level documentation (VAS scale)",
                    "Medical clearance if comorbidities present",
                ],
                references=[
                    "MCG Care Guidelines 27th Edition - Total Knee Arthroplasty"
                ],
                effective_date="2025-01-01",
            ),
            # Medication Guidelines
            ClinicalGuideline(
                guideline_id="IQ-MED-003",
                source="InterQual",
                category="Medication",
                procedure_codes=["J2323", "J2326"],
                diagnosis_codes=["G35", "G35.9"],
                title="Natalizumab (Tysabri) - Multiple Sclerosis",
                criteria_text="""
                Natalizumab is medically necessary for relapsing forms of multiple sclerosis when:
                
                1. Confirmed diagnosis of relapsing-remitting MS (RRMS) by neurologist
                
                2. Disease characteristics:
                   - Active disease with relapses on current therapy OR
                   - Rapidly evolving severe RRMS
                   
                3. Inadequate response to or intolerance of:
                   - Interferon beta OR
                   - Glatiramer acetate OR
                   - Other disease-modifying therapy for minimum 6 months
                   
                4. Safety requirements met:
                   - Negative JC virus antibody status OR positive with low index
                   - No history of progressive multifocal leukoencephalopathy (PML)
                   - No immunocompromised state
                   - Enrolled in TOUCH prescribing program
                   
                5. Baseline MRI confirming active disease
                """,
                indications=[
                    "Confirmed RRMS with active relapses",
                    "Failed or intolerant to first-line DMTs for 6+ months",
                    "Rapidly evolving disease with multiple relapses",
                    "MRI showing new or enhancing lesions",
                    "EDSS score demonstrating disability progression",
                ],
                contraindications=[
                    "Progressive multifocal leukoencephalopathy (PML) history",
                    "High JC virus antibody index (> 1.5)",
                    "Immunocompromised state",
                    "Inadequate trial of first-line therapies (< 6 months)",
                    "Progressive MS without relapses",
                ],
                documentation_requirements=[
                    "Neurologist evaluation and MS diagnosis confirmation",
                    "MRI brain/spine showing demyelinating lesions",
                    "Prior DMT trials with dates, dosages, and response",
                    "Documentation of relapses (dates, symptoms, treatments)",
                    "JC virus antibody test results",
                    "EDSS (Expanded Disability Status Scale) score",
                    "TOUCH program enrollment confirmation",
                ],
                references=[
                    "InterQual 2025 Criteria - Specialty Pharmacy: Natalizumab"
                ],
                effective_date="2025-01-01",
            ),
        ]

        return guidelines

    def save_sample_guidelines_to_json(self, filepath: str):
        """Save sample guidelines to JSON file"""
        guidelines = self.create_sample_guidelines()

        guidelines_dict = [
            {
                "guideline_id": g.guideline_id,
                "source": g.source,
                "category": g.category,
                "procedure_codes": g.procedure_codes,
                "diagnosis_codes": g.diagnosis_codes,
                "title": g.title,
                "criteria_text": g.criteria_text,
                "indications": g.indications,
                "contraindications": g.contraindications,
                "documentation_requirements": g.documentation_requirements,
                "references": g.references,
                "effective_date": g.effective_date,
            }
            for g in guidelines
        ]

        with open(filepath, "w") as f:
            json.dump(guidelines_dict, f, indent=2)

        logger.info(f"Saved {len(guidelines)} sample guidelines to {filepath}")


if __name__ == "__main__":
    # Demo usage
    loader = GuidelinesLoader(guidelines_dir="/data/guidelines")

    # Create and save sample guidelines
    sample_file = "/data/guidelines/sample_guidelines.json"
    loader.save_sample_guidelines_to_json(sample_file)

    # Load guidelines
    guidelines = loader.load_all_guidelines(use_api=False, use_local=True)

    print(f"\nLoaded {len(guidelines)} guidelines")
    for g in guidelines:
        print(f"\n{g.source} - {g.title}")
        print(f"  Procedures: {', '.join(g.procedure_codes[:3])}")
        print(f"  Diagnoses: {', '.join(g.diagnosis_codes[:3])}")
        print(f"  Indications: {len(g.indications)}")

    # Build RAG index
    print("\nBuilding RAG index...")
    from rag_engine import ClinicalCriteriaRAG

    rag = ClinicalCriteriaRAG(
        guidelines_path="/data/guidelines", index_path="/data/faiss_index"
    )
    rag.build_index(guidelines)

    print("✓ Guidelines loaded and indexed successfully!")
