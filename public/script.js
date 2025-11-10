async function loadPersonas() {
  // No longer needed - using single consultant persona
  const sel = document.getElementById('personaSelect');
  if (sel) {
    sel.style.display = 'none'; // Hide persona selector
  }
}

function appendMessage(role, text) {
  const chat = document.getElementById('chat');
  const m = document.createElement('div');
  m.className = 'message ' + (role === 'user' ? 'user' : 'assistant');
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
      body: JSON.stringify({ message, persona: 'consultant' })
    });
    const data = await res.json();
    
    // Hide typing indicator
    hideTypingIndicator();
    
    appendMessage('assistant', data.reply || JSON.stringify(data));
    
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

loadPersonas();
