/**
 * Recommendation API Client
 * Interfaces with the external recommendation microservice
 */

const axios = require('axios');

const RECOMMENDATION_URL = process.env.RECOMMENDATION_URL || 'http://localhost:4708';

/**
 * Get product recommendations from microservice
 * @param {Object} summary - Conversation summary
 * @returns {Promise<Array>} - Recommended products
 */
async function getRecommendations(summary) {
  try {
    console.log(`🔍 Calling recommendation API: ${RECOMMENDATION_URL}/recommend`);
    
    const response = await axios.post(`${RECOMMENDATION_URL}/recommend`, summary, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.recommendations) {
      console.log(`✅ Got ${response.data.recommendations.length} recommendations`);
      return response.data.recommendations;
    }
    
    return [];
    
  } catch (error) {
    console.warn('⚠️ Recommendation API call failed:', error.message);
    
    // Return empty array - chat will continue with knowledge base fallback
    return [];
  }
}

/**
 * Search for a specific product
 * @param {string} searchTerm - Product name or search term
 * @returns {Promise<Array>} - Matching products
 */
async function searchProduct(searchTerm) {
  try {
    console.log(`🔍 Searching for product: ${searchTerm}`);
    
    const response = await axios.get(`${RECOMMENDATION_URL}/product/search/${encodeURIComponent(searchTerm)}`, {
      timeout: 5000
    });
    
    if (response.data && response.data.products) {
      console.log(`✅ Found ${response.data.products.length} matching products`);
      return response.data.products;
    }
    
    return [];
    
  } catch (error) {
    console.warn('⚠️ Product search failed:', error.message);
    return [];
  }
}

/**
 * Get product details by ID
 * @param {string} productId - Product ID
 * @returns {Promise<Object|null>} - Product details
 */
async function getProductById(productId) {
  try {
    console.log(`🔍 Getting product details: ${productId}`);
    
    const response = await axios.get(`${RECOMMENDATION_URL}/product/${productId}`, {
      timeout: 5000
    });
    
    if (response.data && response.data.product) {
      console.log(`✅ Got product details for: ${response.data.product.name}`);
      return response.data.product;
    }
    
    return null;
    
  } catch (error) {
    console.warn('⚠️ Get product failed:', error.message);
    return null;
  }
}

/**
 * Check stock availability
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} - Stock information
 */
async function checkStock(productId) {
  try {
    const response = await axios.get(`${RECOMMENDATION_URL}/product/${productId}/stock`, {
      timeout: 5000
    });
    
    if (response.data) {
      return {
        available: response.data.available || false,
        quantity: response.data.quantity || 0,
        status: response.data.status || 'unknown'
      };
    }
    
    return { available: false, quantity: 0, status: 'unknown' };
    
  } catch (error) {
    console.warn('⚠️ Stock check failed:', error.message);
    return { available: false, quantity: 0, status: 'unknown' };
  }
}

/**
 * Health check for recommendation service
 * @returns {Promise<boolean>} - True if service is healthy
 */
async function healthCheck() {
  try {
    const response = await axios.get(`${RECOMMENDATION_URL}/health`, {
      timeout: 3000
    });
    
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

module.exports = {
  getRecommendations,
  searchProduct,
  getProductById,
  checkStock,
  healthCheck,
  RECOMMENDATION_URL
};
