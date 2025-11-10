#!/usr/bin/env python3
"""
Context Bridge

This script serves as a bridge between the Node.js chat system and the 
Python-based Enhanced Context Manager. It provides a command-line interface
for the Node.js system to request enhanced context.

Usage:
    python context_bridge.py <session_id> <message> [--language=ar]
"""

import sys
import json
import argparse
import logging
from pathlib import Path

# Add modules directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Configure logging
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

def load_traditional_context(conversations_path, session_id):
    """Load traditional conversation context as fallback"""
    try:
        if not Path(conversations_path).exists():
            return []
        
        with open(conversations_path, 'r', encoding='utf-8') as f:
            conversations = json.load(f)
        
        session_history = conversations.get(session_id, [])
        # Return last 6 messages for traditional context
        return session_history[-6:] if len(session_history) > 6 else session_history
    except Exception as e:
        logger.error(f"Failed to load traditional context: {e}")
        return []

def get_fallback_response(session_id, message, language, conversations_path, error_msg="ANN system not available"):
    """Generate fallback response when ANN system is unavailable"""
    traditional_context = load_traditional_context(conversations_path, session_id)
    
    return {
        'success': False,
        'traditional_context': traditional_context,
        'enhancement_data': {
            'similar_conversations': [],
            'recommended_products': [],
            'context_summary': '',
            'ann_available': False,
            'retrieval_success': False
        },
        'system_prompt': '',
        'context_length': len(traditional_context),
        'ann_available': False,
        'retrieval_success': False,
        'fallback': True,
        'error': error_msg
    }

# Try to import enhanced context manager, fallback if not available
try:
    from enhanced_context_manager import EnhancedContextManager
    ANN_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Enhanced Context Manager not available: {e}")
    ANN_AVAILABLE = False

def main():
    """Main entry point for the context bridge"""
    parser = argparse.ArgumentParser(description='Enhanced Context Bridge')
    parser.add_argument('session_id', help='Session ID for the conversation')
    parser.add_argument('message', help='Current user message')
    parser.add_argument('--language', default='ar', help='Language code (ar, fr, en)')
    parser.add_argument('--conversations-path', default='data/conversations.json', help='Path to conversations file')
    parser.add_argument('--ann-system-path', default='../recommendation system', help='Path to ANN system')
    parser.add_argument('--disable-ann', action='store_true', help='Disable ANN context retrieval')
    
    args = parser.parse_args()
    
    try:
        # Check if ANN system is available
        if not ANN_AVAILABLE or args.disable_ann:
            # Use fallback context
            response = get_fallback_response(
                args.session_id, 
                args.message, 
                args.language, 
                args.conversations_path, 
                "ANN system disabled or not available"
            )
            print(json.dumps(response, ensure_ascii=False, default=str))
            return
        
        # Initialize Enhanced Context Manager
        context_manager = EnhancedContextManager(
            conversations_path=args.conversations_path,
            ann_system_path=args.ann_system_path,
            enable_ann=True
        )
        
        # Get enhanced context
        traditional_context, enhancement_data = context_manager.get_enhanced_context(
            current_message=args.message,
            session_id=args.session_id,
            language=args.language
        )
        
        # Build system prompt with enhanced context
        system_prompt = context_manager.build_system_prompt_with_context(
            traditional_context=traditional_context,
            enhancement_data=enhancement_data,
            current_message=args.message,
            language=args.language
        )
        
        # Prepare response
        response = {
            'success': True,
            'traditional_context': traditional_context,
            'enhancement_data': enhancement_data,
            'system_prompt': system_prompt,
            'context_length': len(traditional_context),
            'ann_available': enhancement_data.get('ann_available', False),
            'retrieval_success': enhancement_data.get('retrieval_success', False)
        }
        
        # Output JSON response
        print(json.dumps(response, ensure_ascii=False, default=str))
        
    except Exception as e:
        # Handle errors gracefully with fallback
        logger.error(f"Error in enhanced context processing: {e}")
        response = get_fallback_response(
            args.session_id, 
            args.message, 
            args.language, 
            args.conversations_path, 
            str(e)
        )
        
        print(json.dumps(response, ensure_ascii=False, default=str))
        sys.exit(1)

if __name__ == '__main__':
    main()
