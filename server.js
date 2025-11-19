require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/knowledge', require('./routes/knowledge'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/leads', require('./routes/leads')); // NEW: Lead management
app.use('/action', require('./routes/actions'));

// Serve personas config for frontend
app.get('/api/personas', (req, res) => {
  const fs = require('fs');
  const p = path.join(__dirname, 'config', 'personas.json');
  fs.readFile(p, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Could not read personas' });
    res.type('json').send(data);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
