/**
 * Conversation Summarizer Module
 * Generates structured summaries for the recommendation API
 */

const { detectLanguage } = require('./languageDetection');

/**
 * Summarize conversation for recommendation API
 * @param {Array} conversationHistory - Previous messages
 * @param {string} currentMessage - Current user message
 * @param {string} intent - Detected intent
 * @param {Function} callGemini - Gemini API function
 * @returns {Promise<Object>} - Structured summary JSON
 */
async function summarizeForRecommendation(conversationHistory, currentMessage, intent, callGemini) {
  const language = detectLanguage(currentMessage);
  
  // Build conversation context
  const recentHistory = conversationHistory.slice(-6); // Last 6 messages
  let conversationContext = '';
  
  if (recentHistory.length > 0) {
    conversationContext = '\nRecent conversation:\n';
    recentHistory.forEach(msg => {
      const role = msg.role === 'user' ? 'Client' : 'Consultant';
      conversationContext += `${role}: ${msg.content}\n`;
    });
  }
  
  conversationContext += `Client: ${currentMessage}\n`;
  
  // Different summarization based on intent
  let summarizationPrompt = '';
  
  switch (intent) {
    case 'product_information':
      summarizationPrompt = `
Analyze this product inquiry and extract the product name/query.

${conversationContext}

Return ONLY a JSON object:
{
  "query": "exact product name or search term",
  "intent": "product_information"
}

Example: If user asks "Garnier Pure Active واش ملاح؟", return:
{
  "query": "Garnier Pure Active",
  "intent": "product_information"
}
`;
      break;
      
    case 'stock_check':
      summarizationPrompt = `
Extract the product name the user wants to check stock for.

${conversationContext}

Return ONLY a JSON object:
{
  "query": "product name",
  "check_stock": true,
  "intent": "stock_check"
}
`;
      break;
      
    case 'safety_check':
      summarizationPrompt = `
Extract medical conditions, allergies, and contraindications from the conversation.

${conversationContext}

Return ONLY a JSON object:
{
  "medical_conditions": ["diabetes", "pregnancy", etc.],
  "skin_conditions": ["eczema", "sensitive skin", etc.],
  "avoid": ["perfume", "alcohol", "specific ingredients"],
  "query": "user's main question",
  "intent": "safety_check"
}
`;
      break;
      
    case 'purchase_intent':
      summarizationPrompt = `
Extract products the user wants to purchase from the conversation.

${conversationContext}

Return ONLY a JSON object:
{
  "intent": "purchase",
  "selected_products": ["product 1", "product 2"],
  "language": "${language}"
}
`;
      break;
      
    case 'recommendation':
    case 'implicit_recommendation':
      summarizationPrompt = `
Analyze this beauty/health consultation and create a structured summary for product recommendation.

${conversationContext}

Extract information and return ONLY a JSON object with this structure:
{
  "category": "beauty_skincare|beauty_haircare|beauty_bodycare|health_vitamins|health_supplements|health_weightloss|general",
  "problem": "main issue (e.g., oily_skin_acne, dry_hair, fatigue, weight_gain)",
  "skin_type": "oily|dry|combination|normal|sensitive|unknown",
  "hair_type": "oily|dry|normal|curly|straight|unknown",
  "skin_conditions": ["acne", "dark_spots", "wrinkles", etc.],
  "medical_conditions": ["diabetes", "pregnancy", "anemia", etc.],
  "avoid": ["alcohol", "perfume", "parabens", etc.],
  "needs": ["hydration", "anti-aging", "oil control", "volume", "energy"],
  "preferences": ["natural", "vegan", "fragrance-free", etc.],
  "budget": "low|medium|high|unknown",
  "age": "estimated age or age range",
  "language": "${language}",
  "query": "${currentMessage}"
}

Guidelines:
- Be specific with the problem field
- Include all mentioned conditions
- Extract budget if mentioned (رخيص=low, غالي=high, متوسط=medium)
- Estimate age from context if possible
- List all needs/goals mentioned
`;
      break;
      
    default:
      // For general chat, return minimal summary
      return {
        intent: 'chat',
        query: currentMessage,
        language: language
      };
  }
  
  try {
    // Call Gemini to generate the summary
    const summaryResponse = await callGemini(summarizationPrompt, '', 0);
    
    // Extract JSON from response
    const jsonMatch = summaryResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const summary = JSON.parse(jsonMatch[0]);
      return summary;
    }
    
    // Fallback if JSON extraction fails
    console.warn('Failed to extract JSON from summary, using fallback');
    return createFallbackSummary(currentMessage, intent, language);
    
  } catch (error) {
    console.error('Error generating summary:', error);
    return createFallbackSummary(currentMessage, intent, language);
  }
}

/**
 * Create a basic fallback summary if Gemini fails
 */
function createFallbackSummary(message, intent, language) {
  return {
    intent: intent,
    query: message,
    language: language,
    category: 'general',
    needs: [],
    budget: 'medium'
  };
}

module.exports = { 
  summarizeForRecommendation,
  createFallbackSummary
};
