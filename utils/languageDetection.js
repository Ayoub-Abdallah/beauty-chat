/**
 * Language Detection Module
 * Detects whether user is speaking Arabic or French
 */

/**
 * Detect language from message
 * @param {string} message - User message
 * @returns {string} - 'ar' for Arabic, 'fr' for French
 */
function detectLanguage(message) {
  // Check for Arabic characters (including Algerian Darja)
  const arabicPattern = /[\u0600-\u06FF]/;
  
  if (arabicPattern.test(message)) {
    return 'ar';
  }
  
  return 'fr';
}

/**
 * Get language name for API/display purposes
 * @param {string} langCode - 'ar' or 'fr'
 * @returns {string} - Full language name
 */
function getLanguageName(langCode) {
  return langCode === 'ar' ? 'Arabic (Algerian Darja)' : 'French';
}

module.exports = { 
  detectLanguage,
  getLanguageName
};
