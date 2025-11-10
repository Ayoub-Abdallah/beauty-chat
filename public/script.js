/**
 * Session Management for Conversation Continuity
 * Maintains session ID in localStorage for persistent conversations
 */
let currentSessionId = localStorage.getItem('chatSessionId') || null;

async function loadPersonas() {
  // No longer needed - using single consultant persona
  const sel = document.getElementById('personaSelect');
  if (sel) {
    sel.style.display = 'none'; // Hide persona selector
  }
  
  // Initialize session management
  initializeSession();
}

/**
 * Initialize or resume chat session
 * Creates new session ID if none exists, or resumes existing session
 */
function initializeSession() {
  if (!currentSessionId) {
    // Generate new session ID for new conversations
    currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chatSessionId', currentSessionId);
    
    // Show welcome message for new sessions
    appendMessage('assistant', 'أهلا وسهلا بيك في متجرنا للجمال والصحة 🌸 كيفاش نقدر نساعدك اليوم؟', true);
  } else {
    // Resuming existing session - show continuation message
    appendMessage('assistant', 'أهلا بيك مرة أخرى! 😊 نكمل محادثتنا من فين وقفنا؟', true);
  }
  
  updateSessionInfo();
}

/**
 * Start a new conversation session
 * Clears history and generates new session ID
 */
function startNewSession() {
  currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('chatSessionId', currentSessionId);
  
  // Clear chat display
  const chatContainer = document.getElementById('chat');
  chatContainer.innerHTML = '';
  
  // Show new session welcome
  appendMessage('assistant', 'أهلا وسهلا بيك في متجرنا الجديد للجمال والصحة 🌸 كيفاش نقدر نساعدك؟', true);
  updateSessionInfo();
}

/**
 * Update session information display
 */
function updateSessionInfo() {
  const sessionInfo = document.getElementById('sessionInfo');
  if (sessionInfo) {
    const shortId = currentSessionId.split('_')[1] || 'unknown';
    sessionInfo.textContent = `Session: ${shortId}`;
  }
}

function appendMessage(role, text, isSystemMessage = false) {
  const chat = document.getElementById('chat');
  const m = document.createElement('div');
  m.className = 'message ' + (role === 'user' ? 'user' : 'assistant');
  
  if (isSystemMessage) {
    m.className += ' system-message';
  }
  
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text;
  m.appendChild(b);
  chat.appendChild(m);
  chat.scrollTop = chat.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message) return;
  
  appendMessage('user', message);
  input.value = '';
  
  // Show typing indicator
  showTypingIndicator();
  
  try {
    const res = await fetch('/api/chat', { 
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({ 
        message, 
        persona: 'consultant',
        sessionId: currentSessionId 
      })
    });
    const data = await res.json();
    
    // Update session ID if provided by server
    if (data.sessionId && data.sessionId !== currentSessionId) {
      currentSessionId = data.sessionId;
      localStorage.setItem('chatSessionId', currentSessionId);
      updateSessionInfo();
    }
    
    // Hide typing indicator
    hideTypingIndicator();
    
    appendMessage('assistant', data.reply || JSON.stringify(data));
    
    // Show memory status occasionally
    if (data.memoryStatus && Math.random() < 0.2) {
      const memoryIndicator = document.getElementById('memoryStatus');
      if (memoryIndicator) {
        memoryIndicator.textContent = `💭 ${data.memoryStatus}`;
        memoryIndicator.style.display = 'block';
        setTimeout(() => memoryIndicator.style.display = 'none', 3000);
      }
    }
    
    if (data.action) {
      appendMessage('assistant', 'Action suggérée: ' + JSON.stringify(data.action));
      if (data.actionResult) appendMessage('assistant', 'Résultat: ' + JSON.stringify(data.actionResult));
    }
  } catch (error) {
    hideTypingIndicator();
    appendMessage('assistant', 'Désolé, une erreur s\'est produite. Pouvez-vous réessayer?');
  }
}

function showTypingIndicator() {
  const chat = document.getElementById('chat');
  const indicator = document.createElement('div');
  indicator.className = 'message assistant typing-indicator';
  indicator.id = 'typing-indicator';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = 'Votre consultant écrit...';
  indicator.appendChild(bubble);
  chat.appendChild(indicator);
  chat.scrollTop = chat.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

// Add new session button functionality
document.getElementById('newSessionBtn').addEventListener('click', startNewSession);

loadPersonas();
