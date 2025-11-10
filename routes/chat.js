const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import Enhanced Context Interface
const EnhancedContextInterface = require('../modules/enhanced_context_interface');

const personasPath = path.join(__dirname, '..', 'config', 'personas.json');
const KB_PATH = path.join(__dirname, '..', 'data', 'knowledge.json');
const CONVERSATIONS_PATH = path.join(__dirname, '..', 'data', 'conversations.json');
const ORDERS_PATH = path.join(__dirname, '..', 'data', 'orders.json');
const INVENTORY_PATH = path.join(__dirname, '..', 'data', 'inventory.json');

// Initialize Enhanced Context Interface
const enhancedContext = new EnhancedContextInterface({
  conversationsPath: CONVERSATIONS_PATH,
  annSystemPath: '../recommendation system',
  enableAnn: true,
  timeout: 5000
});

// Configuration constants for conversation memory and shopping flow
const MAX_CONVERSATION_HISTORY = 18; // Keep last 18 messages for better context
const CONVERSATION_CLEANUP_THRESHOLD = 25; // Cleanup when exceeding this limit
const MAX_RETRY_ATTEMPTS = 1; // Retry failed Gemini responses once
const SHIPPING_COST = 200; // Fixed shipping cost in DA

// Purchase flow states
const PURCHASE_STATES = {
  BROWSING: 'browsing',
  PRODUCT_IDENTIFIED: 'product_identified', 
  QUANTITY_REQUESTED: 'quantity_requested',
  CUSTOMER_DETAILS: 'customer_details',
  PAYMENT_METHOD: 'payment_method',
  FINAL_CONFIRMATION: 'final_confirmation',
  ORDER_COMPLETE: 'order_complete'
};

// Intent classification patterns
const INTENT_PATTERNS = {
  PURCHASE: [
    /نحب نشري|نحب نقتني|بغيت نشري|نحب هاذي/i,
    /je veux acheter|j'aimerais acheter|je souhaite acheter|add to cart/i,
    /i want to buy|add to cart|purchase|buy this/i
  ],
  PRICE_INQUIRY: [
    /كم السعر|شحال السعر|بكم|واش السعر/i,
    /combien|prix|coût|ça coûte/i,
    /how much|what's the price|price/i
  ],
  CONFIRMATION: [
    /نعم|ايوه|موافق|تأكيد|أكيد/i,
    /oui|d'accord|confirme|ok|yes/i,
    /yes|confirm|agree|proceed/i
  ],
  CANCELLATION: [
    /لا|ألغي|إلغاء|ما نحبش|توقف/i,
    /non|annule|cancel|stop|arrête/i,
    /no|cancel|stop|nevermind/i
  ],
  QUANTITY: /(\d+)\s*(?:قطع|قطعة|عدد|pieces?|units?)/i
};

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
 * Enhanced Gemini API integration with conversation context and retry logic
 * @param {Array} conversationHistory - Full conversation history in Gemini format
 * @param {string} systemPrompt - System instructions
 * @param {string} currentMessage - Current user message
 * @param {string} language - Detected language (ar/fr)
 * @param {number} retryCount - Current retry attempt
 * @returns {string} AI response text
 */
async function callGemini(conversationHistory, systemPrompt, currentMessage, language = 'fr', retryCount = 0) {
  try {
    const { GoogleGenAI } = require('@google/genai');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    
    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    
    // Build conversation in Gemini format
    const contents = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }]
      }
    ];
    
    // Add conversation history (trim to last N messages for token management)
    const recentHistory = conversationHistory.slice(-MAX_CONVERSATION_HISTORY);
    recentHistory.forEach(msg => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    });
    
    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: currentMessage }]
    });
    
    console.log(`[Gemini API] Sending ${contents.length} messages, retry: ${retryCount}`);
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
    });
    
    const responseText = response.response?.text() || '';
    console.log(`[Gemini Response] Length: ${responseText.length}, Content: "${responseText.substring(0, 100)}..."`);
    
    // Check for problematic responses that need retry
    if (isProblematicResponse(responseText, conversationHistory) && retryCount < MAX_RETRY_ATTEMPTS) {
      console.log(`[Gemini Retry] Detected problematic response, retrying...`);
      
      // Add clarifying instruction for retry
      const retryInstruction = language === 'ar' 
        ? 'IMPORTANT: لا تكرر الرد السابق. أجب مباشرة وطبيعياً على سؤال العميل.'
        : 'IMPORTANT: Ne répétez pas la réponse précédente. Répondez directement et naturellement à la question du client.';
      
      const enhancedPrompt = systemPrompt + '\n\n' + retryInstruction;
      
      return await callGemini(conversationHistory, enhancedPrompt, currentMessage, language, retryCount + 1);
    }
    
    return responseText;
    
  } catch (e) {
    console.warn('Gemini call failed, using intelligent fallback. Error:', e.message);
    
    // Enhanced intelligent fallback system
    return generateIntelligentFallback(currentMessage, language, conversationHistory);
  }
}

/**
 * Generate intelligent contextual responses when Gemini API is unavailable
 * @param {string} message - User message
 * @param {string} language - Detected language (ar/fr)
 * @param {Array} history - Conversation history for context
 * @returns {string} Contextual response
 */
function generateIntelligentFallback(message, language, history) {
  const msg = message.toLowerCase();
  
  // Check if this is a new conversation (no history or very short history)
  const isNewConversation = !history || history.length <= 1;
  
  // Handle greetings and common Darja phrases
  if (msg.includes('salam') || msg.includes('hello') || msg.includes('bonjour') || msg.includes('مرحبا')) {
    if (isNewConversation) {
      // Full welcome for new conversation
      if (language === 'ar') {
        return 'وعليكم السلام! أهلاً وسهلاً بيك في متجرنا للجمال والصحة 🌸\n\nانا هنا باش نساعدك تلقي المنتجات المناسبة ليك. قوليلي، واش تحبي تعرفي عليه اليوم؟';
      } else {
        return 'Bonjour et bienvenue dans notre boutique beauté & santé ! 🌸\n\nJe suis là pour vous conseiller les meilleurs produits. Que recherchez-vous aujourd\'hui ?';
      }
    } else {
      // Short greeting for continuing conversation
      if (language === 'ar') {
        return 'أهلاً! كيف نقدر نساعدك أكثر؟ 😊';
      } else {
        return 'Bonjour ! Comment puis-je encore vous aider ? 😊';
      }
    }
  }
  
  // Handle common Darja/Algerian phrases
  if (msg.includes('kif lhal') || msg.includes('kif hal') || msg.includes('كيف الحال')) {
    if (language === 'ar') {
      return 'الحمد لله! كيفك انت؟ 😊 قوليلي كيفاش نقدر نساعدك في الجمال والعناية اليوم؟';
    } else {
      return 'Ça va bien, merci ! Et vous ? 😊 Comment puis-je vous aider pour vos besoins beauté aujourd\'hui ?';
    }
  }
  
  if (msg.includes('wchrakm') || msg.includes('wesh rak') || msg.includes('وش راكم')) {
    if (language === 'ar') {
      return 'لاباس، راني ملیح! 😊 وانت كيفك؟ واش نقدر نساعدك فيه للجمال والعناية؟';
    } else {
      return 'Ça va très bien ! Et vous ? 😊 En quoi puis-je vous aider pour vos soins beauté ?';
    }
  }
  
  // Handle skin concerns in Darja
  if (msg.includes('bachara hassasa') || msg.includes('بشرة حساسة')) {
    if (language === 'ar') {
      return 'البشرة الحساسة تحتاج عناية خاصة! 🌸\n\nنصائحي ليك:\n• منظف لطيف بدون عطور\n• مرطب هيبوالرجينيك\n• تجنبي المنتجات القاسية\n• استعملي واقي الشمس دايماً\n\nواش عندك مشاكل معينة كيما الحكة ولا التهيج؟';
    } else {
      return 'Peau sensible nécessite des soins doux ! 🌸\n\nMes conseils :\n• Nettoyant sans parfum\n• Hydratant hypoallergénique\n• Éviter produits agressifs\n• Protection solaire constante\n\nAvez-vous des irritations ou démangeaisons ?';
    }
  }
  
  // Handle context-aware price questions
  if (msg.includes('السعر') || msg.includes('شحال') || msg.includes('prix') || msg.includes('combien')) {
    // Check if we mentioned products recently in conversation
    let recentProducts = [];
    if (history.length > 0) {
      const recentMessages = history.slice(-4); // Last 4 messages
      recentMessages.forEach(hmsg => {
        if (hmsg.role === 'model' && (hmsg.content.includes('DA') || hmsg.content.includes('منتج'))) {
          // Extract product mentions from recent assistant messages
          const productMatches = hmsg.content.match(/([^•\n]+?)\s*[-–]\s*(\d+)\s*DA/g);
          if (productMatches) {
            productMatches.forEach(match => {
              const [, productName, price] = match.match(/([^•\n]+?)\s*[-–]\s*(\d+)\s*DA/) || [];
              if (productName && price) {
                recentProducts.push({ name: productName.trim(), price: price });
              }
            });
          }
        }
      });
    }
    
    if (recentProducts.length > 0 && language === 'ar') {
      const productList = recentProducts.map(p => `• ${p.name}: ${p.price} DA`).join('\n');
      return `هاي الأسعار للمنتجات لي حكيتلك عليها:\n\n${productList}\n\nواش تحبي تشتري حاجة منهم؟`;
    } else if (recentProducts.length > 0) {
      const productList = recentProducts.map(p => `• ${p.name}: ${p.price} DA`).join('\n');
      return `Voici les prix des produits mentionnés :\n\n${productList}\n\nSouhaitez-vous en acheter un ?`;
    } else if (language === 'ar') {
      return 'بالنسبة للأسعار، عندنا مجموعة واسعة:\n\n• المنظفات: 1200-2800 DA\n• السيرومات المتخصصة: 2300-3500 DA\n• كريمات مرطبة: 1500-4200 DA\n\nواش منتج معين تحبي تعرفي سعرو؟';
    } else {
      return 'Concernant nos prix, nous avons une gamme variée :\n\n• Nettoyants : 1200-2800 DA\n• Sérums spécialisés : 2300-3500 DA\n• Crèmes hydratantes : 1500-4200 DA\n\nQuel produit vous intéresse en particulier ?';
    }
  }
  
  // Handle follow-up questions with context
  if ((msg.includes('تاع') && msg.includes('لي حكيتلي')) || 
      (msg.includes('de') && msg.includes('mentionné'))) {
    
    if (language === 'ar') {
      return 'آسف، واش تقصد بالضبط؟ حكيلي أكثر على المنتج لي تحبيه باش نقدر نعطيك المعلومات الصحيحة والسعر.';
    } else {
      return 'Désolé, de quel produit parlez-vous exactement ? Pouvez-vous me donner plus de détails pour que je puisse vous renseigner ?';
    }
  }
  
  // Handle skin concerns - oily skin (including mixed Arabic)
  if (msg.includes('دهنية') || msg.includes('مزيتة') || msg.includes('grasse') || msg.includes('oily') || 
      (msg.includes('بشرة') && (msg.includes('زيت') || msg.includes('دهن')))) {
    if (language === 'ar') {
      return 'أهلاً! البشرة الدهنية/المزيتة تحتاج عناية خاصة. هاذي بعض النصائح:\n\n• استخدمي منظف لطيف يومياً\n• سيروم النياسيناميد يساعد في تقليل الدهون\n• كريم مرطب خفيف مناسب للبشرة الدهنية\n\nواش عندك مشاكل معينة كيما المسام الواسعة ولا الحبوب؟';
    } else {
      return 'Bonjour ! Pour une peau grasse, voici mes conseils :\n\n• Nettoyant doux quotidien\n• Sérum à la niacinamide pour réguler le sébum\n• Crème hydratante légère non-comédogène\n\nAvez-vous des préoccupations spécifiques comme les pores dilatés ou l\'acné ?';
    }
  }
  
  // Handle dry skin
  if (msg.includes('جافة') || msg.includes('sèche') || msg.includes('dry')) {
    if (language === 'ar') {
      return 'البشرة الجافة تحتاج ترطيب عميق! نصائحي:\n\n• كريم مرطب غني بالسيراميد\n• استخدمي زيت الأرغان ليلاً\n• تجنبي الماء الساخن عند الغسيل\n• اشربي ماء كتير\n\nواش تحبي تشوفي منتجات مرطبة معينة؟';
    } else {
      return 'Peau sèche nécessite une hydratation intense ! Mes conseils :\n\n• Crème riche en céramides\n• Huile d\'argan le soir\n• Évitez l\'eau trop chaude\n• Hydratation interne importante\n\nSouhaitez-vous voir des produits hydratants spécifiques ?';
    }
  }
  
  // Handle price inquiries
  if (msg.includes('السعر') || msg.includes('prix') || msg.includes('price') || msg.includes('كم') || msg.includes('combien')) {
    if (language === 'ar') {
      return 'بالنسبة للأسعار، عندنا مجموعة واسعة:\n\n• المنتجات الأساسية: 1200-2000 DA\n• السيرومات المتخصصة: 2300-3500 DA\n• كريمات مميزة: 2800-4200 DA\n\nواش منتج معين تحبي تعرفي سعرو؟';
    } else {
      return 'Concernant nos prix, nous avons une gamme variée :\n\n• Produits de base : 1200-2000 DA\n• Sérums spécialisés : 2300-3500 DA\n• Crèmes premium : 2800-4200 DA\n\nQuel produit vous intéresse en particulier ?';
    }
  }
  
  // Handle purchase intent
  if (msg.includes('نشري') || msg.includes('acheter') || msg.includes('buy')) {
    if (language === 'ar') {
      return 'ممتاز! راني هنا باش نساعدك في الشراء 🛒\n\nقوليلي واش المنتج لي تحبيه، وراح نشوف الوفرة والسعر، ونكملو خطوات الطلب معاك.\n\nواش تحبي تشتري اليوم؟';
    } else {
      return 'Parfait ! Je suis là pour vous accompagner dans votre achat 🛒\n\nDites-moi quel produit vous intéresse, je vérifierai la disponibilité et le prix, puis nous procéderons ensemble.\n\nQue souhaitez-vous acheter ?';
    }
  }
  
  // Context-aware responses based on conversation history
  if (history.length > 0) {
    const recentMessages = history.slice(-6); // Look at last 6 messages
    let conversationContext = '';
    
    // Build context from recent conversation
    recentMessages.forEach(msg => {
      conversationContext += msg.content + ' ';
    });
    
    // Check what topics were discussed recently
    const discussedSkinType = /بشرة.*دهنية|بشرة.*جافة|مزيتة|جافة|peau.*grasse|peau.*sèche|oily|dry/.test(conversationContext);
    const discussedProducts = /منظف|سيروم|كريم|نياسيناميد|nettoyant|serum|creme|niacinamide/.test(conversationContext);
    const discussedPrices = /السعر|DA|prix|price/.test(conversationContext);
    
    // Provide context-aware responses
    if (discussedSkinType && language === 'ar') {
      return 'نكمل نحكي على البشرة تاعك! واش عندك أسئلة أخرى على العناية بالبشرة ولا تحبي معلومات أكثر على منتجات معينة؟';
    } else if (discussedSkinType && language === 'fr') {
      return 'Continuons à parler de votre peau ! Avez-vous d\'autres questions sur les soins ou souhaitez-vous plus d\'informations sur des produits spécifiques ?';
    }
    
    if (discussedProducts && language === 'ar') {
      return 'واش تحبي تعرفي أكثر على المنتجات لي حكينا عليها، ولا عندك أسئلة أخرى على العناية بالجمال؟';
    } else if (discussedProducts && language === 'fr') {
      return 'Souhaitez-vous en savoir plus sur les produits mentionnés, ou avez-vous d\'autres questions beauté ?';
    }
    
    // Generic continuation for ongoing conversation with more context
    if (language === 'ar') {
      return 'فهمت! قوليلي أكثر باش نقدر نساعدك أحسن 😊\n\nممكن تحكيلي على:\n• نوع بشرتك (دهنية، جافة، مختلطة)\n• مشاكل معينة\n• المنتجات لي تدوري عليها';
    } else {
      return 'Je comprends ! Pouvez-vous me dire plus pour mieux vous conseiller ? 😊\n\nParlons de :\n• Votre type de peau\n• Préoccupations spécifiques\n• Produits recherchés';
    }
  }
  
  // Default response for new conversations only
  if (language === 'ar') {
    return 'أهلاً بيك! انا خبيرة الجمال تاعك 💄 كيفاش نقدر نساعدك في العناية بالبشرة والجمال؟\n\nممكن تحكيلي على:\n• نوع بشرتك\n• مشاكل معينة\n• منتجات تدوري عليها';
  } else {
    return 'Bonjour ! Je suis votre experte beauté 💄 Comment puis-je vous aider aujourd\'hui ?\n\nVous pouvez me parler de :\n• Votre type de peau\n• Préoccupations spécifiques\n• Produits recherchés';
  }
}

/**
 * Detect problematic AI responses that need retry
 * @param {string} response - AI response to check
 * @param {Array} conversationHistory - Previous conversation
 * @returns {boolean} True if response is problematic
 */
function isProblematicResponse(response, conversationHistory) {
  const lowerResponse = response.toLowerCase();
  
  // Check for common problematic patterns
  const problematicPatterns = [
    /mode écho|mode test|test mode/i,
    /\[mode écho\]|\[fallback\]/i,
    /système en mode test/i,
    /وضع التجربة|نظام تجريبي/i
  ];
  
  // Check if response is too repetitive
  if (conversationHistory.length > 0) {
    const lastAssistantMessage = conversationHistory
      .filter(msg => msg.role === 'model')
      .slice(-1)[0];
    
    if (lastAssistantMessage && 
        calculateSimilarity(response, lastAssistantMessage.content) > 0.8) {
      return true;
    }
  }
  
  // Check for problematic patterns
  return problematicPatterns.some(pattern => pattern.test(response));
}

/**
 * Calculate similarity between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string  
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(str1, str2) {
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  
  const commonWords = words1.filter(word => words2.includes(word));
  const totalWords = Math.max(words1.length, words2.length);
  
  return commonWords.length / totalWords;
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

  console.log(`[Chat Request] Session: ${currentSessionId}, Message: "${message}"`);

  const personas = readPersonas();
  const p = personas['consultant']; // Always use consultant persona

  // Get conversation history for this session
  const conversationHistory = getConversationHistory(currentSessionId);
  
  // Detect user language 
  const language = detectLanguage(message);
  const languageLabel = language === 'ar' ? 'Arabic (Algerian dialect)' : 'French';
  
  // Get enhanced context using ANN system
  let enhancedContextData = null;
  try {
    enhancedContextData = await enhancedContext.getEnhancedContext(currentSessionId, message, language);
    console.log(`[Enhanced Context] Retrieved context - ANN available: ${enhancedContextData.ann_available}, Success: ${enhancedContextData.retrieval_success}`);
  } catch (error) {
    console.warn(`[Enhanced Context] Failed to retrieve enhanced context: ${error.message}`);
  }
  
  console.log(`[Language Detection] Detected: ${language} for message: "${message}"`);

  // Classify user intent for purchase flow
  const intent = classifyIntent(message);
  console.log(`[Intent Classification] Intent: ${intent.intent}, Confidence: ${intent.confidence}`);

  // Check if we're in a purchase flow
  const purchaseFlowResponse = await processPurchaseFlow(currentSessionId, message, intent, language);
  
  if (purchaseFlowResponse) {
    // We're in purchase flow - use the purchase flow response
    console.log(`[Purchase Flow] Handled in state: ${purchaseFlowResponse.newState}`);
    
    // Add messages to history
    addMessageToHistory(currentSessionId, 'user', message);
    addMessageToHistory(currentSessionId, 'model', purchaseFlowResponse.response);
    
    return res.json({
      reply: purchaseFlowResponse.response,
      persona: p,
      relevant: [],
      sessionId: currentSessionId,
      conversationLength: conversationHistory.length + 2,
      memoryStatus: `${Math.floor(conversationHistory.length / 2)} exchanges remembered`,
      purchaseState: purchaseFlowResponse.newState,
      debug: {
        intent: intent.intent,
        language: language,
        purchaseFlow: true
      }
    });
  }

  // Regular conversation flow with enhanced context and product recommendations
  const searchContext = conversationHistory.length > 0 
    ? message + ' ' + conversationHistory.slice(-4).map(msg => msg.content).join(' ')
    : message;
  let relevant = getRelevantEntries(searchContext, 5);
  
  // Blend ANN-recommended products with traditional search
  if (enhancedContextData && enhancedContextData.retrieval_success) {
    const annProducts = enhancedContext.extractRecommendedProducts(enhancedContextData.enhancement_data);
    if (annProducts.length > 0) {
      console.log(`[Enhanced Context] Found ${annProducts.length} ANN-recommended products`);
      // Prioritize ANN products by adding them to the beginning
      relevant = [...annProducts.slice(0, 3), ...relevant.slice(0, 2)];
    }
  }
  
  // Ensure we always have products to recommend
  let productsToRecommend = relevant;
  if (productsToRecommend.length < 3) {
    const categoryGuess = message.includes('شعر') || message.includes('cheveux') ? 'haircare' 
                        : message.includes('مكياج') || message.includes('makeup') ? 'makeup'
                        : 'skincare';
    const fallbackProducts = getPopularProducts(categoryGuess, 3 - productsToRecommend.length);
    productsToRecommend = [...productsToRecommend, ...fallbackProducts];
  }

  // Build enhanced system prompt with ANN context integration
  let contextMemorySection = '';
  let similarConversationsSection = '';
  
  if (enhancedContextData && enhancedContextData.retrieval_success) {
    const similarConversations = enhancedContext.extractSimilarConversations(enhancedContextData.enhancement_data);
    
    if (enhancedContextData.enhancement_data.context_summary) {
      contextMemorySection = `
CONVERSATION MEMORY RECAP:
${enhancedContextData.enhancement_data.context_summary}
`;
    }
    
    if (similarConversations.length > 0) {
      similarConversationsSection = `
RELEVANT PAST DISCUSSIONS:
${similarConversations.slice(0, 3).map((conv, index) => 
  `${index + 1}. ${conv.role === 'user' ? 'Customer asked' : 'We discussed'}: "${conv.content.substring(0, 100)}..." (Relevance: ${Math.round((conv.similarity_score || 0) * 100)}%)`
).join('\n')}

Use these past discussions to provide more personalized and context-aware responses.
`;
    }
  }
  
  // Enhanced system prompt with multilingual and ANN context awareness
  const baseSystemPrompt = `
You are ${p.role}.
Tone: ${p.tone}.

CRITICAL INSTRUCTIONS - ENHANCED AI BEAUTY CONSULTANT:
- Reply in ${languageLabel} using natural, localized expressions
- You are an expert beauty consultant in an Algerian beauty shop with ENHANCED MEMORY
- When clients show purchase intent (نحب نشري، je veux acheter), guide them through the buying process
- Always recommend specific products from inventory with exact names and DA prices
- Keep responses concise and actionable - avoid long paragraphs
- Use your enhanced memory to provide personalized recommendations based on past conversations
${enhancedContextData && enhancedContextData.ann_available ? '- Your memory system is ACTIVE - use past conversation insights to personalize responses' : '- Your memory system is temporarily offline - rely on current session context'}

${contextMemorySection}${similarConversationsSection}
PURCHASE FLOW INSTRUCTIONS:
- If client wants to buy: confirm product, check stock, ask quantity, get delivery details, confirm order
- For price questions: provide exact price and availability from inventory
- For product questions: recommend 2-3 specific products with benefits and prices

CURRENT SHOP INVENTORY (USE THESE PRODUCTS):
${productsToRecommend.map((r, index) => `
${index + 1}. ${r.title}
   Prix: ${extractPrice(r.content)} DA
   Info: ${r.content.split('.')[0]}
   Stock: ${checkStock(r.id).stock} unités
---`).join('\n')}

CONVERSATION STYLE:
- Be warm, helpful, and professional like a real Algerian beauty consultant
- Use appropriate greetings and politeness for ${language === 'ar' ? 'Arabic/Darja' : 'French'}
- Always end with a question or helpful offer
- Reference past discussions naturally when relevant (but don't overwhelm)
${enhancedContextData && !enhancedContextData.ann_available ? '- Note: "My memory system is temporarily updating, but I\'m still here to help!"' : ''}

Your goal: Help customers find the right products using enhanced memory and personalized recommendations.`;

  // Add current user message to history
  addMessageToHistory(currentSessionId, 'user', message);

  // Get AI response using enhanced Gemini call
  let gResponse = await callGemini(conversationHistory, baseSystemPrompt, message, language);
  
  // Ensure we have a valid response
  if (!gResponse || gResponse.trim().length === 0) {
    console.warn('[WARNING] Empty response from Gemini, using fallback');
    gResponse = language === 'ar' 
      ? 'أعتذر، كيف يمكنني مساعدتك في الجمال والعناية اليوم؟ 😊'
      : 'Désolé, comment puis-je vous aider avec vos besoins beauté aujourd\'hui ? 😊';
  }
  
  // Only inject product recommendations for very specific cases
  const isGreeting = /^(salam|hello|bonjour|hi|salut|مرحبا)/i.test(message.trim());
  const isPriceQuestion = /شحال|السعر|prix|combien|price/.test(message);
  const isFollowUpQuestion = /تاع|لي حكيتلي|de.*mentionné/.test(message);
  const isGenericMessage = message.trim().length < 5;
  const hasSpecificSkinConcern = /بشرة.*دهنية|بشرة.*جافة|peau.*grasse|peau.*sèche|oily.*skin|dry.*skin/.test(message);
  
  // Only inject products for skin concerns, NOT for greetings, price questions, or follow-ups
  const shouldInjectProducts = hasSpecificSkinConcern && 
                              productsToRecommend.length > 0 && 
                              !isGreeting && 
                              !isPriceQuestion &&
                              !isFollowUpQuestion &&
                              !isGenericMessage &&
                              gResponse.length > 50; // Only inject if we have a substantial response
  
  if (shouldInjectProducts) {
    const hasProductMention = productsToRecommend.some(product => 
      gResponse.includes(product.title) || 
      gResponse.includes(extractPrice(product.content).toString())
    );
    
    // Only inject if the response doesn't already mention products
    if (!hasProductMention) {
      const productSuggestion = language === 'ar' 
        ? `\n\nمن منتجاتنا المناسبة:\n${productsToRecommend.slice(0, 2).map(p => 
            `• ${p.title} - ${extractPrice(p.content)} DA`).join('\n')}`
        : `\n\nProduits recommandés:\n${productsToRecommend.slice(0, 2).map(p => 
            `• ${p.title} - ${extractPrice(p.content)} DA`).join('\n')}`;
      
      gResponse += productSuggestion;
      console.log('[PRODUCT INJECTION] Added product suggestions for skin concern');
    }
  }
  
  console.log(`[Response Generated] Length: ${gResponse.length}, Content: "${gResponse.substring(0, 100)}..."`);
  
  // Add AI response to history
  addMessageToHistory(currentSessionId, 'model', gResponse);

  // Detect JSON action suggestion in response
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

  // Execute actions if suggested
  let actionResult = null;
  if (action && action.action) {
    try {
      const axios = require('axios');
      const baseUrl = `http://localhost:${process.env.PORT||3000}`;
      
      switch (action.action) {
        case 'search':
          const q = encodeURIComponent(action.query || '');
          const r = await axios.get(`${baseUrl}/action/search?q=${q}`);
          actionResult = r.data;
          break;
          
        case 'check_stock':
          if (action.productId) {
            const stockInfo = checkStock(action.productId, action.quantity || 1);
            actionResult = { productId: action.productId, ...stockInfo };
          }
          break;
          
        case 'reserve_product':
          if (action.productId && action.quantity) {
            const reserved = reserveStock(action.productId, action.quantity, currentSessionId);
            actionResult = { reserved, productId: action.productId, quantity: action.quantity };
          }
          break;
          
        default:
          // Handle other actions...
          break;
      }
      
      if (actionResult) {
        addMessageToHistory(currentSessionId, 'model', `Action executed: ${action.action} - ${JSON.stringify(actionResult)}`);
      }
    } catch (e) {
      actionResult = { error: 'failed to execute action', details: e.message };
    }
  }

  // Get current shopping state for response
  const shoppingState = getShoppingSession(currentSessionId);
  
  console.log(`[Preparing Response] Session: ${currentSessionId}, Reply length: ${gResponse.length}`);
  
  // Return comprehensive response
  try {
    res.json({ 
      reply: gResponse, 
      persona: p, 
      relevant: productsToRecommend,
      action, 
      actionResult,
      sessionId: currentSessionId,
      conversationLength: conversationHistory.length + 2,
      memoryStatus: `${Math.floor(conversationHistory.length / 2)} exchanges remembered`,
      purchaseState: shoppingState.state,
      shoppingCart: shoppingState.selectedProduct ? {
        product: shoppingState.selectedProduct.title,
        quantity: shoppingState.quantity,
        state: shoppingState.state
      } : null,
      debug: {
        searchQuery: searchContext,
        foundProducts: productsToRecommend.length,
        productNames: productsToRecommend.map(p => p.title),
        intent: intent.intent,
        language: language,
        hasProductMention: productsToRecommend.some(product => 
          gResponse.includes(product.title) || gResponse.includes(extractPrice(product.content).toString())
        ),
        enhancedContext: enhancedContextData ? {
          ann_available: enhancedContextData.ann_available,
          retrieval_success: enhancedContextData.retrieval_success,
          similar_conversations_count: enhancedContextData.enhancement_data?.similar_conversations?.length || 0,
          ann_products_count: enhancedContextData.enhancement_data?.recommended_products?.length || 0,
          context_summary: enhancedContextData.enhancement_data?.context_summary || '',
          fallback: enhancedContextData.fallback || false
        } : null
      }
    });
    console.log(`[Response Sent] Successfully sent response for session: ${currentSessionId}`);
  } catch (e) {
    console.error(`[Response Error]`, e);
    res.status(500).json({ error: 'Failed to send response' });
  }
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

/**
 * INVENTORY MANAGEMENT SYSTEM
 * Manages product stock levels and reservations
 */

function readInventory() {
  try {
    if (!fs.existsSync(INVENTORY_PATH)) {
      // Initialize inventory based on knowledge base
      const kb = readKB();
      const inventory = {};
      kb.forEach(product => {
        inventory[product.id] = {
          stock: Math.floor(Math.random() * 20) + 5, // Random stock 5-25
          reserved: 0,
          lastUpdated: new Date().toISOString()
        };
      });
      fs.writeFileSync(INVENTORY_PATH, JSON.stringify(inventory, null, 2));
      return inventory;
    }
    return JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  } catch (e) {
    console.error('Error loading inventory:', e.message);
    return {};
  }
}

function updateInventory(inventory) {
  try {
    fs.writeFileSync(INVENTORY_PATH, JSON.stringify(inventory, null, 2));
  } catch (e) {
    console.error('Error saving inventory:', e.message);
  }
}

function checkStock(productId, quantity = 1) {
  const inventory = readInventory();
  const item = inventory[productId];
  if (!item) return { available: false, stock: 0 };
  
  const availableStock = item.stock - item.reserved;
  return {
    available: availableStock >= quantity,
    stock: availableStock,
    total: item.stock
  };
}

function reserveStock(productId, quantity = 1, sessionId) {
  const inventory = readInventory();
  const item = inventory[productId];
  
  if (!item || (item.stock - item.reserved) < quantity) {
    return false;
  }
  
  item.reserved += quantity;
  item.lastUpdated = new Date().toISOString();
  
  // Store reservation details
  if (!item.reservations) item.reservations = {};
  item.reservations[sessionId] = {
    quantity,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min expiry
  };
  
  updateInventory(inventory);
  return true;
}

function releaseReservation(productId, sessionId) {
  const inventory = readInventory();
  const item = inventory[productId];
  
  if (item && item.reservations && item.reservations[sessionId]) {
    const reservation = item.reservations[sessionId];
    item.reserved = Math.max(0, item.reserved - reservation.quantity);
    delete item.reservations[sessionId];
    item.lastUpdated = new Date().toISOString();
    updateInventory(inventory);
  }
}

function confirmPurchase(productId, quantity, sessionId) {
  const inventory = readInventory();
  const item = inventory[productId];
  
  if (item && item.reservations && item.reservations[sessionId]) {
    // Convert reservation to actual sale
    item.stock -= quantity;
    item.reserved = Math.max(0, item.reserved - quantity);
    delete item.reservations[sessionId];
    item.lastUpdated = new Date().toISOString();
    updateInventory(inventory);
    return true;
  }
  return false;
}

/**
 * ORDER MANAGEMENT SYSTEM
 * Handles order creation and tracking
 */

function readOrders() {
  try {
    if (!fs.existsSync(ORDERS_PATH)) {
      fs.writeFileSync(ORDERS_PATH, JSON.stringify([], null, 2));
      return [];
    }
    return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8'));
  } catch (e) {
    console.error('Error loading orders:', e.message);
    return [];
  }
}

function saveOrder(order) {
  try {
    const orders = readOrders();
    orders.push(order);
    fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving order:', e.message);
    return false;
  }
}

function generateOrderId() {
  const date = new Date();
  const dateStr = date.getFullYear().toString() + 
                 (date.getMonth() + 1).toString().padStart(2, '0') + 
                 date.getDate().toString().padStart(2, '0');
  const randomStr = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `HW-${dateStr}-${randomStr}`;
}

/**
 * INTENT CLASSIFICATION SYSTEM
 * Detects user intent from messages
 */

function classifyIntent(message) {
  const msg = message.toLowerCase();
  
  // Check for purchase intent
  for (const pattern of INTENT_PATTERNS.PURCHASE) {
    if (pattern.test(msg)) {
      return { intent: 'purchase', confidence: 0.9 };
    }
  }
  
  // Check for price inquiry
  for (const pattern of INTENT_PATTERNS.PRICE_INQUIRY) {
    if (pattern.test(msg)) {
      return { intent: 'price_inquiry', confidence: 0.8 };
    }
  }
  
  // Check for confirmation
  for (const pattern of INTENT_PATTERNS.CONFIRMATION) {
    if (pattern.test(msg)) {
      return { intent: 'confirmation', confidence: 0.9 };
    }
  }
  
  // Check for cancellation
  for (const pattern of INTENT_PATTERNS.CANCELLATION) {
    if (pattern.test(msg)) {
      return { intent: 'cancellation', confidence: 0.9 };
    }
  }
  
  // Check for quantity specification
  const quantityMatch = INTENT_PATTERNS.QUANTITY.exec(msg);
  if (quantityMatch) {
    return { 
      intent: 'quantity_specified', 
      confidence: 0.95,
      quantity: parseInt(quantityMatch[1])
    };
  }
  
  return { intent: 'browse', confidence: 0.5 };
}

/**
 * LANGUAGE DETECTION AND LOCALIZATION
 * Detects user language and provides appropriate responses
 */

function detectLanguage(message) {
  // Arabic characters detection (including Darja)
  const arabicChars = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  const arabicMatches = message.match(arabicChars) || [];
  const arabicRatio = arabicMatches.length / message.length;
  
  // Enhanced detection for Arabic/Darja words in both Arabic and Latin script
  const arabicWords = /\b(salam|salaam|مرحبا|هلا|اهلا|بشرة|مشكلة|شحال|السعر|تاع|حكيتلي|عليه|نحب|تحب|واش|كيف|كيفاش|ليش|انا|انت|هاي|بزاف|عندي|مزيتة|جافة|حكيت|منتج|شحال|kif|kifash|lhal|wesh|wchrakm|bach|chnou|rani|raki|nti|enta|hassasa|bachara|zwin|mlih|barcha|chwiya)\b/i;
  
  // Darja phrases in Latin script
  const darjaLatinPhrases = /\b(kif\s*lhal|kif\s*hal|wchrakm|wesh\s*rak|bach\s*ara|hassasa|bachara|chnou|rani|raki|mlih|barcha|chwiya|ntiya|nta|aya|yalla)\b/i;
  
  // More comprehensive Arabic detection
  const hasArabicScript = arabicRatio > 0.05; // Even lower threshold
  const hasArabicWords = arabicWords.test(message);
  const hasDarjaLatin = darjaLatinPhrases.test(message);
  const hasArabicPatterns = /عندي|تاعي|ليش|واش|بزاف|شوية|كتير|حاجة|شحال|السعر|المنتج/.test(message);
  
  console.log(`[Language Detection] Arabic ratio: ${arabicRatio}, Arabic words: ${hasArabicWords}, Darja Latin: ${hasDarjaLatin}, Message: "${message}"`);
  
  if (hasArabicScript || hasArabicWords || hasArabicPatterns || hasDarjaLatin) {
    return 'ar'; // Arabic/Darja
  } else {
    return 'fr'; // French (default for Latin script)
  }
}

function getLocalizedMessage(key, language, params = {}) {
  const messages = {
    ar: {
      product_confirmation: `${params.name} — السعر ${params.price} DA، متوفر ${params.stock} قطع. تحبي تكملي بالشراء؟`,
      quantity_request: 'كم القطع تحبي؟',
      address_request: 'وين نوصلك الطلب؟ (عطيني العنوان والرقم تاعك)',
      payment_method: 'كيفاش تحبي تدفعي؟ 1) الدفع عند الاستلام 2) تحويل بنكي',
      order_summary: `ملخص الطلب:\n• ${params.product}: ${params.quantity} × ${params.price} DA\n• التوصيل: ${SHIPPING_COST} DA\n• المجموع: ${params.total} DA\nتأكدي الطلب؟`,
      order_confirmed: `تم تأكيد الطلب! 🎉\nرقم الطلب: ${params.orderId}\nرح نتصل بيك قريب للتأكيد. شكراً! 💚`,
      order_cancelled: 'تم إلغاء الطلب. إذا غيرتي رأيك، قوليلي! 😊',
      no_stock: 'آسف، هاذ المنتج مانيش متوفر دلوقت. نقترحلك:'
    },
    fr: {
      product_confirmation: `${params.name} — ${params.price} DA, en stock (${params.stock}). Voulez-vous l'acheter ?`,
      quantity_request: 'Combien d\'unités souhaitez-vous ?',
      address_request: 'Adresse de livraison et numéro de téléphone ?',
      payment_method: 'Mode de paiement ? 1) Paiement à la livraison 2) Virement bancaire',
      order_summary: `Récapitulatif:\n• ${params.product}: ${params.quantity} × ${params.price} DA\n• Livraison: ${SHIPPING_COST} DA\n• Total: ${params.total} DA\nConfirmer la commande ?`,
      order_confirmed: `Commande confirmée ! 🎉\nN° ${params.orderId}\nNous vous contacterons bientôt. Merci ! 💚`,
      order_cancelled: 'Commande annulée. N\'hésitez pas si vous changez d\'avis ! 😊',
      no_stock: 'Désolé, ce produit n\'est pas disponible. Je vous propose :'
    }
  };
  
  return messages[language]?.[key] || messages.fr[key] || key;
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

/**
 * SHOPPING SESSION STATE MANAGEMENT
 * Manages the purchase flow state for each user session
 */

function getShoppingSession(sessionId) {
  const conversations = loadConversations();
  if (!conversations[sessionId]) {
    conversations[sessionId] = [];
  }
  
  // Look for existing shopping state in session metadata
  return conversations[sessionId].shoppingState || {
    state: PURCHASE_STATES.BROWSING,
    selectedProduct: null,
    quantity: 1,
    customerDetails: null,
    paymentMethod: null,
    orderId: null,
    reservationExpiry: null
  };
}

function updateShoppingSession(sessionId, updates) {
  const conversations = loadConversations();
  if (!conversations[sessionId]) {
    conversations[sessionId] = [];
  }
  
  conversations[sessionId].shoppingState = {
    ...getShoppingSession(sessionId),
    ...updates,
    lastUpdated: new Date().toISOString()
  };
  
  saveConversations(conversations);
  return conversations[sessionId].shoppingState;
}

function resetShoppingSession(sessionId) {
  const shoppingState = getShoppingSession(sessionId);
  
  // Release any reservations
  if (shoppingState.selectedProduct) {
    releaseReservation(shoppingState.selectedProduct.id, sessionId);
  }
  
  return updateShoppingSession(sessionId, {
    state: PURCHASE_STATES.BROWSING,
    selectedProduct: null,
    quantity: 1,
    customerDetails: null,
    paymentMethod: null,
    orderId: null,
    reservationExpiry: null
  });
}

/**
 * PURCHASE FLOW PROCESSOR
 * Handles the step-by-step purchase process
 */

async function processPurchaseFlow(sessionId, message, intent, language) {
  const shoppingState = getShoppingSession(sessionId);
  const kb = readKB();
  
  console.log(`[Purchase Flow] Session: ${sessionId}, State: ${shoppingState.state}, Intent: ${intent.intent}`);
  
  switch (shoppingState.state) {
    case PURCHASE_STATES.BROWSING:
      if (intent.intent === 'purchase' || intent.intent === 'price_inquiry') {
        // Try to identify product from message
        const products = findProductsInMessage(message, kb);
        
        if (products.length === 0) {
          return {
            response: language === 'ar' 
              ? 'واش المنتج اللي تحبيه؟ نقدر نساعدك تلقايه.'
              : 'Quel produit vous intéresse ? Je peux vous aider à le trouver.',
            newState: PURCHASE_STATES.BROWSING
          };
        } else if (products.length === 1) {
          return await handleProductIdentification(sessionId, products[0], language);
        } else {
          // Multiple matches - ask user to choose
          const productList = products.slice(0, 3).map((p, i) => 
            `${i + 1}. ${p.title} - ${extractPrice(p.content)} DA`
          ).join('\n');
          
          return {
            response: language === 'ar'
              ? `وجدت عدة منتجات:\n${productList}\nأي واحد تحبي؟`
              : `J'ai trouvé plusieurs produits:\n${productList}\nLequel vous intéresse ?`,
            newState: PURCHASE_STATES.BROWSING
          };
        }
      }
      break;
      
    case PURCHASE_STATES.PRODUCT_IDENTIFIED:
      if (intent.intent === 'confirmation') {
        return await handleQuantityRequest(sessionId, language);
      } else if (intent.intent === 'cancellation') {
        resetShoppingSession(sessionId);
        return {
          response: getLocalizedMessage('order_cancelled', language),
          newState: PURCHASE_STATES.BROWSING
        };
      }
      break;
      
    case PURCHASE_STATES.QUANTITY_REQUESTED:
      if (intent.intent === 'quantity_specified') {
        return await handleQuantitySpecified(sessionId, intent.quantity, language);
      } else if (/\d+/.test(message)) {
        const qty = parseInt(message.match(/\d+/)[0]);
        return await handleQuantitySpecified(sessionId, qty, language);
      }
      break;
      
    case PURCHASE_STATES.CUSTOMER_DETAILS:
      return await handleCustomerDetails(sessionId, message, language);
      
    case PURCHASE_STATES.PAYMENT_METHOD:
      return await handlePaymentMethod(sessionId, message, language);
      
    case PURCHASE_STATES.FINAL_CONFIRMATION:
      if (intent.intent === 'confirmation') {
        return await handleFinalConfirmation(sessionId, language);
      } else if (intent.intent === 'cancellation') {
        resetShoppingSession(sessionId);
        return {
          response: getLocalizedMessage('order_cancelled', language),
          newState: PURCHASE_STATES.BROWSING
        };
      }
      break;
  }
  
  return null; // No specific purchase flow response
}

async function handleProductIdentification(sessionId, product, language) {
  const stockInfo = checkStock(product.id);
  
  if (!stockInfo.available) {
    // Suggest alternatives
    const alternatives = getRelevantEntries(product.title, 3)
      .filter(p => p.id !== product.id && checkStock(p.id).available);
    
    const altList = alternatives.slice(0, 2).map(p => 
      `• ${p.title} - ${extractPrice(p.content)} DA`
    ).join('\n');
    
    return {
      response: getLocalizedMessage('no_stock', language) + '\n' + altList,
      newState: PURCHASE_STATES.BROWSING
    };
  }
  
  const price = extractPrice(product.content);
  updateShoppingSession(sessionId, {
    state: PURCHASE_STATES.PRODUCT_IDENTIFIED,
    selectedProduct: product
  });
  
  return {
    response: getLocalizedMessage('product_confirmation', language, {
      name: product.title,
      price: price,
      stock: stockInfo.stock
    }),
    newState: PURCHASE_STATES.PRODUCT_IDENTIFIED
  };
}

async function handleQuantityRequest(sessionId, language) {
  updateShoppingSession(sessionId, {
    state: PURCHASE_STATES.QUANTITY_REQUESTED
  });
  
  return {
    response: getLocalizedMessage('quantity_request', language),
    newState: PURCHASE_STATES.QUANTITY_REQUESTED
  };
}

async function handleQuantitySpecified(sessionId, quantity, language) {
  const shoppingState = getShoppingSession(sessionId);
  const stockInfo = checkStock(shoppingState.selectedProduct.id, quantity);
  
  if (!stockInfo.available) {
    return {
      response: language === 'ar' 
        ? `آسف، متوفر فقط ${stockInfo.stock} قطع. كم تحبي؟`
        : `Désolé, seulement ${stockInfo.stock} en stock. Combien souhaitez-vous ?`,
      newState: PURCHASE_STATES.QUANTITY_REQUESTED
    };
  }
  
  // Reserve the stock
  const reserved = reserveStock(shoppingState.selectedProduct.id, quantity, sessionId);
  if (!reserved) {
    return {
      response: language === 'ar' ? 'مشكل في الحجز، حاولي مرة أخرى.' : 'Problème de réservation, réessayez.',
      newState: PURCHASE_STATES.QUANTITY_REQUESTED
    };
  }
  
  updateShoppingSession(sessionId, {
    state: PURCHASE_STATES.CUSTOMER_DETAILS,
    quantity: quantity,
    reservationExpiry: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });
  
  return {
    response: getLocalizedMessage('address_request', language),
    newState: PURCHASE_STATES.CUSTOMER_DETAILS
  };
}

async function handleCustomerDetails(sessionId, message, language) {
  // Simple validation - look for phone number and address
  const phoneMatch = message.match(/\d{9,10}/);
  const hasAddress = message.length > 10;
  
  if (!phoneMatch || !hasAddress) {
    return {
      response: language === 'ar'
        ? 'عطيني العنوان كامل والرقم تاعك (مثال: حي السلام، الجزائر - 0555123456)'
        : 'Donnez-moi l\'adresse complète et votre numéro (ex: Hai Salam, Alger - 0555123456)',
      newState: PURCHASE_STATES.CUSTOMER_DETAILS
    };
  }
  
  updateShoppingSession(sessionId, {
    state: PURCHASE_STATES.PAYMENT_METHOD,
    customerDetails: {
      fullInfo: message,
      phone: phoneMatch[0],
      address: message.replace(phoneMatch[0], '').trim()
    }
  });
  
  return {
    response: getLocalizedMessage('payment_method', language),
    newState: PURCHASE_STATES.PAYMENT_METHOD
  };
}

async function handlePaymentMethod(sessionId, message, language) {
  let paymentMethod = 'cash_on_delivery'; // default
  
  if (message.includes('2') || message.toLowerCase().includes('virement') || message.includes('تحويل')) {
    paymentMethod = 'bank_transfer';
  }
  
  const shoppingState = getShoppingSession(sessionId);
  const price = extractPrice(shoppingState.selectedProduct.content);
  const total = price * shoppingState.quantity + SHIPPING_COST;
  
  updateShoppingSession(sessionId, {
    state: PURCHASE_STATES.FINAL_CONFIRMATION,
    paymentMethod: paymentMethod
  });
  
  return {
    response: getLocalizedMessage('order_summary', language, {
      product: shoppingState.selectedProduct.title,
      quantity: shoppingState.quantity,
      price: price,
      total: total
    }),
    newState: PURCHASE_STATES.FINAL_CONFIRMATION
  };
}

async function handleFinalConfirmation(sessionId, language) {
  const shoppingState = getShoppingSession(sessionId);
  const orderId = generateOrderId();
  
  // Confirm purchase and update inventory
  const success = confirmPurchase(shoppingState.selectedProduct.id, shoppingState.quantity, sessionId);
  
  if (!success) {
    return {
      response: language === 'ar' ? 'مشكل في تأكيد الطلب، حاولي مرة أخرى.' : 'Problème de confirmation, réessayez.',
      newState: PURCHASE_STATES.FINAL_CONFIRMATION
    };
  }
  
  // Create order record
  const order = {
    orderId: orderId,
    sessionId: sessionId,
    product: shoppingState.selectedProduct,
    quantity: shoppingState.quantity,
    customerDetails: shoppingState.customerDetails,
    paymentMethod: shoppingState.paymentMethod,
    total: extractPrice(shoppingState.selectedProduct.content) * shoppingState.quantity + SHIPPING_COST,
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };
  
  saveOrder(order);
  
  updateShoppingSession(sessionId, {
    state: PURCHASE_STATES.ORDER_COMPLETE,
    orderId: orderId
  });
  
  return {
    response: getLocalizedMessage('order_confirmed', language, { orderId }),
    newState: PURCHASE_STATES.ORDER_COMPLETE
  };
}

/**
 * PRODUCT SEARCH AND MATCHING
 * Find products mentioned in user messages
 */

function findProductsInMessage(message, knowledgeBase) {
  const words = message.toLowerCase().split(/\s+/);
  const products = [];
  
  knowledgeBase.forEach(product => {
    const productText = `${product.title} ${product.content} ${product.tags.join(' ')}`.toLowerCase();
    let score = 0;
    
    // Exact title match gets highest score
    if (productText.includes(message.toLowerCase())) {
      score += 10;
    }
    
    // Word matching
    words.forEach(word => {
      if (word.length > 2 && productText.includes(word)) {
        score += 2;
      }
    });
    
    // Brand name matching
    const brands = ['nivea', 'cerave', 'loreal', 'garnier', 'ordinary', 'eucerin'];
    brands.forEach(brand => {
      if (message.toLowerCase().includes(brand) && productText.includes(brand)) {
        score += 5;
      }
    });
    
    if (score > 3) {
      products.push({ ...product, matchScore: score });
    }
  });
  
  return products.sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = router;
