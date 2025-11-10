const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const personasPath = path.join(__dirname, '..', 'config', 'personas.json');
const KB_PATH = path.join(__dirname, '..', 'data', 'knowledge.json');
const CONVERSATIONS_PATH = path.join(__dirname, '..', 'data', 'conversations.json');

// Configuration constants for conversation memory
const MAX_CONVERSATION_HISTORY = 15; // Keep last 15 exchanges (30 messages total)
const CONVERSATION_CLEANUP_THRESHOLD = 20; // Cleanup when exceeding this limit

function readKB() {
  try {
    const raw = fs.readFileSync(KB_PATH, 'utf8');
    const kb = JSON.parse(raw || '[]');
    console.log(`[Knowledge Base] Loaded ${kb.length} products successfully`);
    return kb;
  } catch (e) {
    console.error(`[Knowledge Base] Error loading products: ${e.message}`);
    return [];
  }
}

function readPersonas() {
  try {
    return JSON.parse(fs.readFileSync(personasPath, 'utf8'));
  } catch (e) {
    return {};
  }
}

// Enhanced product recommendation system with smart keyword matching
function getRelevantEntries(message, top = 5) {  // Increased from 3 to 5 products
  const kb = readKB();
  const q = (message || '').toLowerCase();
  if (!q || kb.length === 0) return [];
  
  // Enhanced keyword mapping for better product matching
  const skinConcernKeywords = {
    'dry': ['جافة', 'جاف', 'sèche', 'sec', 'hydrat', 'ترطيب', 'hydra'],
    'oily': ['دهنية', 'دهني', 'grasse', 'gras', 'sébum', 'دهون'],
    'sensitive': ['حساسة', 'حساس', 'sensible', 'irritation', 'حساسية'],
    'acne': ['حبوب', 'بثور', 'acné', 'boutons', 'pimple'],
    'aging': ['تجاعيد', 'شيخوخة', 'rides', 'anti-âge', 'vieillissement'],
    'dark-spots': ['تصبغات', 'بقع', 'taches', 'pigmentation'],
    'hair': ['شعر', 'cheveux', 'capillaire'],
    'makeup': ['مكياج', 'مكيلج', 'makeup', 'maquillage']
  };
  
  const scores = kb.map(doc => {
    const text = `${doc.title} ${doc.content} ${(doc.tags || []).join(' ')}`.toLowerCase();
    let score = 0;
    const words = q.split(/\s+/).filter(Boolean);
    
    // Base keyword matching
    words.forEach(w => {
      if (text.includes(w)) score += 1;
      if (doc.title.toLowerCase().includes(w)) score += 3; // Title matches get higher score
      if ((doc.tags || []).some(tag => tag.toLowerCase().includes(w))) score += 2;
    });
    
    // Enhanced concern-based matching
    Object.keys(skinConcernKeywords).forEach(concern => {
      const keywords = skinConcernKeywords[concern];
      const messageHasConcern = keywords.some(keyword => q.includes(keyword));
      const productAddressesConcern = keywords.some(keyword => text.includes(keyword));
      
      if (messageHasConcern && productAddressesConcern) {
        score += 5; // High boost for concern-product matching
      }
    });
    
    // Category bonus - prioritize skincare for skin concerns
    if (q.includes('بشر') || q.includes('peau') || q.includes('skin')) {
      if (doc.category === 'skincare') score += 2;
    }
    
    return { doc, score };
  });
  
  // Always return some products even if no perfect matches
  const results = scores.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  
  // If we have good matches, return them
  if (results.length >= top) {
    return results.slice(0, top).map(s => s.doc);
  }
  
  // If not enough matches, add some popular products from same category
  const matchedProducts = results.map(s => s.doc);
  const remainingSlots = top - matchedProducts.length;
  
  if (remainingSlots > 0) {
    // Add some bestsellers from skincare if looking for skin products
    const fallbackProducts = kb
      .filter(product => !matchedProducts.includes(product))
      .filter(product => product.category === 'skincare')
      .slice(0, remainingSlots);
    
    return [...matchedProducts, ...fallbackProducts];
  }
  
  return matchedProducts;
}

/**
 * Enhanced Gemini API integration with conversation context
 * @param {string} contextualPrompt - Full prompt including system instructions and conversation history
 * @param {string} currentMessage - Current user message
 * @returns {string} AI response text
 */
async function callGemini(contextualPrompt, currentMessage) {
  try {
    const { GoogleGenAI } = require('@google/genai');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    
    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    
    // Build the full prompt with context and current message
    const fullPrompt = `${contextualPrompt}\nClient: ${currentMessage}\n\nConsultant:`;
    
    const response = await ai.models.generateContent({
      model,
      contents: fullPrompt,
    });
    
    return response.text;
  } catch (e) {
    console.warn('Gemini call failed or not configured, falling back to contextual echo. Error:', e.message);
    // Enhanced fallback that maintains conversation context awareness
    return `[Mode écho avec contexte] Je comprends votre question dans le contexte de notre conversation. ${currentMessage.includes('ر') || currentMessage.includes('ت') ? 'أعتذر، النظام في وضع التجربة حالياً.' : 'Désolé, le système est en mode test actuellement.'}`;
  }
}

router.post('/', async (req, res) => {
  const { message, persona, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  // Generate session ID if not provided (for session continuity)
  const currentSessionId = sessionId || uuidv4();
  
  // Periodic cleanup of old conversations (every 10th request approximately)
  if (Math.random() < 0.1) {
    cleanupOldConversations();
  }

  const personas = readPersonas();
  const p = personas['consultant']; // Always use consultant persona

  // Get conversation history for this session
  const conversationHistory = getConversationHistory(currentSessionId);
  
  // Detect user language based on Arabic characters
  const language = /[\u0600-\u06FF]/.test(message) 
    ? "Arabic (Algerian dialect)" 
    : "French";

  // Get top 5 relevant KB entries based on current message and recent conversation context
  const searchContext = conversationHistory.length > 0 
    ? message + ' ' + conversationHistory.slice(-4).map(msg => msg.content).join(' ')
    : message;
  const relevant = getRelevantEntries(searchContext, 5); // Increased to 5 products
  
  // Ensure we always have products to recommend
  let productsToRecommend = relevant;
  if (productsToRecommend.length < 3) {
    // Add popular products if search didn't find enough
    const categoryGuess = message.includes('شعر') || message.includes('cheveux') ? 'haircare' 
                        : message.includes('مكياج') || message.includes('makeup') ? 'makeup'
                        : 'skincare';
    const fallbackProducts = getPopularProducts(categoryGuess, 3 - productsToRecommend.length);
    productsToRecommend = [...productsToRecommend, ...fallbackProducts];
  }

  // Enhanced product formatting for AI context - FORCE USAGE
  const contextText = productsToRecommend.length > 0 
    ? `MANDATORY: You MUST recommend from these specific products in our shop:

${productsToRecommend.map((r, index) => `
PRODUIT ${index + 1} - À RECOMMANDER:
Nom exact: ${r.title}
Description avec prix: ${r.content}
Catégorie: ${r.category}
Tags: ${(r.tags||[]).join(', ')}
---`).join('\n')}

INSTRUCTION CRITIQUE: Dans votre réponse, mentionnez au moins 2-3 de ces produits spécifiques avec leurs noms exacts et prix en DA.`
    : `PRODUITS DE BASE - Recommandez: nettoyants, crèmes hydratantes, protections solaires de notre gamme.`;
  
  console.log(`[Knowledge Base] Found ${relevant.length} relevant + ${productsToRecommend.length - relevant.length} fallback products`);
  console.log(`[Products to recommend] ${productsToRecommend.map(r => `${r.title} (${extractPrice(r.content)}DA)`).join(', ')}`);

  // Build comprehensive system prompt with role definition
  const baseSystemPrompt = `
You are ${p.role}.
Tone: ${p.tone}.

CRITICAL INSTRUCTIONS - PRODUCT RECOMMENDATIONS:
- You MUST actively recommend specific products from the shop inventory below
- Always mention exact product names, prices in DA, and brief benefits  
- When client asks about skin concerns, immediately suggest 2-3 relevant products from inventory
- Use the exact product names and prices from the knowledge base - don't invent products
- If no relevant products found, suggest the closest alternatives from available inventory
- Always prioritize products that match client's budget and skin type

CONVERSATION RULES:
- Reply in ${language}, using simple and natural expressions that feel human and localized for Algeria
- Remember and reference previous parts of our conversation when relevant
- Build on topics we've already discussed
- If the client mentioned specific skin concerns, products, or preferences before, acknowledge them
- Always end with a helpful question or offer to maintain conversation flow
- Be consistent with your previous advice and recommendations

CURRENT SHOP INVENTORY - USE THESE PRODUCTS IN YOUR RECOMMENDATIONS:
${contextText}

EXAMPLE RESPONSE FORMAT:
"For [concern], I recommend [Product Name] at [Price] DA because [brief benefit]. Also consider [Product 2] at [Price] DA for [additional benefit]."

Your personality: You are a warm, trustworthy Algerian beauty consultant in a real beauty shop. You know your inventory perfectly and always recommend specific products with accurate prices.`;

  // Build contextual prompt including conversation history
  const contextualPrompt = buildConversationContext(conversationHistory, baseSystemPrompt);

  // Add current user message to history before getting AI response
  addMessageToHistory(currentSessionId, 'user', message);

  // Get AI response with full context
  let gResponse = await callGemini(contextualPrompt, message);
  
  // Post-processing: Ensure AI response includes product recommendations
  const hasProductMention = productsToRecommend.some(product => 
    gResponse.includes(product.title) || 
    gResponse.includes(extractPrice(product.content) + ' DA') ||
    gResponse.includes(extractPrice(product.content) + 'DA')
  );
  
  if (!hasProductMention && productsToRecommend.length > 0) {
    // Force add product recommendations if AI didn't include them
    const forcedRecommendations = `\n\nVoici mes recommandations spécifiques:\n${
      productsToRecommend.slice(0, 2).map(p => 
        `• ${p.title} - ${extractPrice(p.content)} DA: ${p.content.split('.')[0]}.`
      ).join('\n')
    }\n\nLequel vous intéresse le plus?`;
    
    gResponse += forcedRecommendations;
    console.log('[FORCED PRODUCTS] Added product recommendations to response');
  }
  
  // Add AI response to history
  addMessageToHistory(currentSessionId, 'model', gResponse);

  // Detect JSON action suggestion in response e.g. lines that contain a JSON object starting with {"action":
  let action = null;
  try {
    const jsonMatch = gResponse.match(/\{\s*"action"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      action = parsed;
    }
  } catch (e) {
    // ignore parsing errors
  }

  // If Gemini suggested an action, optionally execute it by calling local action handlers
  let actionResult = null;
  if (action && action.action) {
    try {
      const axios = require('axios');
      // Map action to internal route
      if (action.action === 'search') {
        const q = encodeURIComponent(action.query || '');
        const r = await axios.get(`http://localhost:${process.env.PORT||3000}/action/search?q=${q}`);
        actionResult = r.data;
      } else if (action.action === 'summarize') {
        const r = await axios.post(`http://localhost:${process.env.PORT||3000}/action/summarize`, { text: action.text || '', words: action.words || 50 });
        actionResult = r.data;
      } else if (action.action === 'addKnowledge') {
        const r = await axios.post(`http://localhost:${process.env.PORT||3000}/action/addKnowledge`, action.payload || {});
        actionResult = r.data;
      }
      
      // If action was executed, add it to conversation history
      if (actionResult) {
        addMessageToHistory(currentSessionId, 'model', `Action executed: ${action.action} - ${JSON.stringify(actionResult)}`);
      }
    } catch (e) {
      actionResult = { error: 'failed to execute action', details: e.message };
    }
  }

  // Return response with session information for frontend continuity
  res.json({ 
    reply: gResponse, 
    persona: p, 
    relevant: productsToRecommend, // Use the actual products being recommended
    action, 
    actionResult,
    sessionId: currentSessionId,
    conversationLength: conversationHistory.length + 2, // +2 for current exchange
    memoryStatus: `${Math.floor(conversationHistory.length / 2)} exchanges remembered`,
    debug: {
      searchQuery: searchContext,
      foundProducts: productsToRecommend.length,
      productNames: productsToRecommend.map(p => p.title),
      hasProductMention: productsToRecommend.some(product => 
        gResponse.includes(product.title) || gResponse.includes(extractPrice(product.content) + ' DA')
      )
    }
  });
});

/**
 * Conversation Memory Management System
 * 
 * This system maintains conversation context between user and AI across multiple messages.
 * Each conversation includes:
 * - Session ID for tracking individual conversations
 * - Message history with role (user/model) and content
 * - Automatic cleanup to manage memory and token usage
 * - Persistent storage in JSON file for session continuity
 */

/**
 * Load all conversations from persistent storage
 * @returns {Object} Object containing all conversation histories by session ID
 */
function loadConversations() {
  try {
    if (!fs.existsSync(CONVERSATIONS_PATH)) {
      // Initialize empty conversations file if it doesn't exist
      fs.writeFileSync(CONVERSATIONS_PATH, JSON.stringify({}), 'utf8');
      return {};
    }
    const raw = fs.readFileSync(CONVERSATIONS_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.warn('Error loading conversations, starting fresh:', e.message);
    return {};
  }
}

/**
 * Save conversations to persistent storage
 * @param {Object} conversations - All conversation data to save
 */
function saveConversations(conversations) {
  try {
    fs.writeFileSync(CONVERSATIONS_PATH, JSON.stringify(conversations, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving conversations:', e.message);
  }
}

/**
 * Get conversation history for a specific session
 * @param {string} sessionId - Unique session identifier
 * @returns {Array} Array of message objects with role and content
 */
function getConversationHistory(sessionId) {
  const conversations = loadConversations();
  return conversations[sessionId] || [];
}

/**
 * Add a new message to conversation history
 * @param {string} sessionId - Session identifier
 * @param {string} role - Message role ('user' or 'model')
 * @param {string} content - Message content
 */
function addMessageToHistory(sessionId, role, content) {
  const conversations = loadConversations();
  
  // Initialize conversation if it doesn't exist
  if (!conversations[sessionId]) {
    conversations[sessionId] = [];
  }
  
  // Add new message
  conversations[sessionId].push({
    role: role,
    content: content,
    timestamp: new Date().toISOString()
  });
  
  // Cleanup old messages if conversation gets too long
  if (conversations[sessionId].length > CONVERSATION_CLEANUP_THRESHOLD * 2) {
    // Keep only the last MAX_CONVERSATION_HISTORY exchanges (user + model pairs)
    const keepMessages = MAX_CONVERSATION_HISTORY * 2;
    conversations[sessionId] = conversations[sessionId].slice(-keepMessages);
  }
  
  saveConversations(conversations);
}

/**
 * Build conversation context for Gemini API
 * Formats conversation history for the Gemini API call
 * @param {Array} history - Conversation history array
 * @param {string} systemPrompt - System instruction for the AI
 * @returns {string} Formatted conversation context
 */
function buildConversationContext(history, systemPrompt) {
  let context = systemPrompt + '\n\n';
  
  if (history.length === 0) {
    // First message - include welcoming instruction
    context += 'This is the start of a new conversation. Begin with a warm, friendly greeting in the appropriate language.\n\n';
  } else {
    // Include conversation history
    context += 'Previous conversation context:\n';
    history.forEach(msg => {
      const speaker = msg.role === 'user' ? 'Client' : 'Consultant';
      context += `${speaker}: ${msg.content}\n`;
    });
    context += '\nContinue the conversation naturally, remembering the context above.\n\n';
  }
  
  return context;
}

/**
 * Clean up old conversations to prevent unlimited growth
 * Removes conversations older than 7 days
 */
function cleanupOldConversations() {
  try {
    const conversations = loadConversations();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let cleaned = false;
    
    Object.keys(conversations).forEach(sessionId => {
      const conversation = conversations[sessionId];
      if (conversation.length > 0) {
        const lastMessage = conversation[conversation.length - 1];
        const lastMessageDate = new Date(lastMessage.timestamp);
        
        if (lastMessageDate < sevenDaysAgo) {
          delete conversations[sessionId];
          cleaned = true;
        }
      }
    });
    
    if (cleaned) {
      saveConversations(conversations);
      console.log('Cleaned up old conversations');
    }
  } catch (e) {
    console.warn('Error during conversation cleanup:', e.message);
  }
}

/**
 * Get popular/bestseller products as fallback recommendations
 * @param {string} category - Product category to focus on
 * @param {number} count - Number of products to return
 * @returns {Array} Array of popular products
 */
function getPopularProducts(category = 'skincare', count = 3) {
  const kb = readKB();
  const popularProducts = kb
    .filter(product => product.category === category)
    .sort((a, b) => {
      // Sort by price (assuming mid-range products are more popular)
      const priceA = extractPrice(a.content) || 0;
      const priceB = extractPrice(b.content) || 0;
      return Math.abs(priceA - 2000) - Math.abs(priceB - 2000); // Prefer products around 2000 DA
    })
    .slice(0, count);
  
  return popularProducts;
}

/**
 * Extract price from product content
 * @param {string} content - Product description content
 * @returns {number} Price in DA or 0 if not found
 */
function extractPrice(content) {
  const priceMatch = content.match(/(\d+)\s*DA/i);
  return priceMatch ? parseInt(priceMatch[1]) : 0;
}

// Test endpoint to verify knowledge base and search functionality
router.get('/test-products', (req, res) => {
  const { query } = req.query;
  const kb = readKB();
  
  if (!query) {
    return res.json({
      totalProducts: kb.length,
      categories: [...new Set(kb.map(p => p.category))],
      sampleProducts: kb.slice(0, 5).map(p => ({
        title: p.title,
        price: extractPrice(p.content),
        category: p.category
      }))
    });
  }
  
  const relevant = getRelevantEntries(query, 10);
  res.json({
    query,
    foundProducts: relevant.length,
    products: relevant.map(p => ({
      title: p.title,
      price: extractPrice(p.content),
      category: p.category,
      relevantTags: p.tags.filter(tag => 
        tag.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(tag.toLowerCase())
      )
    }))
  });
});

module.exports = router;
