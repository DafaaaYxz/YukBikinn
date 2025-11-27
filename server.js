require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Konfigurasi Socket.io untuk production
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? true // Allow all origins in production for Vercel
      : "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // CORS headers untuk Vercel
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://*.vercel.app', 'https://*.railway.app']
    : ['http://localhost:3000'];
  
  const origin = req.headers.origin;
  if (allowedOrigins.some(allowed => origin && origin.match(allowed))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Simpan data bot (dalam produksi gunakan database seperti Redis/MongoDB)
let bots = {};
let botMessages = {};

// API Key Gemini dari environment variable
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBywyuARVnFRcSMDerQJ2PZ_DZWHt5XaxA';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

// Validasi API Key
if (!API_KEY) {
  console.warn('Peringatan: GEMINI_API_KEY tidak ditemukan di environment variables');
}

// Routes - for SPA, all relevant paths should serve the main index file
app.get(['/', '/bot/:botId'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint untuk Vercel/Railway
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: 'Vercel'
  });
});

// API untuk membuat bot baru
app.post('/api/create-bot', async (req, res) => {
  try {
    const { name, description, imageUrl } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({ error: 'Nama dan deskripsi bot diperlukan' });
    }
    
    // Validasi input
    if (name.length > 50) {
      return res.status(400).json({ error: 'Nama bot maksimal 50 karakter' });
    }
    
    if (description.length > 500) {
      return res.status(400).json({ error: 'Deskripsi bot maksimal 500 karakter' });
    }
    
    const botId = generateBotId();
    const bot = {
      id: botId,
      name: name.trim(),
      description: description.trim(),
      imageUrl: imageUrl && isValidUrl(imageUrl) ? imageUrl.trim() : '/default-avatar.png',
      createdAt: new Date().toISOString(),
      messageCount: 0
    };
    
    bots[botId] = bot;
    botMessages[botId] = [];
    
    console.log(`Bot baru dibuat: ${bot.name} (${botId})`);
    
    res.json({ 
      success: true, 
      botId, 
      botUrl: `/bot/${botId}`,
      bot 
    });
  } catch (error) {
    console.error('Error creating bot:', error);
    res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
});

// API untuk mendapatkan data bot
app.get('/api/bot/:botId', (req, res) => {
  try {
    const { botId } = req.params;
    const bot = bots[botId];
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot tidak ditemukan' });
    }
    
    res.json(bot);
  } catch (error) {
    console.error('Error getting bot:', error);
    res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
});

// API untuk mendapatkan semua bot (untuk halaman publik)
app.get('/api/bots', (req, res) => {
  try {
    // Convert object ke array dan urutkan berdasarkan tanggal dibuat
    const botsArray = Object.values(bots)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(botsArray);
  } catch (error) {
    console.error('Error getting bots:', error);
    res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
});

// API stats
app.get('/api/stats', (req, res) => {
  const totalBots = Object.keys(bots).length;
  const totalMessages = Object.values(botMessages).reduce((acc, messages) => acc + messages.length, 0);
  
  res.json({
    totalBots,
    totalMessages,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Socket.io untuk real-time chat
io.on('connection', (socket) => {
  console.log('User terhubung:', socket.id);
  
  // Bergabung ke room bot tertentu
  socket.on('join-bot', (botId) => {
    if (!bots[botId]) {
      socket.emit('error', 'Bot tidak ditemukan');
      return;
    }
    
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
    
    // Validasi pesan
    if (!message || message.trim().length === 0) {
      socket.emit('error', 'Pesan tidak boleh kosong');
      return;
    }
    
    if (message.length > 1000) {
      socket.emit('error', 'Pesan terlalu panjang (maksimal 1000 karakter)');
      return;
    }
    
    // Simpan pesan pengguna
    const userMessage = {
      id: generateMessageId(),
      type: 'user',
      content: message.trim(),
      sender: userName,
      timestamp: new Date().toISOString(),
      botId: botId
    };
    
    if (!botMessages[botId]) {
      botMessages[botId] = [];
    }
    
    botMessages[botId].push(userMessage);
    bots[botId].messageCount = (bots[botId].messageCount || 0) + 1;
    
    // Broadcast pesan pengguna ke semua di room
    io.to(botId).emit('new-message', userMessage);
    
    try {
      // Dapatkan persona bot
      const botPersona = bots[botId].description;
      
      // Kirim ke Gemini API
      const response = await axios.post(
        `${GEMINI_API_URL}?key=${API_KEY}`,
        {
          contents: [
            {
              parts: [
                {
                  text: `Anda adalah: ${botPersona}. Anda sedang berbicara dengan seseorang. Berikan respons yang sesuai dengan persona ini. Jangan mengaku sebagai AI atau model bahasa. Berperilakulah seperti persona yang diberikan.\n\nPengguna: ${message}\nAnda:`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
            topP: 0.8,
            topK: 40
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 15000 // 15 detik timeout untuk Vercel
        }
      );
      
      let botResponse;
      if (response.data && response.data.candidates && response.data.candidates[0]) {
        botResponse = response.data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Respons API tidak valid');
      }
      
      // Simpan pesan bot
      const botMessage = {
        id: generateMessageId(),
        type: 'bot',
        content: botResponse,
        sender: bots[botId].name,
        timestamp: new Date().toISOString(),
        botId: botId
      };
      
      botMessages[botId].push(botMessage);
      bots[botId].messageCount = (bots[botId].messageCount || 0) + 1;
      
      // Broadcast pesan bot ke semua di room
      io.to(botId).emit('new-message', botMessage);
      
    } catch (error) {
      console.error('Error mengirim ke Gemini API:', error);
      
      const errorMessage = {
        id: generateMessageId(),
        type: 'bot',
        content: 'Maaf, saya sedang mengalami gangguan. Silakan coba lagi nanti.',
        sender: bots[botId].name,
        timestamp: new Date().toISOString(),
        botId: botId
      };
      
      botMessages[botId].push(errorMessage);
      io.to(botId).emit('new-message', errorMessage);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('User terputus:', socket.id, 'Alasan:', reason);
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: 'Terjadi kesalahan internal server' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Fungsi pembantu
function generateBotId() {
  return 'bot_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
}

function generateMessageId() {
  return 'msg_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Graceful shutdown untuk Vercel
process.on('SIGTERM', () => {
  console.log('Menerima SIGTERM, menutup server dengan baik...');
  server.close(() => {
    console.log('Server ditutup.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Menerima SIGINT, menutup server dengan baik...');
  server.close(() => {
    console.log('Server ditutup.');
    process.exit(0);
  });
});

// Jalankan server only if this file is run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server berjalan di http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Gemini API Key: ${API_KEY ? 'Tersedia' : 'Tidak tersedia'}`);
  });
}

module.exports = server;
