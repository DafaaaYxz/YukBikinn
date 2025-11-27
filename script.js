// Koneksi Socket.io
const socket = io();

// Elemen DOM
const createBotBtn = document.getElementById('createBotBtn');
const botForm = document.getElementById('botForm');
const botCreationForm = document.getElementById('botCreationForm');
const botCreated = document.getElementById('botCreated');
const botInfo = document.getElementById('botInfo');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const openBotLink = document.getElementById('openBotLink');
const publicBots = document.getElementById('publicBots');

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadPublicBots();
});

createBotBtn.addEventListener('click', () => {
    botForm.classList.remove('hidden');
    createBotBtn.classList.add('hidden');
});

botCreationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const botName = document.getElementById('botName').value;
    const botDescription = document.getElementById('botDescription').value;
    const botImage = document.getElementById('botImage').value;
    
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
        } else {
            alert('Gagal membuat bot: ' + result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Terjadi kesalahan saat membuat bot');
    }
});

copyLinkBtn.addEventListener('click', () => {
    const botUrl = window.location.origin + openBotLink.getAttribute('href');
    navigator.clipboard.writeText(botUrl)
        .then(() => {
            alert('Link berhasil disalin!');
        })
        .catch(err => {
            console.error('Gagal menyalin link: ', err);
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
        const response = await fetch('/api/bots');
        const bots = await response.json();
        
        if (bots.length === 0) {
            publicBots.innerHTML = '<p>Belum ada bot yang dibuat. Jadilah yang pertama!</p>';
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
                </div>
                <div class="bot-card-footer">
                    <a href="/bot/${bot.id}" class="btn-primary" target="_blank">Chat Sekarang</a>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error memuat bot publik:', error);
        publicBots.innerHTML = '<p>Gagal memuat daftar bot.</p>';
    }
}
