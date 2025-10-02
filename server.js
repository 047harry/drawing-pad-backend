const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Store room data
const rooms = new Map();
const userRooms = new Map(); // Map socket to room

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
      userCount: room.clients.size,
      drawHistoryLength: room.drawHistory.length
    });
  } else {
    res.json({ exists: false });
  }
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch(data.type) {
        case 'joinRoom':
          handleJoinRoom(ws, data);
          break;
          
        case 'draw':
          handleDraw(ws, data);
          break;
          
        case 'clear':
          handleClear(ws);
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    handleDisconnect(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleJoinRoom(ws, data) {
  const { roomId, isCreating } = data;
  
  console.log(`Client joining room: ${roomId}`);
  
  // Create room if it doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Set(),
      drawHistory: []
    });
    console.log(`Room created: ${roomId}`);
  }
  
  const room = rooms.get(roomId);
  room.clients.add(ws);
  userRooms.set(ws, roomId);
  
  // Send existing drawing history to new user
  ws.send(JSON.stringify({
    type: 'drawHistory',
    history: room.drawHistory
  }));
  
  // Notify all users in room about user count
  broadcastToRoom(roomId, {
    type: 'userCount',
    count: room.clients.size
  });
  
  console.log(`Room ${roomId} now has ${room.clients.size} users`);
}

function handleDraw(ws, data) {
  const roomId = userRooms.get(ws);
  if (!roomId) return;
  
  const room = rooms.get(roomId);
  if (!room) return;
  
  // Save to room history
  room.drawHistory.push(data);
  
  // Broadcast to all other users in the room
  room.clients.forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function handleClear(ws) {
  const roomId = userRooms.get(ws);
  if (!roomId) return;
  
  const room = rooms.get(roomId);
  if (!room) return;
  
  // Clear room history
  room.drawHistory = [];
  
  // Broadcast to all users in the room
  broadcastToRoom(roomId, { type: 'clear' });
}

function handleDisconnect(ws) {
  const roomId = userRooms.get(ws);
  
  if (roomId && rooms.has(roomId)) {
    const room = rooms.get(roomId);
    room.clients.delete(ws);
    
    // Notify remaining users
    broadcastToRoom(roomId, {
      type: 'userCount',
      count: room.clients.size
    });
    
    console.log(`Room ${roomId} now has ${room.clients.size} users`);
    
    // Clean up empty rooms after 1 hour
    if (room.clients.size === 0) {
      setTimeout(() => {
        if (rooms.has(roomId) && rooms.get(roomId).clients.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        }
      }, 3600000); // 1 hour
    }
  }
  
  userRooms.delete(ws);
}

function broadcastToRoom(roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const messageStr = JSON.stringify(message);
  room.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
