# WebRTC Voice Call Application

A simple real-time voice calling application built with WebRTC and WebSockets for signaling. This project enables browser-to-browser voice communication through a peer-to-peer connection.

## Features

- Real-time voice communication using WebRTC
- WebSocket-based signaling server for connection establishment
- Simple user interface for making and receiving calls
- Microphone muting functionality
- Connection status indicators
- Peer discovery and call management

## Project Structure

```
VoiceCallFunc/
├── client/
│   ├── index.html       # Frontend HTML structure
│   ├── style.css        # CSS styling for UI elements
│   └── script.js        # Frontend JavaScript (WebRTC logic, WebSocket client)
│
├── server/
│   ├── server.js        # Node.js WebSocket Signaling Server
│   └── package.json     # Node.js dependencies (mainly 'ws')
│
└── README.md            # Project documentation
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or newer)
- Modern web browser that supports WebRTC (Chrome, Firefox, Edge, etc.)
- A Render.com account (for deployment)

### Server Setup

1. Navigate to the server directory:
   ```
   cd server
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the signaling server:
   ```
   npm start
   ```
   The server will run on port 8080 by default.

### Client Setup

1. Open the `client/index.html` file in a web browser. You can use a simple HTTP server if needed:
   ```
   cd client
   npx http-server
   ```
   Then navigate to http://localhost:8080 (or another port provided by your HTTP server) in your browser.

2. For local testing, open the client in two different browser windows or devices on the same network.

## Usage

1. When the application loads, it will automatically connect to the signaling server and request microphone access.
2. Upon successful connection, you'll be assigned a unique ID.
3. To make a call:
   - Enter the ID of the person you want to call in the input field
   - Click the "Call" button
4. When receiving a call:
   - You'll see a notification with the caller's ID
   - Click "Accept" to answer or "Reject" to decline
5. During a call:
   - Use the "Mute" button to toggle your microphone
   - Click "End Call" to terminate the connection

## Technical Details

- **WebRTC** is used for peer-to-peer audio streaming
- **WebSockets** provide the signaling mechanism for connection establishment
- The application uses Google's public STUN servers for NAT traversal
- Simple WebRTC signaling protocol:  
  - SDP offer/answer exchange
  - ICE candidate exchange
  - Call management messages (accept, reject, end)

## Limitations

- For production use, you should add TURN server support for reliable connectivity across different networks
- The current implementation focuses on voice calls only (no video or screen sharing)
- No authentication or encryption beyond what WebRTC provides by default

## Future Improvements

- Add support for video calls
- Implement screen sharing
- Add call quality indicators
- Implement persistent user accounts

## Deployment to Render

### Deploy the Signaling Server

1. Create a new account on [Render.com](https://render.com/) if you don't have one
2. From your Render dashboard, click 'New +' and select 'Web Service'
3. Connect your GitHub repository or use the 'Public Git repository' option with your repository URL
4. Configure the following settings:
   - **Name**: voice-call-server (or any name you prefer)
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan Type**: Free (or choose a paid plan for more resources)
5. Click 'Create Web Service'
6. Wait for the deployment to complete (this may take a few minutes)
7. Once deployed, Render will provide you with a URL for your service (e.g., `https://voice-call-server.onrender.com`)

### Deploy the Client Application

Your client is already being deployed to Netlify at: https://voice-call-app.windsurf.build

However, you need to update the server connection settings:

1. Open your deployed client application in a browser
2. In the Server Configuration section:
   - Enter your Render server URL (e.g., `voice-call-server.onrender.com`) without the 'https://' prefix
   - Leave port blank or enter 443 for secure WebSocket connections
3. Click 'Connect to Server'

### Using Your Deployed WebRTC Application

1. Share your client application URL (https://voice-call-app.windsurf.build) with others
2. Have them connect to the same server by entering your Render server URL
3. Once connected, users can call each other using the assigned user IDs

### Important Notes

- Always use secure connections (HTTPS/WSS) in production
- The free tier of Render may go to sleep after periods of inactivity
- For production use, consider adding TURN server support for reliable connectivity
- Add call history functionality

## License

This project is available as open source under the terms of the MIT License.
