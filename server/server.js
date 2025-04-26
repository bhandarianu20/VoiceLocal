const WebSocket = require('ws');
const http = require('http');

// Create HTTP server
const server = http.createServer((req, res) => {
  // Add CORS headers and Content-Security-Policy headers
  res.writeHead(200, { 
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // Allow unsafe-eval for script execution, needed for WebRTC functionality
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss: *; media-src 'self' blob:"
  });
  res.end('WebSocket Server for WebRTC Signaling');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients: Map user ID to WebSocket connection
const clients = new Map();

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Generate a unique ID for this client
  const clientId = generateUniqueId();
  clients.set(clientId, ws);
  
  // Store the clientId on the WebSocket object for easy reference
  ws.clientId = clientId;
  
  // Send the client their assigned ID
  ws.send(JSON.stringify({
    type: 'assign-id',
    id: clientId
  }));
  
  // Send list of other connected users (optional feature)
  sendUserList();
  
  // Handle messages from clients
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`Received ${data.type} from ${ws.clientId}`);
      
      // Handle different message types
      switch (data.type) {
        case 'call-request':
          // Forward call request to target user, including the call type (audio/video)
          if (data.targetId && clients.has(data.targetId)) {
            // Send incoming call notification with call type information
            clients.get(data.targetId).send(JSON.stringify({
              type: 'incoming-call',
              callerId: ws.clientId,
              callType: data.callType // Relay the call type (audio/video)
            }));
          } else {
            // Target user not found, inform caller
            ws.send(JSON.stringify({
              type: 'error',
              message: 'User not found or offline'
            }));
          }
          break;
          
        case 'chat-message':
          // Forward chat message to target user
          if (data.targetId && clients.has(data.targetId)) {
            clients.get(data.targetId).send(JSON.stringify({
              type: 'chat-message',
              senderId: ws.clientId,
              text: data.text,
              timestamp: data.timestamp
            }));
            
            // Send confirmation back to sender
            ws.send(JSON.stringify({
              type: 'message-delivered',
              targetId: data.targetId,
              timestamp: data.timestamp
            }));
          } else {
            // Target user not found, inform sender
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Chat recipient not found or offline'
            }));
          }
          break;
          
        case 'offer-sdp':
          // Forward SDP offer to target user
          if (data.targetId && clients.has(data.targetId)) {
            clients.get(data.targetId).send(JSON.stringify({
              type: 'offer-sdp',
              sdp: data.sdp,
              callerId: ws.clientId
            }));
          }
          break;
          
        case 'call-accepted':
          // Inform caller that call was accepted
          if (data.targetId && clients.has(data.targetId)) {
            clients.get(data.targetId).send(JSON.stringify({
              type: 'call-accepted',
              calleeId: ws.clientId
            }));
          }
          break;
          
        case 'answer-sdp':
          // Forward SDP answer to caller
          if (data.targetId && clients.has(data.targetId)) {
            clients.get(data.targetId).send(JSON.stringify({
              type: 'answer-sdp',
              sdp: data.sdp,
              calleeId: ws.clientId
            }));
          }
          break;
          
        case 'call-rejected':
          // Inform caller that call was rejected
          if (data.targetId && clients.has(data.targetId)) {
            clients.get(data.targetId).send(JSON.stringify({
              type: 'call-rejected',
              calleeId: ws.clientId
            }));
          }
          break;
          
        case 'ice-candidate':
          // Forward ICE candidate to peer
          if (data.targetId && clients.has(data.targetId)) {
            clients.get(data.targetId).send(JSON.stringify({
              type: 'ice-candidate',
              candidate: data.candidate,
              senderId: ws.clientId
            }));
          }
          break;
          
        case 'call-end':
          // Inform peer that call has ended
          if (data.targetId && clients.has(data.targetId)) {
            clients.get(data.targetId).send(JSON.stringify({
              type: 'call-ended',
              senderId: ws.clientId
            }));
          }
          break;
      }
    } catch (e) {
      console.error('Invalid message format:', e);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`Client ${ws.clientId} disconnected`);
    // Remove client from the map
    clients.delete(ws.clientId);
    // Update user list for remaining clients
    sendUserList();
  });
  
  // Function to send updated user list to all clients
  function sendUserList() {
    const userList = Array.from(clients.keys());
    clients.forEach((clientWs, id) => {
      // Send list of all other users (exclude self)
      const otherUsers = userList.filter(userId => userId !== id);
      clientWs.send(JSON.stringify({
        type: 'user-list',
        users: otherUsers
      }));
    });
  }
});

// Generate random ID for clients
function generateUniqueId() {
  return Math.random().toString(36).substring(2, 15);
}

// Start the server
const PORT = process.env.PORT || 8081;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket server listening on all interfaces, port ${PORT}`);
  
  // Log deployment info
  console.log('Server is running in:', process.env.NODE_ENV || 'development');
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log('Deployed at:', process.env.RENDER_EXTERNAL_URL);
  } else {
    // Display all IP addresses for the host (local development only)
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    console.log('Available on these addresses:');
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // Skip over non-IPv4 and internal addresses
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`http://${net.address}:${PORT}`);
        }
      }
    }
  }
});
