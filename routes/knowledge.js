const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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

// List
router.get('/', (req, res) => {
  const kb = readKB();
  res.json(kb);
});

// Create
router.post('/', (req, res) => {
  const kb = readKB();
  const { title, content, tags, category } = req.body;
  const doc = {
    id: uuidv4(),
    title: title || 'Untitled',
    content: content || '',
    tags: tags || [],
    category: category || '',
    date: new Date().toISOString()
  };
  kb.push(doc);
  writeKB(kb);
  res.json(doc);
});

// Read one
router.get('/:id', (req, res) => {
  const kb = readKB();
  const doc = kb.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
});

// Update
router.put('/:id', (req, res) => {
  const kb = readKB();
  const idx = kb.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { title, content, tags, category } = req.body;
  kb[idx] = { ...kb[idx], title, content, tags, category, date: new Date().toISOString() };
  writeKB(kb);
  res.json(kb[idx]);
});

// Delete
router.delete('/:id', (req, res) => {
  let kb = readKB();
  kb = kb.filter(d => d.id !== req.params.id);
  writeKB(kb);
  res.json({ success: true });
});

// Simple search by keyword in title/content/tags
router.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const kb = readKB();
  if (!q) return res.json([]);
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
  res.json(results);
});

module.exports = router;
