const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store room data
const rooms = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Server is running',
    activeRooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// Get room info
app.get('/room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const room = rooms.get(roomId);
  
  if (room) {
    res.json({
      exists: true,
      userCount: room.users.size,
      drawHistoryLength: room.drawHistory.length
    });
  } else {
    res.json({ exists: false });
  }
});

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Join room
  socket.on('joinRoom', ({ roomId, isCreating }) => {
    console.log(`Client ${socket.id} joining room: ${roomId}`);
    
    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Set(),
        drawHistory: []
      });
      console.log(`Room created: ${roomId}`);
    }
    
    const room = rooms.get(roomId);
    room.users.add(socket.id);
    socket.join(roomId);
    socket.roomId = roomId;
    
    // Send existing drawing history to new user
    socket.emit('drawHistory', room.drawHistory);
    
    // Notify all users in room about user count
    io.to(roomId).emit('userCount', room.users.size);
    
    console.log(`Room ${roomId} now has ${room.users.size} users`);
  });
  
  // Handle drawing
  socket.on('draw', (data) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (room) {
      // Save to room history
      room.drawHistory.push(data);
      
      // Broadcast to all other users in the room
      socket.to(roomId).emit('draw', data);
    }
  });
  
  // Handle clear canvas
  socket.on('clear', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (room) {
      // Clear room history
      room.drawHistory = [];
      
      // Broadcast to all users in the room
      io.to(roomId).emit('clear');
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.users.delete(socket.id);
      
      // Notify remaining users
      io.to(roomId).emit('userCount', room.users.size);
      
      // Clean up empty rooms after 1 hour
      if (room.users.size === 0) {
        setTimeout(() => {
          if (rooms.has(roomId) && rooms.get(roomId).users.size === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
          }
        }, 3600000); // 1 hour
      }
      
      console.log(`Room ${roomId} now has ${room.users.size} users`);
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
