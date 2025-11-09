async function loadPersonas() {
  const res = await fetch('/api/personas');
  const data = await res.json();
  const sel = document.getElementById('personaSelect');
  Object.keys(data).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = `${k} - ${data[k].tone}`;
    sel.appendChild(opt);
  });
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
  const persona = document.getElementById('personaSelect').value;
  const message = input.value.trim();
  if (!message) return;
  appendMessage('user', message);
  input.value = '';

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, persona })
  });

  const data = await res.json();
  appendMessage('assistant', data.reply || JSON.stringify(data));
  
  if (data.action) {
    appendMessage('assistant', 'Action suggested: ' + JSON.stringify(data.action));
    if (data.actionResult) appendMessage('assistant', 'Action result: ' + JSON.stringify(data.actionResult));
  }
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

loadPersonas();
