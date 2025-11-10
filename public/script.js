/**
 * Session Management for Conversation Continuity
 * Maintains session ID in localStorage for persistent conversations
 */
let currentSessionId = localStorage.getItem('chatSessionId') || null;
let currentPurchaseState = 'browsing'; // Track purchase flow state
let currentShoppingCart = null; // Track current shopping cart

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
    
    // Show debug info if available
    if (data.debug && data.debug.foundProducts > 0) {
      console.log('[Debug] Products found:', data.debug.productNames);
      console.log('[Debug] Has product mention:', data.debug.hasProductMention);
      
      // Show product info occasionally for transparency
      if (Math.random() < 0.3) {
        const productInfo = `🛍️ ${data.debug.foundProducts} produits trouvés: ${data.debug.productNames.slice(0, 2).join(', ')}`;
        const memoryIndicator = document.getElementById('memoryStatus');
        if (memoryIndicator) {
          memoryIndicator.textContent = productInfo;
          memoryIndicator.style.display = 'block';
          setTimeout(() => memoryIndicator.style.display = 'none', 4000);
        }
      }
    }
    
    // Update shopping cart display
    if (data.shoppingCart || data.purchaseState) {
      updateShoppingCart(data.shoppingCart, data.purchaseState);
    }
    
    // Show memory status occasionally
    if (data.memoryStatus && Math.random() < 0.2) {
      const memoryIndicator = document.getElementById('memoryStatus');
      if (memoryIndicator) {
        memoryIndicator.textContent = `💭 ${data.memoryStatus}`;
        memoryIndicator.style.display = 'block';
        setTimeout(() => memoryIndicator.style.display = 'none', 3000);
      }
    }
    
    // Show purchase state in debug info
    if (data.purchaseState && data.purchaseState !== 'browsing') {
      console.log('[Debug] Purchase State:', data.purchaseState);
      
      // Show purchase progress indicator
      const memoryIndicator = document.getElementById('memoryStatus');
      if (memoryIndicator) {
        memoryIndicator.textContent = `🛒 ${getStateLabel(data.purchaseState)}`;
        memoryIndicator.style.display = 'block';
        setTimeout(() => memoryIndicator.style.display = 'none', 5000);
      }
    }
    
    if (data.action) {
      appendMessage('assistant', 'Action suggérée: ' + JSON.stringify(data.action));
      if (data.actionResult) appendMessage('assistant', 'Résultat: ' + JSON.stringify(data.actionResult));
    }
    
    // Update shopping cart display if cart data is present
    if (data.cart) {
      updateShoppingCart(data.cart, data.purchaseState);
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

/**
 * Update shopping cart display in UI
 * @param {Object} cartData - Cart information from server
 * @param {string} purchaseState - Current purchase state
 */
function updateShoppingCart(cartData, purchaseState) {
  const cartContainer = document.getElementById('shoppingCart');
  if (!cartContainer) return;
  
  currentPurchaseState = purchaseState || 'browsing';
  currentShoppingCart = cartData;
  
  if (cartData && cartData.product) {
    cartContainer.innerHTML = `
      <div class="cart-active">
        <h4>🛒 Panier en cours</h4>
        <div class="cart-item">
          <strong>${cartData.product}</strong>
          ${cartData.quantity ? `(${cartData.quantity} unité${cartData.quantity > 1 ? 's' : ''})` : ''}
        </div>
        <div class="cart-state">État: ${getStateLabel(purchaseState)}</div>
      </div>
    `;
    cartContainer.style.display = 'block';
  } else {
    cartContainer.style.display = 'none';
  }
}

/**
 * Get localized label for purchase state
 * @param {string} state - Purchase flow state
 * @returns {string} Localized state label
 */
function getStateLabel(state) {
  const stateLabels = {
    'browsing': '🛍️ Navigation',
    'product_identified': '✅ Produit sélectionné', 
    'quantity_requested': '📊 Quantité demandée',
    'customer_details': '📋 Informations client',
    'payment_method': '💳 Mode de paiement',
    'final_confirmation': '✔️ Confirmation finale',
    'order_complete': '🎉 Commande terminée'
  };
  return stateLabels[state] || state;
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

// Add new session button functionality
document.getElementById('newSessionBtn').addEventListener('click', startNewSession);

loadPersonas();
