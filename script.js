// =================================================================================
// GLOBAL STATE & INITIALIZATION
// =================================================================================

let socket;
let isLoading = false;

// Initialize the application based on the current URL
document.addEventListener('DOMContentLoaded', handleRoute);
window.addEventListener('popstate', handleRoute);

// =================================================================================
// ROUTER
// =================================================================================

async function handleRoute() {
  const path = window.location.pathname;
  const appRoot = document.getElementById('app-root');

  if (!appRoot) {
    console.error('Fatal error: #app-root element not found.');
    return;
  }

  // Disconnect any existing socket connection when changing routes
  if (socket && socket.connected) {
    socket.disconnect();
  }

  if (path.startsWith('/bot/')) {
    const botId = path.split('/')[2];
    if (botId) {
      await loadChatPage(appRoot, botId);
    } else {
      // Invalid bot URL, redirect to home
      window.history.pushState({}, '', '/');
      loadHomePage(appRoot);
    }
  } else {
    loadHomePage(appRoot);
  }
}

async function loadHomePage(appRoot) {
  // The home page HTML is already part of the initial index.html,
  // so we just need to ensure the logic is running.
  // In a more complex SPA, we might fetch this template as well.
  initializeHomePage();
}

async function loadChatPage(appRoot, botId) {
  try {
    // Fetch the HTML structure of the chat page
    const response = await fetch('/bot.html');
    if (!response.ok) throw new Error('Could not load chat page template.');
    const chatHtml = await response.text();
    appRoot.innerHTML = chatHtml;
    // Once the HTML is in place, initialize the chat logic
    initializeChat(botId);
  } catch (error) {
    console.error('Error loading chat page:', error);
    appRoot.innerHTML = `<div class="container"><p class="error">Gagal memuat halaman chat. Silakan <a href="/">kembali ke beranda</a>.</p></div>`;
  }
}

// =================================================================================
// HOME PAGE LOGIC
// =================================================================================

function initializeHomePage() {
  // Connect to the server, but don't join any specific bot room yet
  connectToSocket();

  // Query for elements that are specific to the home page
  const createBotBtn = document.getElementById('createBotBtn');
  const botCreationForm = document.getElementById('botCreationForm');
  const copyLinkBtn = document.getElementById('copyLinkBtn');

  // Attach event listeners
  if (createBotBtn) {
    createBotBtn.addEventListener('click', () => {
      document.getElementById('botForm').classList.remove('hidden');
      createBotBtn.classList.add('hidden');
    });
  }

  if (botCreationForm) {
    botCreationForm.addEventListener('submit', handleBotCreationSubmit);
  }

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', handleCopyLink);
  }

  // Load initial data for the home page
  loadPublicBots();
  checkHealth();
}

async function handleBotCreationSubmit(e) {
  e.preventDefault();
  if (isLoading) return;

  const botName = document.getElementById('botName').value;
  const botDescription = document.getElementById('botDescription').value;
  const botImage = document.getElementById('botImage').value;

  if (!botName.trim() || !botDescription.trim()) {
    showNotification('Nama dan deskripsi bot harus diisi', 'error');
    return;
  }

  setLoading(true);
  try {
    const response = await fetch('/api/create-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: botName, description: botDescription, imageUrl: botImage })
    });
    const result = await response.json();

    if (result.success) {
      showBotCreated(result.botId, result.bot);
      showNotification('Bot berhasil dibuat!', 'success');
    } else {
      throw new Error(result.error || 'Gagal membuat bot');
    }
  } catch (error) {
    console.error('Error creating bot:', error);
    showNotification('Error: ' + error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function handleCopyLink() {
    const openBotLink = document.getElementById('openBotLink');
    if (!openBotLink) return;

    const botUrl = window.location.origin + openBotLink.getAttribute('href');
    navigator.clipboard.writeText(botUrl)
        .then(() => showNotification('Link berhasil disalin!', 'success'))
        .catch(err => {
            console.error('Gagal menyalin link: ', err);
            showNotification('Gagal menyalin link', 'error');
        });
}

function showBotCreated(botId, bot) {
    document.getElementById('botForm').classList.add('hidden');
    document.getElementById('botCreated').classList.remove('hidden');

    const botInfo = document.getElementById('botInfo');
    botInfo.innerHTML = `
    <img src="${bot.imageUrl}" alt="${bot.name}" class="bot-avatar" onerror="this.src='/default-avatar.png'">
    <div>
      <h3>${bot.name}</h3>
      <p>${bot.description}</p>
    </div>
  `;

    const openBotLink = document.getElementById('openBotLink');
    openBotLink.setAttribute('href', `/bot/${botId}`);
    openBotLink.textContent = `Chat dengan ${bot.name}`;
    // Prevent default navigation and use the router instead
    openBotLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.history.pushState({}, '', `/bot/${botId}`);
        handleRoute();
    });

    loadPublicBots();
}

async function loadPublicBots() {
  const publicBotsContainer = document.getElementById('publicBots');
  if (!publicBotsContainer) return;

  try {
    publicBotsContainer.innerHTML = '<div class="loading">Memuat bot...</div>';
    const response = await fetch('/api/bots');
    if (!response.ok) throw new Error('Network response was not ok');
    const bots = await response.json();

    if (bots.length === 0) {
      publicBotsContainer.innerHTML = '<p class="no-bots">Belum ada bot yang dibuat. Jadilah yang pertama!</p>';
      return;
    }

    publicBotsContainer.innerHTML = bots.map(bot => `
      <div class="bot-card">
        <div class="bot-card-header">
          <img src="${bot.imageUrl}" alt="${bot.name}" class="bot-card-avatar" onerror="this.src='/default-avatar.png'">
          <h3>${bot.name}</h3>
        </div>
        <div class="bot-card-body">
          <p class="bot-card-description">${bot.description}</p>
        </div>
        <div class="bot-card-footer">
          <a href="/bot/${bot.id}" class="btn-primary bot-link">Chat Sekarang</a>
        </div>
      </div>
    `).join('');

    // Add event listeners to new links to use the router
    document.querySelectorAll('.bot-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const url = link.getAttribute('href');
            window.history.pushState({}, '', url);
            handleRoute();
        });
    });

  } catch (error) {
    console.error('Error memuat bot publik:', error);
    publicBotsContainer.innerHTML = '<p class="error">Gagal memuat daftar bot.</p>';
  }
}

// =================================================================================
// CHAT PAGE LOGIC
// =================================================================================

let isConnected = false;

function initializeChat(botId) {
  // Connect to the socket and join the bot room
  connectToSocket(() => {
    socket.emit('join-bot', botId);
  });

  // Query for elements specific to the chat page
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');

  // Attach event listeners
  if (sendBtn) sendBtn.addEventListener('click', () => sendMessage(botId));
  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(botId);
      }
    });
  }
  
  // Fetch bot data and set up the chat UI
  loadBotData(botId);
}

async function loadBotData(botId) {
  const chatHeader = document.getElementById('chatHeader');
  const chatMessages = document.getElementById('chatMessages');

  try {
    const response = await fetch(`/api/bot/${botId}`);
    if (!response.ok) {
      throw new Error(response.status === 404 ? 'Bot tidak ditemukan' : 'Gagal memuat data bot');
    }
    const bot = await response.json();

    chatHeader.innerHTML = `
        <div class="header-content">
            <a href="/" class="back-btn" onclick="goBack(event)">← Kembali</a>
            <img src="${bot.imageUrl}" alt="${bot.name}" class="chat-header-avatar" onerror="this.src='/default-avatar.png'">
            <div class="header-info">
                <h2>${bot.name}</h2>
                <p>${bot.description}</p>
            </div>
        </div>
        <div class="connection-status" id="connectionStatus"></div>
    `;

    chatMessages.innerHTML = '';
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;
  } catch (error) {
    console.error('Error memuat data bot:', error);
    chatHeader.innerHTML = `<div class="header-content"><a href="/" class="back-btn" onclick="goBack(event)">← Kembali</a><h2>Error</h2></div>`;
    chatMessages.innerHTML = `<div class="error-message"><h3>${error.message}</h3></div>`;
  }
}

function sendMessage(botId) {
  if (!isConnected) {
    showNotification('Tidak terhubung ke server.', 'error');
    return;
  }
  const messageInput = document.getElementById('messageInput');
  const message = messageInput.value.trim();
  if (!message) return;

  socket.emit('send-message', { botId, message, userName: 'Anda' });
  messageInput.value = '';
}

function addMessageToChat(message) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const messageElement = document.createElement('div');
  messageElement.className = `message ${message.type}`;
  
  const time = new Date(message.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const avatarSrc = message.type === 'bot'
      ? (document.querySelector('.chat-header-avatar')?.src || '/default-avatar.png')
      : '/user-avatar.png'; // Assuming a default user avatar

  messageElement.innerHTML = `
      <img src="${avatarSrc}" class="message-avatar" onerror="this.src='/default-avatar.png'">
      <div class="message-content">
          <div class="message-sender">${message.sender}</div>
          <div class="message-text">${message.content.replace(/\n/g, '<br>')}</div>
          <div class="message-time">${time}</div>
      </div>
  `;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// =================================================================================
// SHARED & UTILITY FUNCTIONS
// =================================================================================

function connectToSocket(callback) {
  try {
    socket = io({ transports: ['websocket', 'polling'], timeout: 10000 });

    socket.on('connect', () => {
      console.log('Terhubung ke server:', socket.id);
      isConnected = true;
      updateConnectionStatus(true);
      if (callback) callback();
    });

    socket.on('disconnect', () => {
      console.log('Terputus dari server');
      isConnected = false;
      updateConnectionStatus(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Koneksi error:', error);
      isConnected = false;
      updateConnectionStatus(false);
      showNotification('Gagal terhubung ke server', 'error');
    });

    // Chat-specific listeners
    socket.on('message-history', (messages) => {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        chatMessages.innerHTML = '';
        messages.forEach(addMessageToChat);
    });

    socket.on('new-message', addMessageToChat);

    socket.on('error', (error) => showNotification('Error: ' + error, 'error'));

  } catch (error) {
    console.error('Error initializing socket:', error);
  }
}

function goBack(event) {
    event.preventDefault();
    window.history.back();
}

function updateConnectionStatus(connected) {
  const statusElement = document.getElementById('connectionStatus');
  if (statusElement) {
    statusElement.innerHTML = connected
      ? `<span class="status-dot" style="background-color: #10b981;"></span><span class="status-text">Terhubung</span>`
      : `<span class="status-dot" style="background-color: #ef4444;"></span><span class="status-text">Terputus</span>`;
  }
}

function setLoading(loading) {
  isLoading = loading;
  const submitBtn = document.querySelector('#botCreationForm button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = loading;
    submitBtn.innerHTML = loading ? 'Membuat Bot...' : 'Create Bot';
  }
}

async function checkHealth() {
  try {
    const response = await fetch('/health');
    if (!response.ok) throw new Error('Server tidak sehat');
  } catch (error) {
    console.error('Server health check failed:', error);
    showNotification('Koneksi server bermasalah', 'error');
  }
}

function showNotification(message, type = 'info') {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Add required CSS for notifications if it's not in the main stylesheet
if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      .notification {
        position: fixed; top: 20px; right: 20px; padding: 12px 20px;
        border-radius: 6px; color: white; font-weight: 500;
        z-index: 1000; animation: slideIn 0.3s ease-out forwards;
        max-width: 300px;
      }
      .notification-success { background-color: #10b981; }
      .notification-error { background-color: #ef4444; }
      .notification-info { background-color: #3b82f6; }
      @keyframes slideIn {
        from { transform: translateX(110%); }
        to { transform: translateX(0); }
      }
      @keyframes slideOut {
        from { transform: translateX(0); }
        to { transform: translateX(110%); }
      }
    `;
    document.head.appendChild(style);
}
