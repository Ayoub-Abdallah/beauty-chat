const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const personasPath = path.join(__dirname, '..', 'config', 'personas.json');
const KB_PATH = path.join(__dirname, '..', 'data', 'knowledge.json');

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

// Gemini integration using @google/genai and API key from GEMINI_API_KEY
async function callGemini(systemPrompt, userMessage) {
  try {
    const { GoogleGenAI } = require('@google/genai');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const prompt = `${systemPrompt}\nUser: ${userMessage}`;
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text;
  } catch (e) {
    console.warn('Gemini call failed or not configured, falling back to a local echo. Error:', e.message);
    return `Echo (fallback): ${systemPrompt}\nUser: ${userMessage}`;
  }
}

router.post('/', async (req, res) => {
  const { message, persona } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const personas = readPersonas();
  const p = personas[persona] || { role: 'a helpful assistant', tone: 'neutral' };

  // Get top 3 relevant KB entries
  const relevant = getRelevantEntries(message, 3);
  const contextText = relevant.map(r => `Title: ${r.title}\nContent: ${r.content}\nTags: ${ (r.tags||[]).join(', ') }\n---`).join('\n');

  const systemPrompt = `You are ${p.role}. Tone: ${p.tone}. Use the following internal knowledge when relevant:\n${contextText}`;

  const gResponse = await callGemini(systemPrompt, message);

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
    } catch (e) {
      actionResult = { error: 'failed to execute action', details: e.message };
    }
  }

  res.json({ reply: gResponse, persona: p, relevant, action, actionResult });
});

module.exports = router;
