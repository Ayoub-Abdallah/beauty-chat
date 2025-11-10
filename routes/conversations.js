const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const CONVERSATIONS_PATH = path.join(__dirname, '..', 'data', 'conversations.json');

/**
 * Conversation Management API
 * Provides endpoints to manage conversation sessions
 */

function loadConversations() {
  try {
    const raw = fs.readFileSync(CONVERSATIONS_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function saveConversations(conversations) {
  try {
    fs.writeFileSync(CONVERSATIONS_PATH, JSON.stringify(conversations, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving conversations:', e.message);
  }
}

// Get all conversation sessions (summary view)
router.get('/', (req, res) => {
  const conversations = loadConversations();
  const summary = Object.keys(conversations).map(sessionId => {
    const conv = conversations[sessionId];
    return {
      sessionId,
      messageCount: conv.length,
      lastActivity: conv.length > 0 ? conv[conv.length - 1].timestamp : null,
      firstMessage: conv.length > 0 ? conv[0].content.substring(0, 50) + '...' : ''
    };
  });
  res.json(summary);
});

// Get specific conversation by session ID
router.get('/:sessionId', (req, res) => {
  const conversations = loadConversations();
  const conversation = conversations[req.params.sessionId];
  
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  
  res.json({
    sessionId: req.params.sessionId,
    messages: conversation,
    messageCount: conversation.length
  });
});

// Delete a conversation session
router.delete('/:sessionId', (req, res) => {
  const conversations = loadConversations();
  
  if (!conversations[req.params.sessionId]) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  
  delete conversations[req.params.sessionId];
  saveConversations(conversations);
  
  res.json({ success: true, message: 'Conversation deleted' });
});

// Clear all conversations (admin function)
router.delete('/', (req, res) => {
  saveConversations({});
  res.json({ success: true, message: 'All conversations cleared' });
});

// Get conversation statistics
router.get('/stats/summary', (req, res) => {
  const conversations = loadConversations();
  const stats = {
    totalSessions: Object.keys(conversations).length,
    totalMessages: Object.values(conversations).reduce((sum, conv) => sum + conv.length, 0),
    averageMessagesPerSession: 0,
    activeSessions: 0,
    oldestSession: null,
    newestSession: null
  };
  
  if (stats.totalSessions > 0) {
    stats.averageMessagesPerSession = Math.round(stats.totalMessages / stats.totalSessions);
    
    // Find active sessions (last activity within 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    stats.activeSessions = Object.values(conversations).filter(conv => {
      if (conv.length === 0) return false;
      const lastMessage = new Date(conv[conv.length - 1].timestamp);
      return lastMessage > oneDayAgo;
    }).length;
    
    // Find oldest and newest sessions
    const timestamps = Object.values(conversations)
      .filter(conv => conv.length > 0)
      .map(conv => new Date(conv[0].timestamp));
    
    if (timestamps.length > 0) {
      stats.oldestSession = new Date(Math.min(...timestamps));
      stats.newestSession = new Date(Math.max(...timestamps));
    }
  }
  
  res.json(stats);
});

module.exports = router;
