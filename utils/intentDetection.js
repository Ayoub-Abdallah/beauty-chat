/**
 * Intent Detection Module
 * Detects user intentions from messages for intelligent routing
 */

/**
 * Detect user intent from message content
 * @param {string} message - User message
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {string} - Detected intent
 */
function detectIntent(message, conversationHistory = []) {
  const lowerMessage = message.toLowerCase();
  
  // Purchase Intent - Highest priority
  const purchaseKeywords = [
    // Arabic
    'نحب نشري', 'نبغي نشري', 'نشري', 'أشري', 'بغيت نشريه', 'نبيع', 
    'كيفاه نشريه', 'كيفاش نطلبه', 'نديرو كوماند', 'نحوس نشري',
    'خذيته', 'نخذيه', 'أبغيه', 'نبغيه',
    // French
    "j'achète", 'je veux acheter', 'je prends', 'je le veux', 
    'comment acheter', 'commander', 'passer commande', 'je commande',
    'je le prends', 'ok je prends',
    // English
    'i want to buy', 'i buy', 'i want this', 'how to buy', 'i\'ll take it',
    'give me', 'i need this', 'ok i want', 'purchase'
  ];
  
  for (const keyword of purchaseKeywords) {
    if (lowerMessage.includes(keyword)) {
      return 'purchase_intent';
    }
  }
  
  // Stock Check Intent
  const stockKeywords = [
    // Arabic
    'كاين', 'موجود', 'في الستوك', 'عندكم', 'راه كاين',
    'stock', 'disponible', 'متوفر', 'باقي',
    // French
    'disponible', 'en stock', 'reste', 'vous avez',
    // English
    'available', 'in stock', 'do you have'
  ];
  
  for (const keyword of stockKeywords) {
    if (lowerMessage.includes(keyword)) {
      return 'stock_check';
    }
  }
  
  // Safety/Medical Check Intent
  const safetyKeywords = [
    // Medical conditions
    'pregnant', 'enceinte', 'حامل', 'diabetes', 'diabète', 'السكري',
    'anemia', 'anémie', 'فقر الدم', 'eczema', 'إكزيما',
    'allergy', 'allergie', 'حساسية', 'allergique',
    // Safety concerns
    'safe', 'danger', 'خطير', 'آمن', 'خطر',
    'side effect', 'effet secondaire', 'أعراض جانبية',
    'can i use', 'نقدر نستعمل', 'puis-je utiliser'
  ];
  
  for (const keyword of safetyKeywords) {
    if (lowerMessage.includes(keyword)) {
      return 'safety_check';
    }
  }
  
  // Product Information Intent - User asks about specific product
  const productInfoKeywords = [
    // Arabic
    'واش ملاح', 'كيفاش', 'شنو فوائد', 'علاش', 'وين نلقاه',
    'تاع شنو', 'كيفاه نستعملو', 'شنو فيه',
    // French
    'c\'est quoi', 'comment utiliser', 'à quoi ça sert', 'composition',
    'ingrédients', 'est-ce que', 'comment ça marche',
    // English  
    'what is', 'how to use', 'what does', 'ingredients', 'does it work'
  ];
  
  // Check if message mentions a specific product name or brand
  const mentionsProduct = /\b(cream|crème|كريم|serum|سيروم|shampoo|شامبو|mask|ماسك|oil|زيت)\b/i.test(message) ||
                         /\b(garnier|nivea|vichy|l'oreal|ordinary|cerave|neutrogena)\b/i.test(message);
  
  if (mentionsProduct) {
    for (const keyword of productInfoKeywords) {
      if (lowerMessage.includes(keyword)) {
        return 'product_information';
      }
    }
  }
  
  // Product Search Intent - User looking for products  
  const productSearchKeywords = [
    // Arabic - need/want
    'نحتاج', 'نبغي', 'بغيت', 'عندكم', 'تعطيني', 'واش عندك',
    'عندك', 'عندكم شي',
    // French  
    'je cherche', 'j\'ai besoin', 'vous avez', 'donnez-moi', 
    'il me faut', 'je veux',
    // English
    'i need', 'looking for', 'want', 'looking for', 'give me'
  ];
  
  // Product type keywords
  const productTypes = [
    // Arabic
    'كريم', 'سيروم', 'شامبو', 'ماسك', 'زيت', 'صابون', 'لوسيون',
    'منتج', 'منتجات', 'حاجة', 'شي حاجة',
    // French  
    'crème', 'sérum', 'shampooing', 'shampoing', 'masque', 'huile', 'savon', 'lotion',
    'produit', 'produits', 'quelque chose',
    // English
    'cream', 'serum', 'product', 'something', 'shampoo', 'mask', 'oil'
  ];
  
  // Check if message contains both need/want AND product type
  const hasNeedWord = productSearchKeywords.some(keyword => lowerMessage.includes(keyword));
  const hasProductType = productTypes.some(keyword => lowerMessage.includes(keyword));
  
  if (hasNeedWord && hasProductType) {
    return 'recommendation';
  }
  
  // Also check standalone product type mentions (implicit search)
  if (hasProductType) {
    return 'implicit_recommendation';
  }
  
  // Explicit Recommendation Intent
  const recommendKeywords = [
    // Arabic
    'نصحني', 'تنصحني', 'واش تنصح', 'شنو خير', 'شنو أحسن', 'أحسن',
    'وشنو أحسن', 'إيش أحسن', 'شو أحسن', 'وين نلقى',
    'بش نصلح', 'علاجي', 'routine', 'روتين',
    'عندي مشكل', 'عندي مشكلة', 'ساعدني',
    // French
    'conseille', 'recommande', 'suggère', 'aide-moi', 'meilleur', 'le meilleur',
    'c\'est quoi le meilleur', 'quel est le meilleur',
    'j\'ai un problème', 'routine', 'solution', 'que faire',
    // English
    'recommend', 'suggest', 'advise', 'help me', 'what should', 'best', 'what\'s the best',
    'i need help', 'problem', 'issue'
  ];
  
  for (const keyword of recommendKeywords) {
    if (lowerMessage.includes(keyword)) {
      return 'recommendation';
    }
  }
  
  // Implicit Recommendation Intent - User describes problems/needs
  const implicitKeywords = [
    // Skin issues (Arabic)
    'بشرة جافة', 'جافة', 'بشرة دهنية', 'دهنية', 'حبوب', 'بثور',
    'بقع', 'تجاعيد', 'هالات', 'سوداء', 'شعر خشن', 'تساقط',
    'قشرة', 'عيان', 'تعبان', 'ضعيف', 'حساسة', 'حساسية',
    'للبشرة', 'للشعر', 'للوجه', 'للجسم',
    // Skin issues (French)
    'peau sèche', 'sèche', 'peau grasse', 'grasse', 'acné', 'boutons',
    'taches', 'rides', 'cernes', 'cheveux secs', 'chute de cheveux',
    'pellicules', 'fatigué', 'fatigue', 'sensible', 'sensitive',
    'pour la peau', 'pour les cheveux', 'pour le visage',
    // Skin issues (English)
    'dry skin', 'oily skin', 'acne', 'pimples', 'dark spots', 'wrinkles',
    'dark circles', 'hair fall', 'dandruff', 'tired', 'sensitive',
    'for skin', 'for hair', 'for face',
    // Goals/desires
    'تبييض', 'تفتيح', 'ترطيب', 'نعومة', 'لمعان', 'صحة',
    'blanchir', 'hydrater', 'éclaircir', 'brillance', 'santé',
    'whitening', 'hydration', 'glow', 'health', 'shine'
  ];
  
  for (const keyword of implicitKeywords) {
    if (lowerMessage.includes(keyword)) {
      return 'implicit_recommendation';
    }
  }
  
  // Check conversation context - if user was recently discussing products
  if (conversationHistory.length > 0) {
    const recentMessages = conversationHistory.slice(-3).map(msg => msg.content.toLowerCase()).join(' ');
    
    // If recent conversation mentions products and user is comparing/asking
    if (/\b(كريم|serum|cream|product|منتج)\b/i.test(recentMessages)) {
      const comparisonWords = ['أحسن', 'meilleur', 'better', 'فرق', 'différence', 'ou'];
      if (comparisonWords.some(word => lowerMessage.includes(word))) {
        return 'implicit_recommendation';
      }
    }
  }
  
  // Default to chat
  return 'chat';
}

module.exports = { detectIntent };
