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
    return JSON.parse(raw || '[]');
  } catch (e) {
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

// Helper: naive relevance by keyword overlap
function getRelevantEntries(message, top = 3) {
  const kb = readKB();
  const q = (message || '').toLowerCase();
  if (!q || kb.length === 0) return [];
  const scores = kb.map(doc => {
    const text = `${doc.title} ${doc.content} ${(doc.tags || []).join(' ')}`.toLowerCase();
    let score = 0;
    const words = q.split(/\s+/).filter(Boolean);
    words.forEach(w => {
      if (text.includes(w)) score += 1;
    });
    if (score === 0 && (doc.title || '').toLowerCase().includes(q)) score += 2;
    return { doc, score };
  });
  return scores.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, top).map(s => s.doc);
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enhanced Gemini API integration with retry logic and fallback models
 * @param {string} contextualPrompt - Full prompt including system instructions and conversation history
 * @param {string} currentMessage - Current user message
 * @param {number} retryCount - Current retry attempt (default: 0)
 * @returns {string} AI response text
 */
async function callGemini(contextualPrompt, currentMessage, retryCount = 0) {
  const { GoogleGenAI } = require('@google/genai');
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not set in .env file');
    throw new Error('GEMINI_API_KEY not set');
  }

  // List of models to try in order (fallback cascade)
  // Tested models that work with @google/genai v1beta
  const models = [
    process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
    'gemini-pro-latest',  // Most reliable fallback
    'gemini-2.0-flash-exp' // Try experimental again as final fallback
  ];
  
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const currentModel = models[modelIndex];
      
      try {
        console.log(`🤖 Attempting Gemini API call [Attempt ${attempt + 1}/${maxRetries + 1}, Model: ${currentModel}]...`);
        
        const ai = new GoogleGenAI({ apiKey });
        const fullPrompt = `${contextualPrompt}\nClient: ${currentMessage}\n\nConsultant:`;
        
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: fullPrompt,
        });
        
        console.log(`✅ Gemini API call successful with model: ${currentModel}`);
        return response.text;
        
      } catch (error) {
        const errorMessage = error.message || JSON.stringify(error);
        const isOverloaded = errorMessage.includes('503') || 
                           errorMessage.includes('overloaded') || 
                           errorMessage.includes('UNAVAILABLE');
        const isNotFound = errorMessage.includes('404') || errorMessage.includes('not found');
        
        console.warn(`⚠️  Model ${currentModel} failed:`, errorMessage);
        
        // If model not found, try next model immediately
        if (isNotFound && modelIndex < models.length - 1) {
          console.log(`⏭️  Model not found, trying next model...`);
          continue;
        }
        
        // If overloaded and we have retries left, wait and retry
        if (isOverloaded && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
          console.log(`⏳ API overloaded. Waiting ${delay}ms before retry ${attempt + 2}/${maxRetries + 1}...`);
          await sleep(delay);
          break; // Break model loop to retry from first model
        }
        
        // If it's the last attempt and last model, throw the error
        if (attempt === maxRetries && modelIndex === models.length - 1) {
          throw error;
        }
      }
    }
  }
  
  // This should never be reached, but just in case
  throw new Error('All retry attempts exhausted');
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

  // Get top 3 relevant KB entries based on current message and recent conversation context
  const searchContext = conversationHistory.length > 0 
    ? message + ' ' + conversationHistory.slice(-4).map(msg => msg.content).join(' ')
    : message;
  const relevant = getRelevantEntries(searchContext, 3);
  const contextText = relevant.map(r => `Produit: ${r.title}\nDescription: ${r.content}\nTags: ${(r.tags||[]).join(', ')}\n---`).join('\n');

  // Build comprehensive system prompt with role definition
  const baseSystemPrompt = `
You are ${p.role}.
Tone: ${p.tone}.

IMPORTANT CONVERSATION RULES:
- Reply in ${language}, using simple and natural expressions that feel human and localized for Algeria
- Remember and reference previous parts of our conversation when relevant
- Build on topics we've already discussed
- If the client mentioned specific skin concerns, products, or preferences before, acknowledge them
- Use the product knowledge base to provide accurate recommendations with DA pricing
- Always end with a helpful question or offer to maintain conversation flow
- Be consistent with your previous advice and recommendations

Available Products in Our Shop:
${contextText}

Your personality: You are a warm, trustworthy Algerian beauty consultant in a real beauty shop. Maintain a consistent, caring relationship with each client throughout the conversation.`;

  // Build contextual prompt including conversation history
  const contextualPrompt = buildConversationContext(conversationHistory, baseSystemPrompt);

  // Add current user message to history before getting AI response
  addMessageToHistory(currentSessionId, 'user', message);

  // Get AI response with full context and error handling
  let gResponse;
  try {
    gResponse = await callGemini(contextualPrompt, message);
  } catch (error) {
    const errorMessage = error.message || JSON.stringify(error);
    console.error('❌ All Gemini API attempts failed:', errorMessage);
    
    // Provide a helpful fallback response based on the error
    const isOverloaded = errorMessage.includes('503') || 
                        errorMessage.includes('overloaded') || 
                        errorMessage.includes('UNAVAILABLE');
    
    if (isOverloaded) {
      gResponse = language.includes('Arabic') 
        ? `عذراً حبيبتي 🌸 النظام مشغول شوية دابا. ممكن تجربي بعد شوية؟ أو اسأليني بطريقة أخرى وراح نساعدك 💕`
        : `Désolée ma chérie 🌸 Le système est un peu surchargé en ce moment. Pouvez-vous réessayer dans quelques instants? Ou posez votre question différemment et je vous aiderai 💕`;
    } else {
      gResponse = language.includes('Arabic')
        ? `معليش، صار خلل صغير 😔 ممكن تعاودي السؤال؟`
        : `Pardon, il y a eu un petit problème technique 😔 Pouvez-vous reformuler votre question?`;
    }
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
    relevant, 
    action, 
    actionResult,
    sessionId: currentSessionId,
    conversationLength: conversationHistory.length + 2, // +2 for current exchange
    memoryStatus: `${Math.floor(conversationHistory.length / 2)} exchanges remembered`
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

module.exports = router;
