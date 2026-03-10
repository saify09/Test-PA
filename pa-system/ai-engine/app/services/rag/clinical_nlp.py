# NOTE: This file is from the original AI_Prior_Auth_System.zip (ai-models/inference/).
# It is preserved here for compatibility. The pa-system AI engine integrates
# this via app.services.criteria_engine (primary) with this module as
# an optional enhanced inference backend when FAISS/transformers are available.
# Install optional deps: pip install faiss-cpu transformers torch rank-bm25
# See app/core/config.py: ENABLE_RAG_ENGINE=true to activate.

"""
Clinical NLP Model Inference
Uses BioBERT and ClinicalBERT for medical document understanding

This module provides:
- Entity extraction (ICD-10, CPT, NDC codes)
- Clinical text classification
- Medical necessity scoring
- Semantic similarity matching
"""

import torch
import numpy as np
from transformers import (
    AutoTokenizer,
    AutoModel,
    AutoModelForTokenClassification,
    pipeline
)
from typing import List, Dict, Tuple, Optional
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ClinicalNLPEngine:
    """
    Transformer-based NLP engine for clinical document processing
    Uses BioBERT and ClinicalBERT models from HuggingFace
    """
    
    def __init__(self, models_cache_dir="/models", device="cpu"):
        """
        Initialize NLP models
        
        Args:
            models_cache_dir: Directory containing cached models
            device: 'cpu' or 'cuda' for GPU acceleration
        """
        self.device = device
        self.cache_dir = models_cache_dir
        self.models = {}
        self.tokenizers = {}
        
        logger.info(f"Initializing Clinical NLP Engine on {device}")
        self._load_models()
    
    def _load_models(self):
        """Load pre-trained models from cache"""
        try:
            # BioBERT for NER (Named Entity Recognition)
            logger.info("Loading BioBERT for entity extraction...")
            self.tokenizers['biobert'] = AutoTokenizer.from_pretrained(
                "dmis-lab/biobert-v1.1",
                cache_dir=self.cache_dir,
                local_files_only=True
            )
            self.models['biobert'] = AutoModelForTokenClassification.from_pretrained(
                "dmis-lab/biobert-v1.1",
                cache_dir=self.cache_dir,
                local_files_only=True
            ).to(self.device)
            
            # ClinicalBERT for classification
            logger.info("Loading ClinicalBERT for text classification...")
            self.tokenizers['clinicalbert'] = AutoTokenizer.from_pretrained(
                "emilyalsentzer/Bio_ClinicalBERT",
                cache_dir=self.cache_dir,
                local_files_only=True
            )
            self.models['clinicalbert'] = AutoModel.from_pretrained(
                "emilyalsentzer/Bio_ClinicalBERT",
                cache_dir=self.cache_dir,
                local_files_only=True
            ).to(self.device)
            
            # Optional: PubMedBERT for embeddings
            try:
                logger.info("Loading PubMedBERT for semantic analysis...")
                self.tokenizers['pubmedbert'] = AutoTokenizer.from_pretrained(
                    "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext",
                    cache_dir=self.cache_dir,
                    local_files_only=True
                )
                self.models['pubmedbert'] = AutoModel.from_pretrained(
                    "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext",
                    cache_dir=self.cache_dir,
                    local_files_only=True
                ).to(self.device)
            except Exception as e:
                logger.warning(f"PubMedBERT not available (optional): {e}")
            
            logger.info("✓ All models loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load models: {e}")
            logger.error("Run: python ai-models/setup_models.py --action download")
            raise
    
    def extract_medical_entities(self, text: str) -> Dict[str, List[str]]:
        """
        Extract medical entities from clinical text using BioBERT
        
        Args:
            text: Clinical text (notes, reports, etc.)
            
        Returns:
            Dictionary with extracted entities:
            {
                'diagnoses': [...],
                'procedures': [...],
                'medications': [...],
                'icd10_codes': [...],
                'cpt_codes': [...],
                'ndc_codes': [...]
            }
        """
        # Tokenize
        inputs = self.tokenizers['biobert'](
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        ).to(self.device)
        
        # Get predictions
        with torch.no_grad():
            outputs = self.models['biobert'](**inputs)
            predictions = torch.argmax(outputs.logits, dim=2)
        
        # Extract entities (simplified - in production, use proper NER labels)
        entities = {
            'diagnoses': self._extract_diagnoses(text),
            'procedures': self._extract_procedures(text),
            'medications': self._extract_medications(text),
            'icd10_codes': self._extract_icd10_codes(text),
            'cpt_codes': self._extract_cpt_codes(text),
            'ndc_codes': self._extract_ndc_codes(text)
        }
        
        return entities
    
    def _extract_icd10_codes(self, text: str) -> List[str]:
        """Extract ICD-10 codes using regex patterns"""
        # ICD-10 pattern: Letter followed by 2 digits, optional dot and more digits
        pattern = r'\b[A-TV-Z][0-9]{2}\.?[0-9A-TV-Z]{0,4}\b'
        codes = re.findall(pattern, text.upper())
        return list(set(codes))
    
    def _extract_cpt_codes(self, text: str) -> List[str]:
        """Extract CPT codes using regex patterns"""
        # CPT pattern: 5 digits, optional modifier
        pattern = r'\b\d{5}(?:-[A-Z0-9]{2})?\b'
        codes = re.findall(pattern, text)
        # Filter to valid CPT range (00100-99999)
        codes = [c for c in codes if c[:5].isdigit() and 100 <= int(c[:5]) <= 99999]
        return list(set(codes))
    
    def _extract_ndc_codes(self, text: str) -> List[str]:
        """Extract NDC codes using regex patterns"""
        # NDC patterns: 5-4-2, 5-3-2, 5-4-1
        patterns = [
            r'\b\d{5}-\d{4}-\d{2}\b',
            r'\b\d{5}-\d{3}-\d{2}\b',
            r'\b\d{5}-\d{4}-\d{1}\b'
        ]
        codes = []
        for pattern in patterns:
            codes.extend(re.findall(pattern, text))
        return list(set(codes))
    
    def _extract_diagnoses(self, text: str) -> List[str]:
        """Extract diagnosis terms (simplified)"""
        # In production, use BioBERT NER with proper training
        # For now, use keyword matching
        diagnosis_keywords = [
            'diabetes', 'hypertension', 'copd', 'asthma', 'arthritis',
            'depression', 'anxiety', 'cancer', 'pneumonia', 'sepsis'
        ]
        found = []
        text_lower = text.lower()
        for keyword in diagnosis_keywords:
            if keyword in text_lower:
                found.append(keyword.title())
        return found
    
    def _extract_procedures(self, text: str) -> List[str]:
        """Extract procedure terms (simplified)"""
        procedure_keywords = [
            'mri', 'ct scan', 'surgery', 'biopsy', 'endoscopy',
            'colonoscopy', 'x-ray', 'ultrasound', 'ekg', 'echocardiogram'
        ]
        found = []
        text_lower = text.lower()
        for keyword in procedure_keywords:
            if keyword in text_lower:
                found.append(keyword.title())
        return found
    
    def _extract_medications(self, text: str) -> List[str]:
        """Extract medication names (simplified)"""
        # In production, use BioBERT with medical entity recognition
        medication_keywords = [
            'metformin', 'lisinopril', 'atorvastatin', 'metoprolol',
            'amlodipine', 'omeprazole', 'losartan', 'albuterol'
        ]
        found = []
        text_lower = text.lower()
        for keyword in medication_keywords:
            if keyword in text_lower:
                found.append(keyword.title())
        return found
    
    def classify_medical_necessity(self, clinical_text: str, procedure_code: str) -> Dict[str, any]:
        """
        Classify medical necessity using ClinicalBERT
        
        Args:
            clinical_text: Clinical documentation
            procedure_code: CPT/HCPCS code
            
        Returns:
            {
                'score': 0.0-1.0,
                'label': 'necessary' | 'not_necessary' | 'needs_review',
                'confidence': 0.0-1.0,
                'reasoning': str
            }
        """
        # Prepare input
        combined_text = f"Procedure: {procedure_code}. Clinical: {clinical_text}"
        
        inputs = self.tokenizers['clinicalbert'](
            combined_text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        ).to(self.device)
        
        # Get embeddings
        with torch.no_grad():
            outputs = self.models['clinicalbert'](**inputs)
            # Use [CLS] token embedding for classification
            cls_embedding = outputs.last_hidden_state[:, 0, :]
        
        # Simple classification (in production, train a classifier head)
        # For now, use heuristic scoring based on documentation quality
        score = self._calculate_medical_necessity_score(clinical_text, procedure_code)
        
        # Determine label
        if score >= 0.85:
            label = "necessary"
            confidence = score
        elif score >= 0.70:
            label = "needs_review"
            confidence = 0.75
        else:
            label = "not_necessary"
            confidence = 1.0 - score
        
        return {
            'score': score,
            'label': label,
            'confidence': confidence,
            'reasoning': self._generate_reasoning(clinical_text, procedure_code, score)
        }
    
    def _calculate_medical_necessity_score(self, clinical_text: str, procedure_code: str) -> float:
        """Calculate medical necessity score based on documentation quality"""
        score = 0.5  # Base score
        
        # Check for key clinical indicators
        indicators = {
            'diagnosis': ['diagnosis', 'dx', 'condition'],
            'symptoms': ['pain', 'symptom', 'complaint'],
            'history': ['history', 'previous', 'prior'],
            'examination': ['exam', 'physical', 'findings'],
            'treatment': ['treatment', 'therapy', 'conservative'],
            'failed_treatment': ['failed', 'ineffective', 'refractory']
        }
        
        text_lower = clinical_text.lower()
        for category, keywords in indicators.items():
            if any(kw in text_lower for kw in keywords):
                score += 0.08
        
        # Check documentation length (more detailed = better)
        word_count = len(clinical_text.split())
        if word_count > 200:
            score += 0.10
        elif word_count > 100:
            score += 0.05
        
        # Cap at 1.0
        return min(score, 1.0)
    
    def _generate_reasoning(self, clinical_text: str, procedure_code: str, score: float) -> str:
        """Generate human-readable reasoning for the decision"""
        if score >= 0.85:
            return f"Clinical documentation supports medical necessity for {procedure_code}. Adequate clinical justification provided."
        elif score >= 0.70:
            return f"Clinical documentation for {procedure_code} requires additional review. Some supporting information present but may need clarification."
        else:
            return f"Insufficient clinical documentation to support medical necessity for {procedure_code}. Additional information required."
    
    def calculate_semantic_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate semantic similarity between two clinical texts
        Uses PubMedBERT embeddings
        
        Returns: Cosine similarity score (0.0-1.0)
        """
        if 'pubmedbert' not in self.models:
            logger.warning("PubMedBERT not available, using simple similarity")
            return self._simple_similarity(text1, text2)
        
        # Get embeddings for both texts
        emb1 = self._get_embedding(text1, 'pubmedbert')
        emb2 = self._get_embedding(text2, 'pubmedbert')
        
        # Calculate cosine similarity
        similarity = torch.nn.functional.cosine_similarity(emb1, emb2, dim=1)
        return float(similarity[0])
    
    def _get_embedding(self, text: str, model_key: str) -> torch.Tensor:
        """Get text embedding from specified model"""
        inputs = self.tokenizers[model_key](
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        ).to(self.device)
        
        with torch.no_grad():
            outputs = self.models[model_key](**inputs)
            # Use mean pooling of all tokens
            embedding = outputs.last_hidden_state.mean(dim=1)
        
        return embedding
    
    def _simple_similarity(self, text1: str, text2: str) -> float:
        """Simple word-based similarity fallback"""
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        if not union:
            return 0.0
        
        return len(intersection) / len(union)
    
    def assess_documentation_quality(self, clinical_text: str) -> Dict[str, any]:
        """
        Assess quality and completeness of clinical documentation
        
        Returns:
            {
                'quality_score': 0.0-1.0,
                'completeness': 0.0-1.0,
                'missing_elements': [...],
                'recommendations': [...]
            }
        """
        required_elements = {
            'chief_complaint': ['complaint', 'presenting', 'reason'],
            'history': ['history', 'hpi', 'past medical'],
            'physical_exam': ['exam', 'physical', 'examination', 'findings'],
            'assessment': ['assessment', 'impression', 'diagnosis'],
            'plan': ['plan', 'treatment', 'recommendation']
        }
        
        text_lower = clinical_text.lower()
        present_elements = []
        missing_elements = []
        
        for element, keywords in required_elements.items():
            if any(kw in text_lower for kw in keywords):
                present_elements.append(element)
            else:
                missing_elements.append(element)
        
        completeness = len(present_elements) / len(required_elements)
        
        # Quality score based on multiple factors
        word_count = len(clinical_text.split())
        has_codes = bool(self._extract_icd10_codes(clinical_text) or 
                        self._extract_cpt_codes(clinical_text))
        
        quality_score = (
            completeness * 0.6 +  # Completeness is most important
            (min(word_count / 200, 1.0)) * 0.3 +  # Documentation length
            (0.1 if has_codes else 0.0)  # Presence of medical codes
        )
        
        recommendations = []
        if missing_elements:
            recommendations.append(f"Add documentation for: {', '.join(missing_elements)}")
        if word_count < 100:
            recommendations.append("Provide more detailed clinical notes")
        if not has_codes:
            recommendations.append("Include relevant ICD-10/CPT codes")
        
        return {
            'quality_score': quality_score,
            'completeness': completeness,
            'present_elements': present_elements,
            'missing_elements': missing_elements,
            'recommendations': recommendations
        }


# Singleton instance
_nlp_engine = None

def get_nlp_engine(models_cache_dir="/models", device="cpu") -> ClinicalNLPEngine:
    """Get singleton NLP engine instance"""
    global _nlp_engine
    if _nlp_engine is None:
        _nlp_engine = ClinicalNLPEngine(models_cache_dir, device)
    return _nlp_engine


if __name__ == "__main__":
    # Test the NLP engine
    print("Initializing Clinical NLP Engine...")
    engine = get_nlp_engine()
    
    # Test clinical text
    test_text = """
    Patient presents with worsening back pain (M54.5) radiating to left leg.
    History of failed conservative treatment including physical therapy and NSAIDs.
    MRI (72148) ordered to evaluate for disc herniation.
    Patient has diabetes (E11.9) on metformin.
    Physical exam shows limited range of motion and positive straight leg raise.
    """
    
    print("\nTest Clinical Text:")
    print(test_text)
    print("\n" + "="*80)
    
    # Extract entities
    print("\n1. Entity Extraction:")
    entities = engine.extract_medical_entities(test_text)
    for entity_type, values in entities.items():
        if values:
            print(f"  {entity_type}: {values}")
    
    # Classify medical necessity
    print("\n2. Medical Necessity Classification:")
    necessity = engine.classify_medical_necessity(test_text, "72148")
    print(f"  Score: {necessity['score']:.2f}")
    print(f"  Label: {necessity['label']}")
    print(f"  Confidence: {necessity['confidence']:.2f}")
    print(f"  Reasoning: {necessity['reasoning']}")
    
    # Assess documentation quality
    print("\n3. Documentation Quality Assessment:")
    quality = engine.assess_documentation_quality(test_text)
    print(f"  Quality Score: {quality['quality_score']:.2f}")
    print(f"  Completeness: {quality['completeness']:.2f}")
    print(f"  Present: {quality['present_elements']}")
    print(f"  Missing: {quality['missing_elements']}")
    if quality['recommendations']:
        print(f"  Recommendations:")
        for rec in quality['recommendations']:
            print(f"    • {rec}")
    
    print("\n" + "="*80)
    print("✓ NLP Engine test completed successfully!")
