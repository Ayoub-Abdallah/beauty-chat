#!/usr/bin/env node
/**
 * Test script to check available Gemini models
 */
require('dotenv').config();

async function testModels() {
  const { GoogleGenAI } = require('@google/genai');
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not set');
    process.exit(1);
  }
  
  console.log('🔍 Testing Gemini API models...\n');
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Models to test
  const modelsToTest = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro',
    'gemini-pro',
    'gemini-pro-latest'
  ];
  
  const testPrompt = 'Say "Hello" in one word only.';
  
  for (const modelName of modelsToTest) {
    try {
      console.log(`Testing: ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: testPrompt,
      });
      console.log(`  ✅ SUCCESS - Response: ${response.text.trim()}`);
    } catch (error) {
      const errorMsg = error.message || JSON.stringify(error);
      if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        console.log(`  ❌ NOT FOUND`);
      } else if (errorMsg.includes('503') || errorMsg.includes('overloaded')) {
        console.log(`  ⚠️  OVERLOADED (model exists but busy)`);
      } else {
        console.log(`  ❌ ERROR: ${errorMsg.substring(0, 100)}`);
      }
    }
    console.log('');
  }
  
  console.log('\n✅ Test complete!');
  console.log('\nRecommendation: Use the first working model from above in your .env file');
}

testModels().catch(console.error);
