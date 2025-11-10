"""
ANN Context Retriever Module

This module integrates with an existing ANN recommendation system to provide
semantic context retrieval for conversational AI assistants.

Features:
- Semantic similarity search for conversation history
- Product recommendation integration 
- Conversation embedding storage and retrieval
- Graceful fallback when ANN system is unavailable
- Modular design for reuse across different assistant types
"""

import os
import sys
import json
import logging
import asyncio
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
from pathlib import Path

# Configure logging
logger = logging.getLogger(__name__)

@dataclass
class ConversationTurn:
    """Represents a single conversation exchange"""
    role: str  # 'user' or 'model'
    content: str
    timestamp: str
    session_id: str
    embedding: Optional[np.ndarray] = None
    similarity_score: Optional[float] = None

@dataclass
class RetrievalResult:
    """Contains retrieved context and recommendations"""
    relevant_conversations: List[ConversationTurn]
    recommended_products: List[Dict[str, Any]]
    context_summary: str
    retrieval_success: bool
    error_message: Optional[str] = None

class ANNContextRetriever:
    """
    Semantic context retriever using ANN recommendation system
    
    This class provides semantic search capabilities for conversation history
    and integrates with an existing ANN-based product recommendation system.
    """
    
    def __init__(self, 
                 ann_system_path: str = "../recommendation system",
                 max_context_turns: int = 5,
                 similarity_threshold: float = 0.7,
                 embedding_cache_size: int = 1000):
        """
        Initialize the ANN Context Retriever
        
        Args:
            ann_system_path: Path to the ANN recommendation system
            max_context_turns: Maximum number of context turns to retrieve
            similarity_threshold: Minimum similarity score for relevance
            embedding_cache_size: Maximum embeddings to cache in memory
        """
        self.ann_system_path = Path(ann_system_path)
        self.max_context_turns = max_context_turns
        self.similarity_threshold = similarity_threshold
        self.embedding_cache_size = embedding_cache_size
        
        # Initialize components
        self.embedding_cache = {}  # Cache for conversation embeddings
        self.conversation_store = []  # All conversation turns with embeddings
        self.ann_recommender = None
        self.embedding_model = None
        
        # Initialize the ANN system
        self._init_ann_system()
        
    def _init_ann_system(self):
        """Initialize the ANN recommendation system"""
        try:
            # Add ANN system to Python path
            sys.path.insert(0, str(self.ann_system_path))
            
            # Import ANN system components
            from models.recommender import Recommender
            from utils.embeddings import get_embedding, get_embeddings, model
            
            # Initialize recommender with products
            products_path = self.ann_system_path / "data" / "products.json"
            if not products_path.exists():
                # Try with our knowledge base format
                products_path = Path("data/knowledge.json")
                
            if products_path.exists():
                self.ann_recommender = Recommender(str(products_path))
                logger.info(f"ANN recommender initialized with {products_path}")
            else:
                logger.warning("No products file found, product recommendations disabled")
                
            # Store embedding functions
            self.get_embedding = get_embedding
            self.get_embeddings = get_embeddings
            self.embedding_model = model
            
            logger.info("ANN Context Retriever initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize ANN system: {e}")
            self.ann_recommender = None
            self.embedding_model = None
            
    def add_conversation_turn(self, 
                            role: str, 
                            content: str, 
                            session_id: str,
                            timestamp: Optional[str] = None) -> bool:
        """
        Add a conversation turn and compute its embedding
        
        Args:
            role: 'user' or 'model' 
            content: The conversation content
            session_id: Session identifier
            timestamp: ISO timestamp (auto-generated if None)
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            if timestamp is None:
                timestamp = datetime.now().isoformat()
                
            # Create conversation turn
            turn = ConversationTurn(
                role=role,
                content=content,
                timestamp=timestamp,
                session_id=session_id
            )
            
            # Compute embedding if possible
            if self.embedding_model is not None:
                try:
                    turn.embedding = self.get_embedding(content)
                except Exception as e:
                    logger.warning(f"Failed to compute embedding: {e}")
                    
            # Add to store
            self.conversation_store.append(turn)
            
            # Manage cache size
            if len(self.conversation_store) > self.embedding_cache_size:
                # Remove oldest entries
                self.conversation_store = self.conversation_store[-self.embedding_cache_size:]
                
            return True
            
        except Exception as e:
            logger.error(f"Failed to add conversation turn: {e}")
            return False
            
    def retrieve_relevant_context(self, 
                                 current_message: str,
                                 current_session_id: str,
                                 exclude_current_session: bool = False) -> RetrievalResult:
        """
        Retrieve semantically similar conversation context and product recommendations
        
        Args:
            current_message: The current user message
            current_session_id: Current session ID
            exclude_current_session: Whether to exclude current session from search
            
        Returns:
            RetrievalResult: Retrieved context and recommendations
        """
        try:
            # Compute embedding for current message
            if self.embedding_model is None:
                return self._fallback_retrieval("ANN system not available")
                
            current_embedding = self.get_embedding(current_message)
            
            # Find similar conversations
            similar_turns = []
            
            for turn in self.conversation_store:
                # Skip if no embedding
                if turn.embedding is None:
                    continue
                    
                # Skip current session if requested
                if exclude_current_session and turn.session_id == current_session_id:
                    continue
                    
                # Compute similarity
                similarity = self._cosine_similarity(current_embedding, turn.embedding)
                
                if similarity >= self.similarity_threshold:
                    turn_copy = ConversationTurn(
                        role=turn.role,
                        content=turn.content, 
                        timestamp=turn.timestamp,
                        session_id=turn.session_id,
                        similarity_score=similarity
                    )
                    similar_turns.append(turn_copy)
                    
            # Sort by similarity and take top results
            similar_turns.sort(key=lambda x: x.similarity_score, reverse=True)
            relevant_conversations = similar_turns[:self.max_context_turns]
            
            # Get product recommendations
            recommended_products = []
            if self.ann_recommender is not None:
                try:
                    # Create conversation context for recommendation
                    conversation_context = [current_message]
                    if relevant_conversations:
                        conversation_context.extend([turn.content for turn in relevant_conversations[:3]])
                        
                    recommendations = self.ann_recommender.recommend(
                        session_text=' '.join(conversation_context),
                        top_k=5
                    )
                    recommended_products = recommendations
                    
                except Exception as e:
                    logger.warning(f"Product recommendation failed: {e}")
                    
            # Generate context summary
            context_summary = self._generate_context_summary(
                relevant_conversations, 
                recommended_products
            )
            
            return RetrievalResult(
                relevant_conversations=relevant_conversations,
                recommended_products=recommended_products,
                context_summary=context_summary,
                retrieval_success=True
            )
            
        except Exception as e:
            logger.error(f"Context retrieval failed: {e}")
            return self._fallback_retrieval(str(e))
            
    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Compute cosine similarity between two vectors"""
        try:
            dot_product = np.dot(vec1, vec2)
            norms = np.linalg.norm(vec1) * np.linalg.norm(vec2)
            if norms == 0:
                return 0.0
            return float(dot_product / norms)
        except:
            return 0.0
            
    def _generate_context_summary(self, 
                                 conversations: List[ConversationTurn],
                                 products: List[Dict[str, Any]]) -> str:
        """Generate a summary of retrieved context"""
        summary_parts = []
        
        if conversations:
            summary_parts.append(f"Found {len(conversations)} similar conversations")
            
            # Extract key topics
            topics = set()
            for conv in conversations[:3]:  # Look at top 3
                content_lower = conv.content.lower()
                # Extract beauty/skincare topics
                if any(word in content_lower for word in ['بشرة', 'peau', 'skin']):
                    topics.add('skincare')
                if any(word in content_lower for word in ['شعر', 'cheveux', 'hair']):
                    topics.add('haircare')
                if any(word in content_lower for word in ['مكياج', 'makeup', 'maquillage']):
                    topics.add('makeup')
                    
            if topics:
                summary_parts.append(f"Topics: {', '.join(topics)}")
                
        if products:
            summary_parts.append(f"Found {len(products)} relevant products")
            
        return " | ".join(summary_parts) if summary_parts else "No relevant context found"
        
    def _fallback_retrieval(self, error_msg: str) -> RetrievalResult:
        """Provide fallback when ANN system fails"""
        return RetrievalResult(
            relevant_conversations=[],
            recommended_products=[],
            context_summary="Context retrieval temporarily unavailable",
            retrieval_success=False,
            error_message=error_msg
        )
        
    def load_existing_conversations(self, conversations_data: Dict[str, List[Dict]]):
        """
        Load existing conversation data and compute embeddings
        
        Args:
            conversations_data: Conversation data from conversations.json
        """
        logger.info("Loading existing conversations for embedding computation...")
        
        loaded_count = 0
        for session_id, messages in conversations_data.items():
            for msg in messages:
                success = self.add_conversation_turn(
                    role=msg.get('role', 'user'),
                    content=msg.get('content', ''),
                    session_id=session_id,
                    timestamp=msg.get('timestamp')
                )
                if success:
                    loaded_count += 1
                    
        logger.info(f"Loaded {loaded_count} conversation turns with embeddings")
        
    def get_stats(self) -> Dict[str, Any]:
        """Get retriever statistics"""
        return {
            "total_conversations": len(self.conversation_store),
            "embedding_model_available": self.embedding_model is not None,
            "recommender_available": self.ann_recommender is not None,
            "cache_usage": f"{len(self.conversation_store)}/{self.embedding_cache_size}"
        }

# Factory function for easy integration
def create_context_retriever(**kwargs) -> ANNContextRetriever:
    """Create and initialize an ANN Context Retriever"""
    return ANNContextRetriever(**kwargs)
