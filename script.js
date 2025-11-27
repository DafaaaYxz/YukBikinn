// Koneksi Socket.io dengan error handling
let socket;

try {
  socket = io({
    transports: ['websocket', 'polling'],
    timeout: 10000
  });
  
  socket.on('connect', () => {
    console.log('Terhubung ke server');
  });
  
  socket.on('disconnect', () => {
    console.log('Terputus dari server');
    showNotification('Koneksi terputus. Mencoba menyambung kembali...', 'error');
  });
  
  socket.on('connect_error', (error) => {
    console.error('Koneksi error:', error);
    showNotification('Gagal terhubung ke server', 'error');
  });
  
} catch (error) {
  console.error('Error initializing socket:', error);
}

// Elemen DOM
const createBotBtn = document.getElementById('createBotBtn');
const botForm = document.getElementById('botForm');
const botCreationForm = document.getElementById('botCreationForm');
const botCreated = document.getElementById('botCreated');
const botInfo = document.getElementById('botInfo');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const openBotLink = document.getElementById('openBotLink');
const publicBots = document.getElementById('publicBots');

// Loading state
let isLoading = false;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  loadPublicBots();
  checkHealth();
});

createBotBtn.addEventListener('click', () => {
  botForm.classList.remove('hidden');
  createBotBtn.classList.add('hidden');
});

botCreationForm.addEventListener('submit', async (e) => {
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: botName,
        description: botDescription,
        imageUrl: botImage
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showBotCreated(result.botId, result.bot);
      showNotification('Bot berhasil dibuat!', 'success');
    } else {
      throw new Error(result.error || 'Gagal membuat bot');
    }
  } catch (error) {
    console.error('Error:', error);
    showNotification('Terjadi kesalahan saat membuat bot: ' + error.message, 'error');
  } finally {
    setLoading(false);
  }
});

copyLinkBtn.addEventListener('click', () => {
  const botUrl = window.location.origin + openBotLink.getAttribute('href');
  navigator.clipboard.writeText(botUrl)
    .then(() => {
      showNotification('Link berhasil disalin!', 'success');
    })
    .catch(err => {
      console.error('Gagal menyalin link: ', err);
      showNotification('Gagal menyalin link', 'error');
    });
});

// Fungsi untuk menampilkan hasil pembuatan bot
function showBotCreated(botId, bot) {
  botForm.classList.add('hidden');
  botCreated.classList.remove('hidden');
  
  botInfo.innerHTML = `
    <img src="${bot.imageUrl}" alt="${bot.name}" class="bot-avatar" onerror="this.src='/default-avatar.png'">
    <div>
      <h3>${bot.name}</h3>
      <p>${bot.description}</p>
    </div>
  `;
  
  openBotLink.setAttribute('href', `/bot/${botId}`);
  openBotLink.textContent = `Chat dengan ${bot.name}`;
  
  // Refresh daftar bot publik
  loadPublicBots();
}

// Fungsi untuk memuat daftar bot publik
async function loadPublicBots() {
  try {
    publicBots.innerHTML = '<div class="loading">Memuat bot...</div>';
    
    const response = await fetch('/api/bots');
    if (!response.ok) throw new Error('Network response was not ok');
    
    const bots = await response.json();
    
    if (bots.length === 0) {
      publicBots.innerHTML = '<p class="no-bots">Belum ada bot yang dibuat. Jadilah yang pertama!</p>';
      return;
    }
    
    publicBots.innerHTML = bots.map(bot => `
      <div class="bot-card">
        <div class="bot-card-header">
          <img src="${bot.imageUrl}" alt="${bot.name}" class="bot-card-avatar" onerror="this.src='/default-avatar.png'">
          <h3>${bot.name}</h3>
        </div>
        <div class="bot-card-body">
          <p class="bot-card-description">${bot.description}</p>
          <div class="bot-stats">
            <small>Dibuat: ${new Date(bot.createdAt).toLocaleDateString('id-ID')}</small>
            ${bot.messageCount ? `<small>Pesan: ${bot.messageCount}</small>` : ''}
          </div>
        </div>
        <div class="bot-card-footer">
          <a href="/bot/${bot.id}" class="btn-primary" target="_blank">Chat Sekarang</a>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error memuat bot publik:', error);
    publicBots.innerHTML = '<p class="error">Gagal memuat daftar bot. Silakan refresh halaman.</p>';
  }
}

// Fungsi untuk menampilkan notifikasi
function showNotification(message, type = 'info') {
  // Hapus notifikasi sebelumnya
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Style untuk notifikasi
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 6px;
    color: white;
    font-weight: 500;
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
  `;
  
  if (type === 'success') {
    notification.style.backgroundColor = '#10b981';
  } else if (type === 'error') {
    notification.style.backgroundColor = '#ef4444';
  } else {
    notification.style.backgroundColor = '#3b82f6';
  }
  
  document.body.appendChild(notification);
  
  // Hapus notifikasi setelah 5 detik
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

// Fungsi untuk set loading state
function setLoading(loading) {
  isLoading = loading;
  const submitBtn = botCreationForm.querySelector('button[type="submit"]');
  
  if (loading) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Membuat Bot...';
  } else {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Create Bot';
  }
}

// Fungsi untuk check health server
async function checkHealth() {
  try {
    const response = await fetch('/health');
    if (!response.ok) throw new Error('Server tidak sehat');
    console.log('Server health: OK');
  } catch (error) {
    console.error('Server health check failed:', error);
    showNotification('Koneksi server bermasalah', 'error');
  }
}

// Tambahkan CSS animations untuk notifikasi
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
  
  .loading, .no-bots, .error {
    text-align: center;
    padding: 20px;
    grid-column: 1 / -1;
  }
  
  .bot-stats {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    font-size: 0.8rem;
    color: #666;
  }
`;
document.head.appendChild(style);
