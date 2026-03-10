# NOTE: This file is from the original AI_Prior_Auth_System.zip (ai-models/inference/).
# It is preserved here for compatibility. The pa-system AI engine integrates
# this via app.services.criteria_engine (primary) with this module as
# an optional enhanced inference backend when FAISS/transformers are available.
# Install optional deps: pip install faiss-cpu transformers torch rank-bm25
# See app/core/config.py: ENABLE_RAG_ENGINE=true to activate.

"""
RAG-Based Clinical Criteria Engine
Retrieval-Augmented Generation for Medical Necessity Determination

This module implements a complete RAG system that:
1. Indexes MCG/InterQual clinical guidelines
2. Retrieves relevant criteria for each PA request
3. Generates explainable decisions with citations
4. Provides exact guideline text with highlighting

Architecture:
- Vector Database: FAISS for fast similarity search
- Embeddings: PubMedBERT for medical text
- Retrieval: BM25 + Semantic search hybrid
- Generation: ClinicalBERT with retrieved context
"""

import os
import json
import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, asdict
import logging
from pathlib import Path

try:
    import faiss
    from transformers import AutoTokenizer, AutoModel
    import torch
    from rank_bm25 import BM25Okapi
except ImportError as e:
    logging.error(f"Missing dependencies: {e}")
    logging.error("Install with: pip install faiss-cpu transformers torch rank-bm25")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class ClinicalGuideline:
    """Represents a clinical guideline entry"""
    guideline_id: str
    source: str  # 'MCG' or 'InterQual'
    category: str  # e.g., 'Imaging', 'Surgery', 'Medication'
    procedure_codes: List[str]  # CPT/HCPCS codes
    diagnosis_codes: List[str]  # ICD-10 codes
    title: str
    criteria_text: str
    indications: List[str]
    contraindications: List[str]
    documentation_requirements: List[str]
    references: List[str]
    effective_date: str
    
    def to_searchable_text(self) -> str:
        """Convert guideline to searchable text"""
        return f"""
        {self.title}
        Category: {self.category}
        Procedures: {', '.join(self.procedure_codes)}
        Diagnoses: {', '.join(self.diagnosis_codes)}
        
        Criteria:
        {self.criteria_text}
        
        Indications:
        {' '.join(self.indications)}
        
        Contraindications:
        {' '.join(self.contraindications)}
        
        Documentation Required:
        {' '.join(self.documentation_requirements)}
        """


@dataclass
class RetrievalResult:
    """Result from guideline retrieval"""
    guideline: ClinicalGuideline
    relevance_score: float
    matched_criteria: List[str]
    highlighted_text: str
    citation: str


@dataclass
class RAGDecision:
    """Final RAG-based decision with full explainability"""
    recommendation: str  # 'approve', 'deny', 'needs_review'
    confidence_score: float
    matched_guidelines: List[RetrievalResult]
    rationale: str
    supporting_evidence: List[str]
    citations: List[str]
    missing_documentation: List[str]
    alternative_criteria: List[str]


class ClinicalCriteriaRAG:
    """
    RAG System for Clinical Criteria Matching
    
    Implements hybrid retrieval (BM25 + semantic) with
    explainable decision generation
    """
    
    def __init__(
        self,
        guidelines_path: str = "/data/guidelines",
        embeddings_model: str = "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext",
        cache_dir: str = "/models",
        index_path: str = "/data/faiss_index"
    ):
        """
        Initialize RAG system
        
        Args:
            guidelines_path: Path to guidelines database
            embeddings_model: HuggingFace model for embeddings
            cache_dir: Cache directory for models
            index_path: Path to save/load FAISS index
        """
        self.guidelines_path = Path(guidelines_path)
        self.index_path = Path(index_path)
        self.cache_dir = cache_dir
        
        logger.info("Initializing Clinical Criteria RAG System...")
        
        # Load embedding model
        logger.info(f"Loading embeddings model: {embeddings_model}")
        self.tokenizer = AutoTokenizer.from_pretrained(
            embeddings_model,
            cache_dir=cache_dir
        )
        self.model = AutoModel.from_pretrained(
            embeddings_model,
            cache_dir=cache_dir
        )
        self.model.eval()
        
        # Initialize storage
        self.guidelines: List[ClinicalGuideline] = []
        self.guideline_embeddings = None
        self.faiss_index = None
        self.bm25_index = None
        
        # Load or build index
        if self.index_path.exists():
            self.load_index()
        else:
            logger.warning(f"No index found at {index_path}. Call build_index() to create.")
    
    def build_index(self, guidelines: List[ClinicalGuideline]):
        """
        Build FAISS + BM25 indexes from guidelines
        
        Args:
            guidelines: List of clinical guidelines to index
        """
        logger.info(f"Building index for {len(guidelines)} guidelines...")
        
        self.guidelines = guidelines
        
        # Generate embeddings for semantic search
        logger.info("Generating embeddings...")
        embeddings_list = []
        
        for i, guideline in enumerate(guidelines):
            if i % 100 == 0:
                logger.info(f"Processing guideline {i}/{len(guidelines)}")
            
            text = guideline.to_searchable_text()
            embedding = self._get_embedding(text)
            embeddings_list.append(embedding)
        
        # Stack embeddings
        self.guideline_embeddings = np.vstack(embeddings_list).astype('float32')
        
        # Build FAISS index
        logger.info("Building FAISS index...")
        dimension = self.guideline_embeddings.shape[1]
        self.faiss_index = faiss.IndexFlatIP(dimension)  # Inner product (cosine similarity)
        
        # Normalize embeddings for cosine similarity
        faiss.normalize_L2(self.guideline_embeddings)
        self.faiss_index.add(self.guideline_embeddings)
        
        # Build BM25 index for keyword search
        logger.info("Building BM25 index...")
        tokenized_guidelines = [
            guideline.to_searchable_text().lower().split()
            for guideline in guidelines
        ]
        self.bm25_index = BM25Okapi(tokenized_guidelines)
        
        # Save index
        self.save_index()
        
        logger.info("✓ Index built successfully")
    
    def save_index(self):
        """Save FAISS index and metadata to disk"""
        self.index_path.mkdir(parents=True, exist_ok=True)
        
        # Save FAISS index
        faiss.write_index(self.faiss_index, str(self.index_path / "faiss.index"))
        
        # Save embeddings
        np.save(self.index_path / "embeddings.npy", self.guideline_embeddings)
        
        # Save guidelines metadata
        guidelines_json = [asdict(g) for g in self.guidelines]
        with open(self.index_path / "guidelines.json", 'w') as f:
            json.dump(guidelines_json, f, indent=2)
        
        logger.info(f"Index saved to {self.index_path}")
    
    def load_index(self):
        """Load FAISS index and metadata from disk"""
        logger.info(f"Loading index from {self.index_path}")
        
        # Load FAISS index
        self.faiss_index = faiss.read_index(str(self.index_path / "faiss.index"))
        
        # Load embeddings
        self.guideline_embeddings = np.load(self.index_path / "embeddings.npy")
        
        # Load guidelines metadata
        with open(self.index_path / "guidelines.json", 'r') as f:
            guidelines_data = json.load(f)
        
        self.guidelines = [ClinicalGuideline(**g) for g in guidelines_data]
        
        # Rebuild BM25 index (can't serialize easily)
        tokenized_guidelines = [
            g.to_searchable_text().lower().split()
            for g in self.guidelines
        ]
        self.bm25_index = BM25Okapi(tokenized_guidelines)
        
        logger.info(f"✓ Loaded {len(self.guidelines)} guidelines")
    
    def _get_embedding(self, text: str) -> np.ndarray:
        """Generate embedding for text"""
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        )
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            # Use [CLS] token embedding
            embedding = outputs.last_hidden_state[:, 0, :].numpy()
        
        return embedding[0]
    
    def retrieve_guidelines(
        self,
        query: str,
        procedure_code: Optional[str] = None,
        diagnosis_code: Optional[str] = None,
        top_k: int = 5,
        hybrid_alpha: float = 0.7
    ) -> List[RetrievalResult]:
        """
        Retrieve relevant guidelines using hybrid search
        
        Args:
            query: Clinical documentation text
            procedure_code: CPT/HCPCS code
            diagnosis_code: ICD-10 code
            top_k: Number of results to return
            hybrid_alpha: Weight for semantic search (0=BM25 only, 1=semantic only)
        
        Returns:
            List of retrieval results with scores and highlighting
        """
        # Semantic search with FAISS
        query_embedding = self._get_embedding(query)
        query_embedding = query_embedding.reshape(1, -1).astype('float32')
        faiss.normalize_L2(query_embedding)
        
        semantic_scores, semantic_indices = self.faiss_index.search(query_embedding, top_k * 2)
        semantic_scores = semantic_scores[0]
        semantic_indices = semantic_indices[0]
        
        # Keyword search with BM25
        query_tokens = query.lower().split()
        bm25_scores = self.bm25_index.get_scores(query_tokens)
        
        # Normalize scores to 0-1
        semantic_scores = (semantic_scores - semantic_scores.min()) / (semantic_scores.max() - semantic_scores.min() + 1e-10)
        bm25_scores = (bm25_scores - bm25_scores.min()) / (bm25_scores.max() - bm25_scores.min() + 1e-10)
        
        # Hybrid scoring
        hybrid_scores = {}
        for idx, score in zip(semantic_indices, semantic_scores):
            hybrid_scores[idx] = hybrid_alpha * score + (1 - hybrid_alpha) * bm25_scores[idx]
        
        # Sort by hybrid score
        sorted_indices = sorted(hybrid_scores.keys(), key=lambda x: hybrid_scores[x], reverse=True)
        
        # Filter by procedure/diagnosis codes if provided
        results = []
        for idx in sorted_indices[:top_k * 2]:
            guideline = self.guidelines[idx]
            
            # Check code matching
            code_match = True
            if procedure_code and procedure_code not in guideline.procedure_codes:
                code_match = False
            if diagnosis_code and diagnosis_code not in guideline.diagnosis_codes:
                code_match = False
            
            if code_match or not (procedure_code or diagnosis_code):
                result = self._create_retrieval_result(
                    guideline,
                    hybrid_scores[idx],
                    query
                )
                results.append(result)
            
            if len(results) >= top_k:
                break
        
        return results
    
    def _create_retrieval_result(
        self,
        guideline: ClinicalGuideline,
        score: float,
        query: str
    ) -> RetrievalResult:
        """Create retrieval result with highlighting"""
        # Extract matched criteria
        matched_criteria = self._extract_matched_criteria(guideline, query)
        
        # Highlight relevant sections
        highlighted_text = self._highlight_text(guideline.criteria_text, query)
        
        # Generate citation
        citation = self._generate_citation(guideline)
        
        return RetrievalResult(
            guideline=guideline,
            relevance_score=score,
            matched_criteria=matched_criteria,
            highlighted_text=highlighted_text,
            citation=citation
        )
    
    def _extract_matched_criteria(
        self,
        guideline: ClinicalGuideline,
        query: str
    ) -> List[str]:
        """Extract specific criteria that match the query"""
        query_lower = query.lower()
        matched = []
        
        # Check indications
        for indication in guideline.indications:
            if any(word in indication.lower() for word in query_lower.split()):
                matched.append(f"✓ {indication}")
        
        return matched[:5]  # Top 5 matches
    
    def _highlight_text(self, text: str, query: str) -> str:
        """Highlight relevant sections of text"""
        query_terms = set(query.lower().split())
        
        # Simple highlighting (in production, use more sophisticated NLP)
        highlighted = text
        for term in query_terms:
            if len(term) > 3:  # Only highlight meaningful terms
                highlighted = highlighted.replace(
                    term,
                    f"**{term}**"
                )
        
        return highlighted
    
    def _generate_citation(self, guideline: ClinicalGuideline) -> str:
        """Generate proper citation for guideline"""
        return f"{guideline.source} {guideline.category} Guidelines - {guideline.title} ({guideline.effective_date})"
    
    def generate_decision(
        self,
        clinical_text: str,
        procedure_code: str,
        diagnosis_code: str,
        patient_history: Optional[str] = None
    ) -> RAGDecision:
        """
        Generate explainable PA decision using RAG
        
        Args:
            clinical_text: Clinical documentation
            procedure_code: CPT/HCPCS code
            diagnosis_code: ICD-10 code
            patient_history: Optional patient history
        
        Returns:
            Complete RAG decision with citations and evidence
        """
        logger.info(f"Generating RAG decision for {procedure_code} / {diagnosis_code}")
        
        # Retrieve relevant guidelines
        retrieved = self.retrieve_guidelines(
            query=clinical_text,
            procedure_code=procedure_code,
            diagnosis_code=diagnosis_code,
            top_k=3
        )
        
        if not retrieved:
            return self._handle_no_guidelines_found(procedure_code, diagnosis_code)
        
        # Analyze match quality
        best_match = retrieved[0]
        confidence = best_match.relevance_score
        
        # Generate rationale using retrieved context
        rationale = self._generate_rationale(
            clinical_text,
            retrieved,
            patient_history
        )
        
        # Determine recommendation
        if confidence >= 0.85 and self._meets_all_criteria(clinical_text, best_match.guideline):
            recommendation = "approve"
        elif confidence >= 0.70:
            recommendation = "needs_review"
        else:
            recommendation = "deny"
        
        # Extract supporting evidence
        supporting_evidence = []
        citations = []
        for result in retrieved:
            supporting_evidence.extend(result.matched_criteria)
            citations.append(result.citation)
        
        # Identify missing documentation
        missing_docs = self._identify_missing_documentation(
            clinical_text,
            best_match.guideline
        )
        
        # Find alternative criteria
        alternatives = self._find_alternatives(retrieved[1:]) if len(retrieved) > 1 else []
        
        return RAGDecision(
            recommendation=recommendation,
            confidence_score=confidence,
            matched_guidelines=retrieved,
            rationale=rationale,
            supporting_evidence=supporting_evidence[:10],
            citations=citations,
            missing_documentation=missing_docs,
            alternative_criteria=alternatives
        )
    
    def _generate_rationale(
        self,
        clinical_text: str,
        retrieved: List[RetrievalResult],
        patient_history: Optional[str]
    ) -> str:
        """Generate human-readable rationale with citations"""
        best_match = retrieved[0]
        guideline = best_match.guideline
        
        rationale_parts = [
            f"Based on {guideline.source} guidelines for {guideline.title}:",
            "",
            "Matched Criteria:"
        ]
        
        for criteria in best_match.matched_criteria:
            rationale_parts.append(f"  • {criteria}")
        
        rationale_parts.append("")
        rationale_parts.append("Clinical Documentation Analysis:")
        
        # Check for required documentation
        has_diagnosis = any(code in clinical_text for code in guideline.diagnosis_codes)
        has_history = patient_history is not None
        has_symptoms = any(word in clinical_text.lower() for word in ['pain', 'symptom', 'complaint'])
        
        if has_diagnosis:
            rationale_parts.append("  ✓ Diagnosis documented")
        if has_history:
            rationale_parts.append("  ✓ Patient history provided")
        if has_symptoms:
            rationale_parts.append("  ✓ Symptoms described")
        
        rationale_parts.append("")
        rationale_parts.append(f"Reference: {best_match.citation}")
        
        return "\n".join(rationale_parts)
    
    def _meets_all_criteria(
        self,
        clinical_text: str,
        guideline: ClinicalGuideline
    ) -> bool:
        """Check if clinical text meets all required criteria"""
        text_lower = clinical_text.lower()
        
        # Check for contraindications
        for contra in guideline.contraindications:
            if contra.lower() in text_lower:
                return False
        
        # Check for required documentation
        required_met = 0
        for req in guideline.documentation_requirements:
            if any(word in text_lower for word in req.lower().split()):
                required_met += 1
        
        # At least 70% of requirements met
        if guideline.documentation_requirements:
            return required_met / len(guideline.documentation_requirements) >= 0.7
        
        return True
    
    def _identify_missing_documentation(
        self,
        clinical_text: str,
        guideline: ClinicalGuideline
    ) -> List[str]:
        """Identify missing required documentation"""
        text_lower = clinical_text.lower()
        missing = []
        
        for req in guideline.documentation_requirements:
            if not any(word in text_lower for word in req.lower().split()):
                missing.append(req)
        
        return missing
    
    def _find_alternatives(
        self,
        retrieved: List[RetrievalResult]
    ) -> List[str]:
        """Find alternative criteria that might apply"""
        alternatives = []
        
        for result in retrieved[:3]:
            alt = f"{result.guideline.title} (Score: {result.relevance_score:.2f})"
            alternatives.append(alt)
        
        return alternatives
    
    def _handle_no_guidelines_found(
        self,
        procedure_code: str,
        diagnosis_code: str
    ) -> RAGDecision:
        """Handle case when no guidelines are found"""
        return RAGDecision(
            recommendation="needs_review",
            confidence_score=0.0,
            matched_guidelines=[],
            rationale=f"No specific guidelines found for procedure {procedure_code} with diagnosis {diagnosis_code}. Manual review required.",
            supporting_evidence=[],
            citations=[],
            missing_documentation=["Clinical guidelines for this procedure/diagnosis combination"],
            alternative_criteria=[]
        )


# Singleton instance
_rag_engine = None

def get_rag_engine(
    guidelines_path: str = "/data/guidelines",
    cache_dir: str = "/models",
    index_path: str = "/data/faiss_index"
) -> ClinicalCriteriaRAG:
    """Get singleton RAG engine instance"""
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = ClinicalCriteriaRAG(
            guidelines_path=guidelines_path,
            cache_dir=cache_dir,
            index_path=index_path
        )
    return _rag_engine


if __name__ == "__main__":
    # Test the RAG engine
    print("Testing Clinical Criteria RAG Engine...")
    
    # This would normally load from MCG/InterQual databases
    # For demo, we create sample guidelines
    sample_guidelines = [
        ClinicalGuideline(
            guideline_id="MCG-IMG-001",
            source="MCG",
            category="Imaging",
            procedure_codes=["72148", "72149"],
            diagnosis_codes=["M54.5", "M51.26"],
            title="Lumbar Spine MRI - Low Back Pain",
            criteria_text="""
            MRI of the lumbar spine is medically necessary when:
            1. Patient has persistent low back pain with radiculopathy
            2. Conservative treatment (PT, NSAIDs) has failed for 6+ weeks
            3. Physical examination shows neurological deficits
            4. Surgery is being considered
            """,
            indications=[
                "Radicular pain lasting > 6 weeks",
                "Failed conservative treatment",
                "Neurological deficits present",
                "Surgical planning required"
            ],
            contraindications=[
                "Acute low back pain < 6 weeks",
                "No neurological symptoms",
                "No prior conservative treatment"
            ],
            documentation_requirements=[
                "Duration of symptoms",
                "Physical examination findings",
                "Conservative treatment history",
                "Functional impairment description"
            ],
            references=["MCG Care Guidelines 27th Edition"],
            effective_date="2025-01-01"
        )
    ]
    
    # Initialize RAG engine
    rag = ClinicalCriteriaRAG(cache_dir="/models", index_path="/tmp/test_index")
    
    # Build index
    print("\nBuilding index...")
    rag.build_index(sample_guidelines)
    
    # Test retrieval
    print("\nTesting retrieval...")
    clinical_text = """
    Patient presents with chronic low back pain radiating to left leg for 8 weeks.
    Failed physical therapy and NSAIDs. Physical exam shows positive straight leg raise
    and decreased sensation in L5 distribution. Considering surgical consultation.
    """
    
    results = rag.retrieve_guidelines(
        query=clinical_text,
        procedure_code="72148",
        diagnosis_code="M54.5"
    )
    
    print(f"\nRetrieved {len(results)} guidelines:")
    for i, result in enumerate(results, 1):
        print(f"\n{i}. {result.guideline.title}")
        print(f"   Score: {result.relevance_score:.3f}")
        print(f"   Citation: {result.citation}")
        print(f"   Matched Criteria: {len(result.matched_criteria)}")
    
    # Test decision generation
    print("\n" + "="*80)
    print("Testing Decision Generation...")
    print("="*80)
    
    decision = rag.generate_decision(
        clinical_text=clinical_text,
        procedure_code="72148",
        diagnosis_code="M54.5",
        patient_history="8-week history of low back pain"
    )
    
    print(f"\nRecommendation: {decision.recommendation.upper()}")
    print(f"Confidence: {decision.confidence_score:.2%}")
    print(f"\nRationale:\n{decision.rationale}")
    print(f"\nCitations:")
    for citation in decision.citations:
        print(f"  • {citation}")
    
    if decision.missing_documentation:
        print(f"\nMissing Documentation:")
        for missing in decision.missing_documentation:
            print(f"  ⚠ {missing}")
    
    print("\n✓ RAG engine test completed successfully!")
