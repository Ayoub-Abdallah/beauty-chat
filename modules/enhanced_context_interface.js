/**
 * Enhanced Context Interface
 * 
 * This module provides a Node.js interface to the Python-based Enhanced Context Manager.
 * It handles communication with the ANN context retrieval system and provides fallback
 * mechanisms when the enhanced context system is unavailable.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class EnhancedContextInterface {
    constructor(options = {}) {
        this.conversationsPath = options.conversationsPath || 'data/conversations.json';
        this.annSystemPath = options.annSystemPath || '../recommendation system';
        this.enableAnn = options.enableAnn !== false;
        this.pythonPath = options.pythonPath || 'python3';
        this.bridgeScript = path.join(__dirname, 'context_bridge.py');
        this.timeout = options.timeout || 5000; // 5 second timeout
        
        console.log('[Enhanced Context] Interface initialized');
    }
    
    /**
     * Get enhanced context for a conversation
     * @param {string} sessionId - Session ID
     * @param {string} message - Current user message
     * @param {string} language - Language code (ar, fr, en)
     * @returns {Promise<Object>} Enhanced context data
     */
    async getEnhancedContext(sessionId, message, language = 'ar') {
        return new Promise((resolve) => {
            const args = [
                this.bridgeScript,
                sessionId,
                message,
                `--language=${language}`,
                `--conversations-path=${this.conversationsPath}`,
                `--ann-system-path=${this.annSystemPath}`
            ];
            
            if (!this.enableAnn) {
                args.push('--disable-ann');
            }
            
            const python = spawn(this.pythonPath, args);
            let stdout = '';
            let stderr = '';
            
            // Set timeout for the process
            const timeout = setTimeout(() => {
                python.kill('SIGTERM');
                resolve(this._getFallbackContext(sessionId, message, language, 'Python process timeout'));
            }, this.timeout);
            
            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            python.on('close', (code) => {
                clearTimeout(timeout);
                
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        if (result.success) {
                            console.log(`[Enhanced Context] Successfully retrieved context for session ${sessionId}`);
                            console.log(`[Enhanced Context] ANN available: ${result.ann_available}, Retrieval success: ${result.retrieval_success}`);
                            resolve(result);
                        } else {
                            console.warn(`[Enhanced Context] Python bridge returned error: ${result.error}`);
                            resolve(this._getFallbackContext(sessionId, message, language, result.error));
                        }
                    } catch (parseError) {
                        console.error(`[Enhanced Context] Failed to parse Python response: ${parseError.message}`);
                        resolve(this._getFallbackContext(sessionId, message, language, 'JSON parse error'));
                    }
                } else {
                    console.error(`[Enhanced Context] Python bridge exited with code ${code}`);
                    if (stderr) console.error(`[Enhanced Context] Python stderr: ${stderr}`);
                    resolve(this._getFallbackContext(sessionId, message, language, `Process exit code ${code}`));
                }
            });
            
            python.on('error', (error) => {
                clearTimeout(timeout);
                console.error(`[Enhanced Context] Failed to spawn Python process: ${error.message}`);
                resolve(this._getFallbackContext(sessionId, message, language, error.message));
            });
        });
    }
    
    /**
     * Fallback context when enhanced context is unavailable
     * @private
     */
    _getFallbackContext(sessionId, message, language, error) {
        console.warn(`[Enhanced Context] Using fallback context due to: ${error}`);
        
        // Load traditional context
        const traditionalContext = this._loadTraditionalContext(sessionId);
        
        return {
            success: false,
            traditional_context: traditionalContext,
            enhancement_data: {
                similar_conversations: [],
                recommended_products: [],
                context_summary: '',
                ann_available: false,
                retrieval_success: false
            },
            system_prompt: '',
            context_length: traditionalContext.length,
            ann_available: false,
            retrieval_success: false,
            fallback: true,
            error: error
        };
    }
    
    /**
     * Load traditional conversation context
     * @private
     */
    _loadTraditionalContext(sessionId) {
        try {
            if (!fs.existsSync(this.conversationsPath)) {
                return [];
            }
            
            const conversations = JSON.parse(fs.readFileSync(this.conversationsPath, 'utf8'));
            const sessionHistory = conversations[sessionId] || [];
            
            // Return last 6 messages for traditional context
            return sessionHistory.slice(-6);
        } catch (error) {
            console.error(`[Enhanced Context] Failed to load traditional context: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Check if the enhanced context system is available
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        try {
            const result = await this.getEnhancedContext('test_session', 'test message', 'ar');
            return result.success && result.ann_available;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Extract recommended products from enhancement data
     * @param {Object} enhancementData - Enhancement data from context retrieval
     * @returns {Array} Array of recommended products
     */
    extractRecommendedProducts(enhancementData) {
        if (!enhancementData || !enhancementData.recommended_products) {
            return [];
        }
        
        return enhancementData.recommended_products.map(product => ({
            title: product.title,
            description: product.description || product.content,
            price: product.price,
            tags: product.tags || [],
            relevance_score: product.relevance_score || 0
        }));
    }
    
    /**
     * Extract similar conversation insights
     * @param {Object} enhancementData - Enhancement data from context retrieval
     * @returns {Array} Array of similar conversation snippets
     */
    extractSimilarConversations(enhancementData) {
        if (!enhancementData || !enhancementData.similar_conversations) {
            return [];
        }
        
        return enhancementData.similar_conversations.map(conv => ({
            content: conv.content,
            role: conv.role,
            session_id: conv.session_id,
            similarity_score: conv.similarity_score || 0,
            timestamp: conv.timestamp
        }));
    }
}

module.exports = EnhancedContextInterface;
