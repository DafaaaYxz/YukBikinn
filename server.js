const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Simpan data bot (dalam produksi gunakan database)
let bots = {};
let botMessages = {};

// API Key Gemini
const API_KEY = 'AIzaSyBywyuARVnFRcSMDerQJ2PZ_DZWHt5XaxA';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${API_KEY}&alt=sse`;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/bot/:botId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bot.html'));
});

// API untuk membuat bot baru
app.post('/api/create-bot', (req, res) => {
  const { name, description, imageUrl } = req.body;
  
  if (!name || !description) {
    return res.status(400).json({ error: 'Nama dan deskripsi bot diperlukan' });
  }
  
  const botId = generateBotId();
  const bot = {
    id: botId,
    name,
    description,
    imageUrl: imageUrl || '/default-avatar.png',
    createdAt: new Date().toISOString()
  };
  
  bots[botId] = bot;
  botMessages[botId] = [];
  
  res.json({ 
    success: true, 
    botId, 
    botUrl: `/bot/${botId}`,
    bot 
  });
});

// API untuk mendapatkan data bot
app.get('/api/bot/:botId', (req, res) => {
  const { botId } = req.params;
  const bot = bots[botId];
  
  if (!bot) {
    return res.status(404).json({ error: 'Bot tidak ditemukan' });
  }
  
  res.json(bot);
});

// API untuk mendapatkan semua bot (untuk halaman publik)
app.get('/api/bots', (req, res) => {
  res.json(Object.values(bots));
});

// Socket.io untuk real-time chat
io.on('connection', (socket) => {
  console.log('User terhubung:', socket.id);
  
  // Bergabung ke room bot tertentu
  socket.on('join-bot', (botId) => {
    socket.join(botId);
    console.log(`User ${socket.id} bergabung dengan bot ${botId}`);
    
    // Kirim riwayat pesan
    if (botMessages[botId]) {
      socket.emit('message-history', botMessages[botId]);
    }
  });
  
  // Terima pesan baru
  socket.on('send-message', async (data) => {
    const { botId, message, userName = 'Pengguna' } = data;
    
    if (!bots[botId]) {
      socket.emit('error', 'Bot tidak ditemukan');
      return;
    }
    
    // Simpan pesan pengguna
    const userMessage = {
      id: generateMessageId(),
      type: 'user',
      content: message,
      sender: userName,
      timestamp: new Date().toISOString()
    };
    
    if (!botMessages[botId]) {
      botMessages[botId] = [];
    }
    
    botMessages[botId].push(userMessage);
    
    // Broadcast pesan pengguna ke semua di room
    io.to(botId).emit('new-message', userMessage);
    
    try {
      // Dapatkan persona bot
      const botPersona = bots[botId].description;
      
      // Kirim ke Gemini API
      const response = await axios.post(
        GEMINI_API_URL.replace('sse', 'generateContent'),
        {
          contents: [
            {
              parts: [
                {
                  text: `Anda adalah: ${botPersona}. Anda sedang berbicara dengan seseorang. Berikan respons yang sesuai dengan persona ini.\n\nPengguna: ${message}\nAnda:`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
      
      const botResponse = response.data.candidates[0].content.parts[0].text;
      
      // Simpan pesan bot
      const botMessage = {
        id: generateMessageId(),
        type: 'bot',
        content: botResponse,
        sender: bots[botId].name,
        timestamp: new Date().toISOString()
      };
      
      botMessages[botId].push(botMessage);
      
      // Broadcast pesan bot ke semua di room
      io.to(botId).emit('new-message', botMessage);
      
    } catch (error) {
      console.error('Error mengirim ke Gemini API:', error);
      
      const errorMessage = {
        id: generateMessageId(),
        type: 'bot',
        content: 'Maaf, saya sedang mengalami gangguan. Silakan coba lagi nanti.',
        sender: bots[botId].name,
        timestamp: new Date().toISOString()
      };
      
      botMessages[botId].push(errorMessage);
      io.to(botId).emit('new-message', errorMessage);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User terputus:', socket.id);
  });
});

// Fungsi pembantu
function generateBotId() {
  return 'bot_' + Math.random().toString(36).substr(2, 9);
}

function generateMessageId() {
  return 'msg_' + Math.random().toString(36).substr(2, 9);
}

// Jalankan server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
