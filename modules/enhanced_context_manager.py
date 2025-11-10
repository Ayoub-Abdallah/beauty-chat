"""
Enhanced Context Manager

This module integrates the ANN Context Retriever with the existing chat system,
providing seamless semantic context retrieval and enhanced memory capabilities.
"""

import json
import logging
from typing import Dict, List, Any, Optional, Tuple
from modules.ann_context_retriever import ANNContextRetriever, RetrievalResult

logger = logging.getLogger(__name__)

class EnhancedContextManager:
    """
    Enhanced context manager that combines traditional conversation memory
    with semantic ANN-based context retrieval
    """
    
    def __init__(self, 
                 conversations_path: str = "data/conversations.json",
                 ann_system_path: str = "../recommendation system",
                 enable_ann: bool = True,
                 max_traditional_context: int = 6):
        """
        Initialize the Enhanced Context Manager
        
        Args:
            conversations_path: Path to conversations.json file
            ann_system_path: Path to ANN recommendation system
            enable_ann: Whether to enable ANN context retrieval
            max_traditional_context: Max traditional context messages to keep
        """
        self.conversations_path = conversations_path
        self.max_traditional_context = max_traditional_context
        self.enable_ann = enable_ann
        
        # Initialize ANN retriever if enabled
        self.ann_retriever = None
        if enable_ann:
            try:
                self.ann_retriever = ANNContextRetriever(ann_system_path=ann_system_path)
                logger.info("ANN Context Retriever initialized successfully")
            except Exception as e:
                logger.warning(f"ANN initialization failed, falling back to traditional context: {e}")
                self.enable_ann = False
                
        # Load existing conversations into ANN system
        if self.ann_retriever:
            self._load_conversations_to_ann()
            
    def _load_conversations_to_ann(self):
        """Load existing conversations into ANN system for embedding computation"""
        try:
            conversations_data = self._load_conversations()
            if conversations_data:
                self.ann_retriever.load_existing_conversations(conversations_data)
                logger.info("Existing conversations loaded into ANN system")
        except Exception as e:
            logger.warning(f"Failed to load conversations to ANN: {e}")
            
    def _load_conversations(self) -> Dict[str, List[Dict]]:
        """Load conversations from JSON file"""
        try:
            with open(self.conversations_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}
            
    def get_enhanced_context(self, 
                           current_message: str,
                           session_id: str,
                           language: str = 'ar') -> Tuple[List[Dict], Dict[str, Any]]:
        """
        Get enhanced context combining traditional and ANN-based retrieval
        
        Args:
            current_message: Current user message
            session_id: Current session ID
            language: Detected language
            
        Returns:
            Tuple of (traditional_context, enhancement_data)
        """
        # Get traditional context (current session history)
        conversations_data = self._load_conversations()
        current_session_context = conversations_data.get(session_id, [])
        
        # Limit traditional context
        if len(current_session_context) > self.max_traditional_context:
            current_session_context = current_session_context[-self.max_traditional_context:]
            
        # Initialize enhancement data
        enhancement_data = {
            'similar_conversations': [],
            'recommended_products': [],
            'context_summary': '',
            'ann_available': self.enable_ann and self.ann_retriever is not None,
            'retrieval_success': False
        }
        
        # Get ANN-based context if available
        if self.ann_retriever:
            try:
                retrieval_result = self.ann_retriever.retrieve_relevant_context(
                    current_message=current_message,
                    current_session_id=session_id,
                    exclude_current_session=True  # Get context from other sessions
                )
                
                enhancement_data.update({
                    'similar_conversations': [
                        {
                            'content': turn.content,
                            'role': turn.role,
                            'session_id': turn.session_id,
                            'similarity': turn.similarity_score,
                            'timestamp': turn.timestamp
                        }
                        for turn in retrieval_result.relevant_conversations
                    ],
                    'recommended_products': retrieval_result.recommended_products,
                    'context_summary': retrieval_result.context_summary,
                    'retrieval_success': retrieval_result.retrieval_success
                })
                
                logger.info(f"ANN context retrieved: {len(enhancement_data['similar_conversations'])} conversations, "
                           f"{len(enhancement_data['recommended_products'])} products")
                           
            except Exception as e:
                logger.error(f"ANN context retrieval failed: {e}")
                enhancement_data['context_summary'] = "Context retrieval temporarily unavailable"
                
        return current_session_context, enhancement_data
        
    def add_message_to_context(self, 
                             session_id: str,
                             role: str, 
                             content: str,
                             timestamp: str):
        """
        Add a message to both traditional and ANN context systems
        
        Args:
            session_id: Session identifier
            role: 'user' or 'model'
            content: Message content
            timestamp: ISO timestamp
        """
        # Add to ANN system for future retrieval
        if self.ann_retriever:
            try:
                self.ann_retriever.add_conversation_turn(
                    role=role,
                    content=content,
                    session_id=session_id,
                    timestamp=timestamp
                )
            except Exception as e:
                logger.warning(f"Failed to add message to ANN system: {e}")
                
    def build_enhanced_system_prompt(self, 
                                   base_prompt: str,
                                   current_message: str,
                                   session_id: str,
                                   language: str,
                                   products_to_recommend: List[Dict]) -> str:
        """
        Build an enhanced system prompt with ANN context
        
        Args:
            base_prompt: Base system prompt
            current_message: Current user message
            session_id: Session ID
            language: Detected language
            products_to_recommend: Current product recommendations
            
        Returns:
            Enhanced system prompt with context
        """
        current_context, enhancement_data = self.get_enhanced_context(
            current_message, session_id, language
        )
        
        enhanced_prompt_parts = [base_prompt]
        
        # Add similar conversation context if available
        if enhancement_data['similar_conversations']:
            enhanced_prompt_parts.append("\nRELEVANT PREVIOUS CONVERSATIONS:")
            for conv in enhancement_data['similar_conversations'][:3]:  # Top 3
                enhanced_prompt_parts.append(
                    f"- {conv['role'].title()}: {conv['content'][:100]}..."
                    f" (similarity: {conv['similarity']:.2f})"
                )
                
        # Add ANN product recommendations if different from current
        ann_products = enhancement_data['recommended_products']
        if ann_products:
            ann_product_ids = {p.get('id') for p in ann_products}
            current_product_ids = {p.get('id') for p in products_to_recommend}
            
            # Find unique ANN recommendations
            unique_ann_products = [
                p for p in ann_products 
                if p.get('id') not in current_product_ids
            ]
            
            if unique_ann_products:
                enhanced_prompt_parts.append(
                    f"\nADDITIONAL SEMANTIC RECOMMENDATIONS (based on conversation history):"
                )
                for product in unique_ann_products[:2]:  # Top 2 additional
                    enhanced_prompt_parts.append(
                        f"- {product.get('title', 'Unknown')} "
                        f"(score: {product.get('score', 0):.2f}, "
                        f"reason: {product.get('reason', 'N/A')})"
                    )
                    
        # Add context instructions
        if enhancement_data['ann_available'] and enhancement_data['retrieval_success']:
            enhanced_prompt_parts.append(
                f"\nCONTEXT MEMORY: Use the above similar conversations to maintain "
                f"consistency and remember user preferences across sessions. "
                f"Reference relevant past discussions naturally."
            )
        elif enhancement_data['ann_available'] and not enhancement_data['retrieval_success']:
            enhanced_prompt_parts.append(
                f"\nNOTE: Context memory is temporarily limited. "
                f"Focus on the current conversation."
            )
            
        return "\n".join(enhanced_prompt_parts)
        
    def get_context_stats(self) -> Dict[str, Any]:
        """Get context system statistics"""
        stats = {
            'traditional_context_enabled': True,
            'ann_context_enabled': self.enable_ann,
            'conversations_file': self.conversations_path
        }
        
        if self.ann_retriever:
            stats.update(self.ann_retriever.get_stats())
            
        return stats
        
    def generate_context_aware_fallback(self, 
                                      message: str,
                                      language: str, 
                                      session_id: str,
                                      base_fallback_func) -> str:
        """
        Generate context-aware fallback using ANN context
        
        Args:
            message: Current message
            language: Detected language
            session_id: Session ID  
            base_fallback_func: Original fallback function
            
        Returns:
            Context-aware response
        """
        if not self.ann_retriever:
            # Use original fallback
            return base_fallback_func(message, language, [])
            
        try:
            # Get similar contexts for better fallback
            _, enhancement_data = self.get_enhanced_context(message, session_id, language)
            
            similar_conversations = enhancement_data.get('similar_conversations', [])
            
            # Build context-aware fallback
            if similar_conversations:
                # Extract context from similar conversations
                context_topics = set()
                for conv in similar_conversations[:3]:
                    content = conv['content'].lower()
                    if any(word in content for word in ['بشرة', 'peau', 'skin']):
                        context_topics.add('skincare')
                    if any(word in content for word in ['شعر', 'cheveux', 'hair']):
                        context_topics.add('haircare')
                    if any(word in content for word in ['مكياج', 'makeup']):
                        context_topics.add('makeup')
                        
                # Generate context-aware response
                if 'skincare' in context_topics and language == 'ar':
                    return ('أشوف إنك كنت تحكي على العناية بالبشرة قبل هيك! '
                           'نكمل من وين وقفنا، واش تحتاجي تعرفي أكثر؟')
                elif 'skincare' in context_topics and language == 'fr':
                    return ('Je vois que vous parliez de soins de la peau ! '
                           'Continuons où nous nous sommes arrêtés, que souhaitez-vous savoir de plus ?')
                           
            # Use original fallback with empty history
            return base_fallback_func(message, language, [])
            
        except Exception as e:
            logger.warning(f"Context-aware fallback failed: {e}")
            return base_fallback_func(message, language, [])

# Global instance for easy import
enhanced_context_manager = None

def initialize_context_manager(**kwargs) -> EnhancedContextManager:
    """Initialize global context manager"""
    global enhanced_context_manager
    enhanced_context_manager = EnhancedContextManager(**kwargs)
    return enhanced_context_manager

def get_context_manager() -> Optional[EnhancedContextManager]:
    """Get the global context manager instance"""
    return enhanced_context_manager
