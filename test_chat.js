const express = require('express');
console.log('1. Express loaded');

const router = express.Router();
console.log('2. Router created:', typeof router);

const { detectIntent } = require('./utils/intentDetection');
console.log('3. detectIntent loaded');

const { detectLanguage, getLanguageName } = require('./utils/languageDetection');
console.log('4. languageDetection loaded');

const { summarizeForRecommendation } = require('./utils/conversationSummarizer');
console.log('5. conversationSummarizer loaded');

const { buildSystemPrompt, buildConversationContext: buildPromptContext } = require('./utils/promptBuilder');
console.log('6. promptBuilder loaded');

const { getRecommendations, searchProduct, checkStock } = require('./utils/recommendationClient');
console.log('7. recommendationClient loaded');

const { saveLead } = require('./utils/saveLead');
console.log('8. saveLead loaded');

console.log('9. About to export, router type:', typeof router);
console.log('10. Router has post:', typeof router.post);

module.exports = router;
console.log('11. Exported');
