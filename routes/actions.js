const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const KB_PATH = path.join(__dirname, '..', 'data', 'knowledge.json');

function readKB() {
  try {
    const raw = fs.readFileSync(KB_PATH, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function writeKB(data) {
  fs.writeFileSync(KB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Search action: returns matched docs
router.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const kb = readKB();
  if (!q) return res.json({ results: [] });
  const results = kb
    .map(doc => {
      const score = ((doc.title || '').toLowerCase().includes(q) ? 2 : 0) +
                    ((doc.content || '').toLowerCase().includes(q) ? 1 : 0) +
                    ((doc.tags || []).join(' ').toLowerCase().includes(q) ? 1 : 0);
      return { doc, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(x => x.doc);
  res.json({ results });
});

// Summarize: simple extractive summary (first N words)
router.post('/summarize', (req, res) => {
  const { text, words } = req.body;
  const w = words && Number(words) ? Number(words) : 50;
  if (!text) return res.status(400).json({ error: 'No text provided' });
  const summary = text.split(/\s+/).slice(0, w).join(' ');
  res.json({ summary });
});

// Add knowledge: expects title, content, tags, category
router.post('/addKnowledge', (req, res) => {
  const kb = readKB();
  const { title, content, tags, category } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });
  const doc = {
    id: require('uuid').v4(),
    title: title || 'Untitled',
    content,
    tags: tags || [],
    category: category || '',
    date: new Date().toISOString()
  };
  kb.push(doc);
  writeKB(kb);
  res.json({ added: doc });
});

module.exports = router;
