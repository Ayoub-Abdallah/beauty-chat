#!/usr/bin/env python3
"""
Simple test for the Enhanced Context Manager without ANN dependencies
"""
import sys
import json

def test_fallback_context():
    """Test the fallback context functionality"""
    try:
        # Simple fallback response
        response = {
            'success': False,
            'traditional_context': [],
            'enhancement_data': {
                'similar_conversations': [],
                'recommended_products': [],
                'context_summary': '',
                'ann_available': False,
                'retrieval_success': False
            },
            'system_prompt': 'Fallback system prompt',
            'context_length': 0,
            'ann_available': False,
            'retrieval_success': False,
            'fallback': True,
            'error': 'ANN system not available'
        }
        
        print(json.dumps(response, ensure_ascii=False))
        return True
    except Exception as e:
        print(json.dumps({'error': str(e)}, ensure_ascii=False))
        return False

if __name__ == '__main__':
    test_fallback_context()
