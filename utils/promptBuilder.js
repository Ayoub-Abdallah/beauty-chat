/**
 * Prompt Builder Module
 * Builds context-rich prompts for Gemini AI
 */

/**
 * Build system prompt with persona, context, and products
 * @param {Object} persona - Persona configuration
 * @param {string} language - User language
 * @param {Object} summary - Conversation summary
 * @param {Array} products - Recommended products
 * @param {string} intent - User intent
 * @returns {string} - Complete system prompt
 */
function buildSystemPrompt(persona, language, summary = {}, products = [], intent = 'chat') {
  const languageName = language === 'ar' ? 'Arabic (Algerian Darja)' : 'French';
  
  let prompt = `You are ${persona.role}.

TONE & STYLE: ${persona.tone}

LANGUAGE: Respond in ${languageName}. Match the user's language naturally.

CORE SKILLS:
${persona.skills.map(skill => `- ${skill}`).join('\n')}

BEHAVIORS:
- Greeting: ${persona.behaviors.greeting}
- Needs Analysis: ${persona.behaviors.needs_analysis}
- Explanation: ${persona.behaviors.explanation}
- Recommendation: ${persona.behaviors.recommendation}
- Upselling: ${persona.behaviors.upselling}
- Closing: ${persona.behaviors.closing}

CURRENCY: All prices MUST be in Algerian Dinar (DA).

`;

  // Add intent-specific instructions
  if (intent === 'recommendation' || intent === 'implicit_recommendation') {
    prompt += `
=== CONSULTATION SUMMARY ===
${JSON.stringify(summary, null, 2)}

=== RECOMMENDED PRODUCTS ===
${products.length > 0 ? formatProducts(products) : 'No products available from API'}

YOUR TASK:
1. Analyze the client's needs from the summary
2. Present 2-3 BEST matching products from the list above
3. Explain WHY each product is perfect for them
4. Mention the price in DA for each product
5. Give usage instructions (when, how often, how to apply)
6. If any safety warnings exist, mention them clearly
7. If stock is low, mention it politely
8. Ask if they want to purchase or need more information
9. Be warm, professional, and persuasive (like a beauty consultant in Algeria)

IMPORTANT:
- Only recommend products from the list above
- Maximum 3 products
- Explain benefits in simple terms
- Always include prices in DA
- Encourage purchase naturally without pressure
`;
  } else if (intent === 'product_information') {
    prompt += `
=== PRODUCT INFORMATION ===
${products.length > 0 ? formatProducts(products) : 'Product not found in our database'}

YOUR TASK:
1. Explain the product details clearly
2. Mention composition and benefits
3. Explain how to use it
4. State the price in DA
5. Mention any safety warnings
6. Check if it matches their needs
7. Suggest complementary products if helpful
8. Ask if they want to purchase

Be informative, helpful, and professional.
`;
  } else if (intent === 'stock_check') {
    prompt += `
=== STOCK INFORMATION ===
${products.length > 0 ? formatProducts(products, true) : 'Product not found'}

YOUR TASK:
1. Inform about stock availability
2. If in stock: encourage purchase
3. If low stock: create urgency ("Stock limité, profitez maintenant!")
4. If out of stock: suggest alternatives
5. Mention price in DA
`;
  } else if (intent === 'safety_check') {
    prompt += `
=== SAFETY CONSULTATION ===
Medical Conditions: ${summary.medical_conditions?.join(', ') || 'None specified'}
Skin Conditions: ${summary.skin_conditions?.join(', ') || 'None specified'}
Ingredients to Avoid: ${summary.avoid?.join(', ') || 'None specified'}

${products.length > 0 ? '=== SAFE PRODUCTS ===\n' + formatProducts(products) : ''}

YOUR TASK:
1. Address safety concerns professionally
2. Recommend only SAFE products for their condition
3. Clearly state why each product is safe
4. Warn against specific ingredients to avoid
5. If pregnant/diabetic: be extra cautious
6. Suggest consulting a doctor if needed
7. Be reassuring and helpful

CRITICAL: Never recommend products with contraindications!
`;
  } else if (intent === 'purchase_intent') {
    prompt += `
=== PURCHASE PROCESS ===
Selected Products: ${summary.selected_products?.join(', ') || 'Products from conversation'}

YOUR TASK:
1. Confirm which products they want
2. Ask for their FULL NAME
3. Then ask for their PHONE NUMBER
4. Confirm "Payment on Delivery" (الدفع عند الإستلام)
5. Thank them warmly
6. Reassure them about quality and delivery

When you have both name and phone:
- Confirm the order
- State total amount if possible
- Give estimated delivery time
- Thank them professionally

Be warm, efficient, and reassuring throughout the process.
`;
  }
  
  prompt += `

REMEMBER:
- Be natural, warm, and culturally appropriate for Algeria
- Use simple language, not medical jargon
- Build trust and confidence
- Help the client make the best decision
- Always mention prices in DA
- Encourage purchase naturally
- Be a professional beauty consultant AND a skilled salesperson
`;

  return prompt;
}

/**
 * Format products for prompt
 */
function formatProducts(products, includeStock = false) {
  if (!products || products.length === 0) {
    return 'No products available';
  }
  
  return products.map((product, index) => {
    let formatted = `${index + 1}. **${product.name || product.title}**\n`;
    formatted += `   Price: ${product.price || 'Price not available'} DA\n`;
    
    if (product.category) {
      formatted += `   Category: ${product.category}\n`;
    }
    
    if (product.description || product.content) {
      formatted += `   Description: ${product.description || product.content}\n`;
    }
    
    if (product.benefits) {
      formatted += `   Benefits: ${Array.isArray(product.benefits) ? product.benefits.join(', ') : product.benefits}\n`;
    }
    
    if (product.ingredients) {
      formatted += `   Key Ingredients: ${product.ingredients}\n`;
    }
    
    if (product.usage) {
      formatted += `   Usage: ${product.usage}\n`;
    }
    
    if (product.warnings) {
      formatted += `   ⚠️ Warnings: ${product.warnings}\n`;
    }
    
    if (includeStock) {
      if (product.stock !== undefined) {
        if (product.stock === 0) {
          formatted += `   🔴 OUT OF STOCK\n`;
        } else if (product.stock < 5) {
          formatted += `   ⚠️ Low Stock (${product.stock} left)\n`;
        } else {
          formatted += `   ✅ In Stock (${product.stock} available)\n`;
        }
      }
    }
    
    formatted += '   ---\n';
    return formatted;
  }).join('\n');
}

/**
 * Build conversation context with history
 */
function buildConversationContext(history, systemPrompt) {
  let context = systemPrompt;
  
  if (history && history.length > 0) {
    context += '\n\n=== CONVERSATION HISTORY ===\n';
    context += 'Remember and reference this conversation naturally:\n\n';
    
    // Include last 10 messages for context
    const recentHistory = history.slice(-10);
    recentHistory.forEach(msg => {
      const role = msg.role === 'user' ? 'Client' : 'Consultant';
      context += `${role}: ${msg.content}\n`;
    });
    
    context += '\n=== END OF HISTORY ===\n\n';
    context += 'Continue the conversation naturally, building on what was discussed.\n';
  }
  
  return context;
}

module.exports = {
  buildSystemPrompt,
  buildConversationContext,
  formatProducts
};
