// DOM Elements
const statusText = document.getElementById('status-text');
const statusLight = document.getElementById('status-light');
const userIdContainer = document.getElementById('id-container');
const userIdDisplay = document.getElementById('user-id');
const callControls = document.getElementById('call-controls');
const peerIdInput = document.getElementById('peer-id-input');
const callAudioBtn = document.getElementById('callAudioBtn');
const callVideoBtn = document.getElementById('callVideoBtn');
const userListContainer = document.getElementById('user-list-container');
const userList = document.getElementById('user-list');
const incomingCallContainer = document.getElementById('incoming-call');
const callerId = document.getElementById('caller-id');
const callTypeDisplay = document.getElementById('call-type');
const acceptCallBtn = document.getElementById('accept-call');
const rejectCallBtn = document.getElementById('reject-call');
const activeCallContainer = document.getElementById('active-call');
const activePeerId = document.getElementById('active-peer-id');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const videoContainer = document.querySelector('.video-container');
const muteBtn = document.getElementById('mute-btn');
const videoToggleBtn = document.getElementById('video-toggle-btn');
const endCallBtn = document.getElementById('end-call-btn');
const remoteAudio = document.getElementById('remote-audio');
const errorMessage = document.getElementById('error-message');

// Global variables
let socket;
let localStream;
let peerConnection;
let myUserId;
let currentPeerId;
let currentCallType; // 'audio' or 'video'
let isMuted = false;
let isVideoEnabled = true;
let incomingCallData = null;

// Chat related variables
let dataChannel = null;
let isDataChannelOpen = false;
let dataChannelConnecting = false; // Track if we're in the process of connecting
let dataChannelRetryCount = 0;
let MAX_DATA_CHANNEL_RETRIES = 3;

// Direct chat variables
let directChatPeerId = null;
let chatHistory = {}; // Store chat history by user ID
let unreadMessages = {}; // Track unread messages by user ID

// Default server address - will be overridden by user input
let serverAddress = 'voice-call-app.windsurf.build';
let serverPort = '';

// WebRTC configuration with STUN and TURN servers
const rtcConfig = {
    iceServers: [
        {
            urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
        },
        {
            urls: 'turn:your-turn-server.com:3478',
            username: 'your-username',
            credential: 'your-password'
        }
    ]
};

// Initialize the application
function init() {
    // Set up server config UI first
    setupServerConfig();
    
    // Set up call event listeners
    document.getElementById('callAudioBtn').addEventListener('click', () => initiateCall('audio'));
    document.getElementById('callVideoBtn').addEventListener('click', () => initiateCall('video'));
    document.getElementById('accept-call').addEventListener('click', acceptCall);
    document.getElementById('reject-call').addEventListener('click', rejectCall);
    document.getElementById('mute-btn').addEventListener('click', toggleMute);
    document.getElementById('video-toggle-btn') && document.getElementById('video-toggle-btn').addEventListener('click', toggleVideo);
    document.getElementById('end-call-btn').addEventListener('click', endCall);
    
    // Set up chat interface
    setupChatInterface();
    
    // Set up direct chat interface
    setupDirectChatInterface();
}

// Set up server configuration UI
function setupServerConfig() {
    // Check if the server-config element exists
    const serverConfigContainer = document.getElementById('server-config') || createServerConfigUI();
    
    // Try to get saved server address from localStorage
    const savedAddress = localStorage.getItem('serverAddress');
    const savedPort = localStorage.getItem('serverPort');
    
    if (savedAddress && savedPort) {
        serverAddress = savedAddress;
        serverPort = savedPort;
        document.getElementById('server-address').value = serverAddress;
        document.getElementById('server-port').value = serverPort;
        // Auto-connect if we have saved data
        connectToSignalingServer();
    }
    
    // Connect button event listener
    document.getElementById('connect-server').addEventListener('click', () => {
        serverAddress = document.getElementById('server-address').value.trim();
        serverPort = document.getElementById('server-port').value.trim();
        
        if (serverAddress && serverPort) {
            // Save to localStorage for future visits
            localStorage.setItem('serverAddress', serverAddress);
            localStorage.setItem('serverPort', serverPort);
            
            // Connect to the signaling server
            connectToSignalingServer();
        } else {
            showError('Please enter server address and port');
        }
    });
}

// Create server configuration UI if it doesn't exist in the HTML
function createServerConfigUI() {
    const container = document.createElement('div');
    container.id = 'server-config';
    container.className = 'config-panel';
    container.innerHTML = `
        <h3>Server Configuration</h3>
        <div class="form-group">
            <label for="server-address">Server Address:</label>
            <input type="text" id="server-address" placeholder="IP or hostname" value="${serverAddress}">
        </div>
        <div class="form-group">
            <label for="server-port">Server Port:</label>
            <input type="text" id="server-port" placeholder="Port" value="${serverPort}">
        </div>
        <button id="connect-server" class="btn primary-btn">Connect to Server</button>
    `;
    
    // Insert at the top of the body
    document.body.insertBefore(container, document.body.firstChild);
    return container;
}

// ======== WebSocket Connection and Handling ========

// Connect to the WebSocket signaling server
async function connectToSignalingServer() {
    try {
        // We'll request audio-only permissions initially, and request video only when needed
        try {
            // We only need audio permissions for the initial connection
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            updateStatus('connecting', 'Connecting to server...');
            
            // Create WebSocket connection using the configured address and port
            // Use secure WebSocket (wss://) if the page is loaded over HTTPS
            const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            socket = new WebSocket(`${protocol}${serverAddress}:${serverPort}`);
            
            // Set up WebSocket event handlers
            socket.onopen = handleSocketOpen;
            socket.onmessage = handleSocketMessage;
            socket.onclose = handleSocketClose;
            socket.onerror = handleSocketError;
            
        } catch (err) {
            showError(`Media access error: ${err.message}. Please ensure your microphone is connected and permissions are granted.`);
            updateStatus('error', 'Media access denied');
        }
    } catch (error) {
        showError(`Failed to connect: ${error.message}`);
        updateStatus('error', 'Connection failed');
    }
}

// Socket event handlers
function handleSocketOpen() {
    updateStatus('connected', 'Connected to server');
}

function handleSocketMessage(event) {
    try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message.type);
        
        switch (message.type) {
            case 'assign-id':
                // Store user ID and update UI
                myUserId = message.id;
                userIdDisplay.textContent = myUserId;
                userIdContainer.classList.remove('hidden');
                callControls.classList.remove('hidden');
                break;
                
            case 'user-list':
                // Update the list of available users
                displayUserList(message.users);
                break;
                
            case 'incoming-call':
                // Display incoming call notification with call type
                handleIncomingCall(message.callerId, message.callType || 'audio');
                break;
                
            case 'offer-sdp':
                // Store the SDP offer from caller
                if (incomingCallData) {
                    incomingCallData.sdp = message.sdp;
                } else {
                    incomingCallData = {
                        callerId: message.callerId,
                        sdp: message.sdp,
                        callType: 'audio' // Default if not specified
                    };
                }
                break;
                
            case 'call-accepted':
                // Call was accepted, update UI
                updateStatus('connected', 'Call connected');
                break;
                
            case 'answer-sdp':
                // Handle SDP answer from callee
                handleAnswer(message.sdp);
                break;
                
            case 'call-rejected':
                // Call was rejected, update UI
                handleCallRejected();
                break;
                
            case 'ice-candidate':
                // Handle ICE candidate
                handleIceCandidate(message.candidate);
                break;
                
            case 'call-ended':
                // Peer ended the call
                handleCallEnded(message.senderId);
                break;
                
            case 'chat-message':
                // Handle direct chat message
                handleDirectChatMessage(message.senderId, message.text, message.timestamp);
                break;
                
            case 'error':
                // Display error message
                showError(message.message);
                break;
        }
    } catch (error) {
        console.error('Error handling message:', error);
        showError('Error processing server message');
    }
}

function handleSocketClose() {
    updateStatus('idle', 'Disconnected from server');
    showError('Disconnected from signaling server');
    resetUI();
}

function handleSocketError(error) {
    showError(`WebSocket error: ${error.message}`);
    updateStatus('error', 'Server connection error');
}

// ======== WebRTC Functions ========

// Create and set up a new RTCPeerConnection
function createPeerConnection() {
    // Close any existing connection
    if (peerConnection) {
        peerConnection.close();
    }
    
    // Create a new peer connection with STUN server configuration
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    // Note: We'll add tracks in the initiateCall and acceptCall functions instead of here
    // This prevents the 'A sender already exists for the track' error
    
    // Set up event handlers for the peer connection
    
    // When ICE candidates are generated
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            // Send the ICE candidate to the peer
            sendToSignalingServer({
                type: 'ice-candidate',
                targetId: currentPeerId,
                candidate: event.candidate
            });
        }
    };
    
    // When the ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        
        if (peerConnection.iceConnectionState === 'connected' || 
            peerConnection.iceConnectionState === 'completed') {
            console.log('ICE connection established, checking data channel');
            
            // If we're the caller and data channel isn't working yet, try to create it again
            if (!currentPeerId && !isDataChannelOpen && !dataChannelConnecting && dataChannelRetryCount < MAX_DATA_CHANNEL_RETRIES) {
                createDataChannel();
            }
        } else if (peerConnection.iceConnectionState === 'disconnected' || 
            peerConnection.iceConnectionState === 'failed' || 
            peerConnection.iceConnectionState === 'closed') {
            // Connection lost, clean up
            endCall();
        }
    };
    
    // When remote streams are received
    peerConnection.ontrack = (event) => {
        console.log('Remote track received:', event.track.kind);
        console.log('Track enabled:', event.track.enabled);
        console.log('Track readyState:', event.track.readyState);
        
        if (event.streams && event.streams[0]) {
            const remoteStream = event.streams[0];
            console.log('Remote stream tracks:', remoteStream.getTracks().map(t => t.kind + ':' + t.enabled));
            
            // Always attach audio to the audio element to ensure audio works in all cases
            // Get a fresh reference to the audio element to make sure it exists
            const audioElement = document.getElementById('remote-audio');
            console.log('Audio element found:', audioElement !== null);
            
            if (audioElement) {
                audioElement.srcObject = remoteStream;
                audioElement.volume = 1.0; // Ensure volume is at maximum
                console.log('Attached remote stream to audio element');
            } else {
                console.error('Could not find audio element with ID "remote-audio"');
            }
            
            // For video calls, also attach to video element
            if (currentCallType === 'video') {
                // Show video container if hidden
                videoContainer.classList.remove('hidden');
                
                // Attach to remote video element
                remoteVideo.srcObject = remoteStream;
                console.log('Attached remote stream to video element');
                
                // Show video toggle control
                if (videoToggleBtn) {
                    videoToggleBtn.classList.remove('hidden');
                }
            } else {
                // Audio-only call
                console.log('Audio-only call, using audio element only');
                // Show the audio element more prominently for audio-only calls
                const audioElement = document.getElementById('remote-audio');
                if (audioElement) {
                    audioElement.style.display = 'block';
                    audioElement.style.width = '100%';
                    audioElement.controls = true;
                    console.log('Enhanced audio element display for audio-only call');
                }
            }
        }
    };
    
    // For the callee, listen for the datachannel
    peerConnection.ondatachannel = (event) => {
        console.log('Received data channel from peer');
        dataChannel = event.channel;
        dataChannelConnecting = false; // No longer connecting as we received it
        setupDataChannel(dataChannel);
    };
    
    return peerConnection;
}

// Function to create a data channel
function createDataChannel() {
    if (peerConnection && !dataChannel) {
        try {
            dataChannelConnecting = true;
            dataChannelRetryCount++;
            console.log(`Creating data channel (attempt ${dataChannelRetryCount})`);
            
            // Create the data channel with more specific configuration
            dataChannel = peerConnection.createDataChannel('chat', {
                ordered: true,          // Guarantee message order
                maxRetransmits: 3       // Give up after 3 retransmission attempts
            });
            
            console.log('Data channel created, state:', dataChannel.readyState);
            setupDataChannel(dataChannel);
            
            // If data channel is created but not open after 5 seconds, try again
            setTimeout(() => {
                if (dataChannel && dataChannel.readyState !== 'open' && dataChannelConnecting) {
                    console.log('Data channel failed to open after timeout');
                    dataChannelConnecting = false;
                    // The next retry will happen from the ICE connection state change handler
                }
            }, 5000);
            
        } catch (error) {
            console.error('Error creating data channel:', error);
            dataChannelConnecting = false;
        }
    }
}

// Initiate a call to a peer
async function initiateCall(callType = 'audio') {
    const targetPeerId = peerIdInput.value.trim();
    
    if (!targetPeerId) {
        showError('Please enter a peer ID to call');
        return;
    }
    
    try {
        // Store current call type
        currentCallType = callType;
        
        // Update UI to reflect calling state
        currentPeerId = targetPeerId;
        updateStatus('calling', `${callType.charAt(0).toUpperCase() + callType.slice(1)} calling ${targetPeerId}...`);
        
        // Request appropriate media based on call type
        const constraints = {
            audio: true,
            video: callType === 'video'
        };
        
        // Stop previous stream if exists
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        // Get new media stream with appropriate constraints
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Display local video if this is a video call
        if (callType === 'video' && localVideo) {
            localVideo.srcObject = localStream;
            videoContainer.classList.remove('hidden');
        }
        
        // Create peer connection
        createPeerConnection();
        
        // Add local tracks to the peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Explicitly create the data channel as the caller
        createDataChannel();
        
        // Create an offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send call request with call type to signaling server
        sendToSignalingServer({
            type: 'call-request',
            targetId: targetPeerId,
            callType: callType
        });
        
        sendToSignalingServer({
            type: 'offer-sdp',
            targetId: targetPeerId,
            sdp: offer
        });
        
        // Show the active call UI
        showActiveCall(targetPeerId);
        
    } catch (error) {        
        showError(`Error initiating call: ${error.message}`);
        updateStatus('idle', 'Ready');
        resetCall();
    }
}

// Handle incoming call notification
function handleIncomingCall(incomingCallerId, callType = 'audio') {
    // Store incoming call data
    incomingCallData = { callerId: incomingCallerId, callType: callType };
    
    // Display the incoming call notification with call type
    callerId.textContent = incomingCallerId;
    if (callTypeDisplay) {
        callTypeDisplay.textContent = callType.charAt(0).toUpperCase() + callType.slice(1);
    }
    incomingCallContainer.classList.remove('hidden');
    currentPeerId = incomingCallerId;
    
    // Update status to ringing
    updateStatus('ringing', `Incoming ${callType} call from ${incomingCallerId}`);
}

// Accept an incoming call
async function acceptCall() {
    if (!incomingCallData) {
        showError('No incoming call data available');
        return;
    }
    
    // Store the call type
    currentCallType = incomingCallData.callType || 'audio';
    
    try {
        // Request appropriate media based on call type
        const constraints = {
            audio: true,
            video: currentCallType === 'video'
        };
        
        // Stop previous stream if exists
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        // Get new media stream with appropriate constraints
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Display local video if this is a video call
        if (currentCallType === 'video' && localVideo) {
            localVideo.srcObject = localStream;
            videoContainer.classList.remove('hidden');
            videoToggleBtn.classList.remove('hidden');
        }
        
        // Create peer connection
        createPeerConnection();
        
        // Add local tracks to the peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Set the remote description (caller's offer)
        await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.sdp));
        
        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Send call accepted message
        sendToSignalingServer({
            type: 'call-accepted',
            targetId: currentPeerId
        });
        
        // Send SDP answer
        sendToSignalingServer({
            type: 'answer-sdp',
            targetId: currentPeerId,
            sdp: answer
        });
        
        // Hide incoming call notification and show active call UI
        incomingCallContainer.classList.add('hidden');
        showActiveCall(currentPeerId);
        updateStatus('connected', 'Call connected');
        
    } catch (error) {
        showError(`Error accepting call: ${error.message}`);
        resetCall();
    }
}

// Reject an incoming call
function rejectCall() {
    // Send rejection message to caller
    sendToSignalingServer({
        type: 'call-rejected',
        targetId: currentPeerId
    });
    
    // Hide notification and reset
    incomingCallContainer.classList.add('hidden');
    updateStatus('idle', 'Ready');
    
    // Clear call data
    incomingCallData = null;
    currentPeerId = null;
}

// Handle SDP answer from the callee
async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        updateStatus('connected', 'Call connected');
    } catch (error) {
        showError(`Error handling answer: ${error.message}`);
    }
}

// Handle rejected call
function handleCallRejected() {
    showError('Call was rejected');
    resetCall();
    updateStatus('idle', 'Ready');
}

// Handle ICE candidates from remote peer
async function handleIceCandidate(candidate) {
if (!peerConnection || !candidate) return;
    
try {
await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
} catch (error) {
showError(`Failed to add ICE candidate: ${error.message}`);
}
}

// Handle call end from remote peer
function handleCallEnded(peerId) {
if (peerId === currentPeerId) {
showError('Call ended by remote peer');
resetCall();
updateStatus('idle', 'Ready');
}
}

// End the current call
function endCall() {
if (!currentPeerId) return;
    
// Send call end message to peer
sendToSignalingServer({
type: 'call-end',
targetId: currentPeerId
});

// Reset call state and UI
resetCall();
updateStatus('idle', 'Ready');
}

// Toggle microphone mute state
function toggleMute() {
if (!localStream) return;
    
const audioTracks = localStream.getAudioTracks();
if (audioTracks.length === 0) return;
    
isMuted = !isMuted;
audioTracks[0].enabled = !isMuted;
    
// Update UI
muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
muteBtn.classList.toggle('muted', isMuted);
}

// Toggle video on/off
function toggleVideo() {
    if (!localStream) return;
    
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) return;
    
    isVideoEnabled = !isVideoEnabled;
    videoTracks[0].enabled = isVideoEnabled;
    
    // Update UI
    videoToggleBtn.textContent = isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera';
    videoToggleBtn.classList.toggle('video-off', !isVideoEnabled);
}

// ======== UI Functions ========

// Update the status display
function updateStatus(state, message) {
statusText.textContent = message || state;
statusLight.className = 'status-light ' + state;
}

// Display the list of available users
function displayUserList(users) {
    if (!users || users.length === 0) {
        userListContainer.classList.add('hidden');
        return;
    }
    
    // Clear current list
    userList.innerHTML = '';
    
    // Add each user to the list
    users.forEach(userId => {
        const li = document.createElement('li');
        li.className = 'user-item';
        
        const userIdSpan = document.createElement('span');
        userIdSpan.textContent = userId;
        if (unreadMessages[userId]) {
            const unreadIndicator = document.createElement('span');
            unreadIndicator.className = 'unread-indicator';
            userIdSpan.appendChild(unreadIndicator);
        }
        
        // Create button container for audio/video call buttons
        const btnContainer = document.createElement('div');
        btnContainer.className = 'call-buttons';
        
        // Create chat button
        const chatBtn = document.createElement('button');
        chatBtn.innerHTML = '<i class="fas fa-comment"></i> Chat';
        chatBtn.className = 'btn chat-btn';
        chatBtn.addEventListener('click', () => {
            openDirectChat(userId);
        });
        
        // Create audio call button
        const audioCallBtn = document.createElement('button');
        audioCallBtn.innerHTML = '<i class="fas fa-phone"></i> Audio';
        audioCallBtn.className = 'btn audio-btn';
        audioCallBtn.addEventListener('click', () => {
            peerIdInput.value = userId;
            initiateCall('audio');
        });
        
        // Create video call button
        const videoCallBtn = document.createElement('button');
        videoCallBtn.innerHTML = '<i class="fas fa-video"></i> Video';
        videoCallBtn.className = 'btn video-btn';
        videoCallBtn.addEventListener('click', () => {
            peerIdInput.value = userId;
            initiateCall('video');
        });
        
        // Add buttons to container
        btnContainer.appendChild(chatBtn);
        btnContainer.appendChild(audioCallBtn);
        btnContainer.appendChild(videoCallBtn);
        
        // Add elements to list item
        li.appendChild(userIdSpan);
        li.appendChild(btnContainer);
        userList.appendChild(li);
    });
    
    // Show the user list container
    userListContainer.classList.remove('hidden');
}

// Show the active call UI
function showActiveCall(peerId) {
    // Hide other UI components
    callControls.classList.add('hidden');
    incomingCallContainer.classList.add('hidden');
    
    // Update and show active call UI
    activePeerId.textContent = peerId;
    activeCallContainer.classList.remove('hidden');
    
    // Initially keep chat disabled until data channel is open
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-message-btn');
    
    if (chatInput) {
        chatInput.disabled = true;
    }
    if (sendButton) {
        sendButton.disabled = true;
    }

    // Clear previous messages
    document.getElementById('chat-messages').innerHTML = '';

    console.log('Chat interface prepared for active call (waiting for data channel)');
}

// Reset call state and UI
function resetCall() {
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Clear audio and video elements
    const audioElement = document.getElementById('remote-audio');
    if (audioElement) {
        audioElement.srcObject = null;
        console.log('Cleared remote audio stream');
    }
    
    if (localVideo) {
        localVideo.srcObject = null;
    }
    
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }
    
    // Hide video container
    if (videoContainer) {
        videoContainer.classList.add('hidden');
    }
    
    // Reset state variables
    currentPeerId = null;
    currentCallType = null;
    incomingCallData = null;
    isVideoEnabled = true; // Reset video state for next call
    
    // Reset UI
    resetUI();
    
    // Clear chat interface
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-input').disabled = true;
    document.getElementById('send-message-btn').disabled = true;
    isDataChannelOpen = false;
    dataChannel = null;
}

// Reset UI to initial state
function resetUI() {
// Hide components
incomingCallContainer.classList.add('hidden');
activeCallContainer.classList.add('hidden');
    
// Show call controls if connected
if (socket && socket.readyState === WebSocket.OPEN) {
callControls.classList.remove('hidden');
}
}

// Display error message
function showError(message) {
errorMessage.textContent = message;
errorMessage.classList.remove('hidden');
    
// Auto-hide after 5 seconds
setTimeout(() => {
errorMessage.classList.add('hidden');
}, 5000);
}

// Helper function to send messages to the signaling server
function sendToSignalingServer(message) {
if (socket && socket.readyState === WebSocket.OPEN) {
socket.send(JSON.stringify(message));
}
}

// Initialize the application on page load
window.addEventListener('load', init);

// Direct Chat functions

// Open direct chat with a user
function openDirectChat(peerId) {
    // Set the current direct chat peer
    directChatPeerId = peerId;
    
    // Update UI
    const directChatContainer = document.getElementById('direct-chat');
    const directChatPeerIdElement = document.getElementById('direct-chat-peer-id');
    
    directChatPeerIdElement.textContent = peerId;
    directChatContainer.classList.remove('hidden');
    
    // Clear unread indicator for this user
    if (unreadMessages[peerId]) {
        unreadMessages[peerId] = false;
        displayUserList(Array.from(document.querySelectorAll('#user-list .user-item span'))
            .map(span => span.textContent.trim()));
    }
    
    // Load and display chat history
    displayDirectChatHistory(peerId);
    
    // Focus the input field
    document.getElementById('direct-chat-input').focus();
}

// Close the direct chat window
function closeDirectChat() {
    document.getElementById('direct-chat').classList.add('hidden');
    directChatPeerId = null;
}

// Display chat history for a specific peer
function displayDirectChatHistory(peerId) {
    const messagesContainer = document.getElementById('direct-chat-messages');
    messagesContainer.innerHTML = '';
    
    if (chatHistory[peerId]) {
        chatHistory[peerId].forEach(message => {
            displayDirectMessage(
                message.text,
                message.isSent,
                message.timestamp
            );
        });
    }
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Send a direct chat message
function sendDirectChatMessage() {
    const chatInput = document.getElementById('direct-chat-input');
    const messageText = chatInput.value.trim();
    
    if (!messageText || !directChatPeerId) return; // Don't send empty messages
    
    const message = {
        text: messageText,
        timestamp: Date.now()
    };
    
    // Store in chat history
    if (!chatHistory[directChatPeerId]) {
        chatHistory[directChatPeerId] = [];
    }
    
    chatHistory[directChatPeerId].push({
        text: message.text,
        timestamp: message.timestamp,
        isSent: true
    });
    
    // Display the message in the chat window
    displayDirectMessage(message.text, true, message.timestamp);
    
    // Clear input field
    chatInput.value = '';
    
    // Send message to server
    sendToSignalingServer({
        type: 'chat-message',
        targetId: directChatPeerId,
        text: message.text,
        timestamp: message.timestamp
    });
}

// Handle incoming direct chat message
function handleDirectChatMessage(senderId, text, timestamp) {
    console.log(`Received message from ${senderId}: ${text}`);
    
    // Store in chat history
    if (!chatHistory[senderId]) {
        chatHistory[senderId] = [];
    }
    
    chatHistory[senderId].push({
        text: text,
        timestamp: timestamp,
        isSent: false
    });
    
    // If direct chat with this user is open, display the message
    if (directChatPeerId === senderId) {
        displayDirectMessage(text, false, timestamp);
    } else {
        // Mark as unread
        unreadMessages[senderId] = true;
        // Update user list to show unread indicator
        const userList = Array.from(document.querySelectorAll('#user-list .user-item span'))
            .map(span => span.textContent.trim());
        displayUserList(userList);
    }
}

// Display a message in the direct chat window
function displayDirectMessage(text, isSent, timestamp = Date.now()) {
    const messagesContainer = document.getElementById('direct-chat-messages');
    const messageElement = document.createElement('div');
    
    // Set message class based on whether it was sent or received
    messageElement.className = `message ${isSent ? 'message-sent' : 'message-received'}`;
    
    // Add sender label
    const senderElement = document.createElement('div');
    senderElement.className = 'message-sender';
    senderElement.textContent = isSent ? 'You' : directChatPeerId;
    messageElement.appendChild(senderElement);
    
    // Add message text
    const textElement = document.createElement('div');
    textElement.textContent = text;
    messageElement.appendChild(textElement);
    
    // Add timestamp
    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    timeElement.textContent = new Date(timestamp).toLocaleTimeString();
    messageElement.appendChild(timeElement);
    
    // Add to container
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Set up direct chat interface event listeners
function setupDirectChatInterface() {
    const sendButton = document.getElementById('direct-send-message-btn');
    const chatInput = document.getElementById('direct-chat-input');
    const closeButton = document.getElementById('close-direct-chat-btn');
    
    sendButton.addEventListener('click', sendDirectChatMessage);
    
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendDirectChatMessage();
        }
    });
    
    closeButton.addEventListener('click', closeDirectChat);
}

// Clean up resources when page is unloaded
// Set up data channel events and handlers
function setupDataChannel(channel) {
    if (!channel) {
        console.error('Cannot setup data channel - channel is null');
        return;
    }
    
    console.log('Setting up data channel, current state:', channel.readyState);
    
    channel.onopen = () => {
        console.log('Data channel is now open and ready for use');
        isDataChannelOpen = true;
        dataChannelConnecting = false;
        dataChannelRetryCount = 0; // Reset retry count once successfully connected
        
        // Enable the chat input once the data channel is open
        document.getElementById('chat-input').disabled = false;
        document.getElementById('send-message-btn').disabled = false;
        
        // Display a system message
        displaySystemMessage('Chat connection established. You can now send messages.');
    };
    
    channel.onclose = () => {
        console.log('Data channel has closed');
        isDataChannelOpen = false;
        
        // Disable the chat input when the data channel closes
        document.getElementById('chat-input').disabled = true;
        document.getElementById('send-message-btn').disabled = true;
        
        // Display a system message
        displaySystemMessage('Chat connection closed.');
    };
    
    channel.onmessage = (event) => {
        console.log('Received message via data channel:', event.data);
        try {
            const message = JSON.parse(event.data);
            displayMessage(message.text, false, message.timestamp);
        } catch (error) {
            console.error('Error parsing message:', error);
            // If parsing fails, just display the raw message
            displayMessage(event.data, false);
        }
    };
    
    channel.onerror = (error) => {
        console.error('Data channel error:', error);
        showError('Chat error: ' + (error.message || 'Unknown error'));
        isDataChannelOpen = false;
        dataChannelConnecting = false;
    };
}

// Send a chat message
function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const messageText = chatInput.value.trim();
    
    if (!messageText) return; // Don't send empty messages
    
    const message = {
        text: messageText,
        timestamp: Date.now()
    };
    
    // Always display the message locally
    displayMessage(messageText, true, message.timestamp);
    chatInput.value = '';
    
    // Try to send via data channel if available
    if (dataChannel && dataChannel.readyState === 'open') {
        try {
            dataChannel.send(JSON.stringify(message));
            console.log('Message sent via data channel');
        } catch (error) {
            console.error('Error sending message:', error);
            displaySystemMessage(`Error sending message: ${error.message}. Trying to reconnect...`);
            
            // If there was an error sending, try to recreate the data channel
            if (peerConnection && peerConnection.connectionState === 'connected' && 
                dataChannelRetryCount < MAX_DATA_CHANNEL_RETRIES) {
                createDataChannel();
            }
        }
    } else {
        // Check if we're in a call but data channel isn't ready
        if (peerConnection && currentPeerId) {
            console.warn('Data channel not ready, message displayed locally only');
            displaySystemMessage('Message displayed locally only - chat connection being established...');
            
            // If we're connected but data channel isn't ready, try to create it
            if (peerConnection.connectionState === 'connected' && 
                dataChannelRetryCount < MAX_DATA_CHANNEL_RETRIES) {
                createDataChannel();
            }
        } else {
            // Not in a call
            console.warn('Not in a call, message displayed locally only');
            displaySystemMessage('Message displayed locally only - not in a call');
        }
    }
}

// Display a message in the chat window
function displayMessage(text, isSent, timestamp = Date.now()) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    
    // Set message class based on whether it was sent or received
    messageElement.className = `message ${isSent ? 'message-sent' : 'message-received'}`;
    
    // Add sender label
    const senderElement = document.createElement('div');
    senderElement.className = 'message-sender';
    senderElement.textContent = isSent ? 'You' : currentPeerId;
    messageElement.appendChild(senderElement);
    
    // Add message text
    const textElement = document.createElement('div');
    textElement.textContent = text;
    messageElement.appendChild(textElement);
    
    // Add timestamp
    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    const messageDate = new Date(timestamp);
    timeElement.textContent = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageElement.appendChild(timeElement);
    
    // Add to container and scroll to bottom
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Display a system message in the chat window
function displaySystemMessage(text) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    
    // Style system messages differently
    messageElement.className = 'message message-system';
    messageElement.style.backgroundColor = '#f8f9fa';
    messageElement.style.color = '#666';
    messageElement.style.fontSize = '0.85rem';
    messageElement.style.padding = '5px 10px';
    messageElement.style.margin = '5px auto';
    messageElement.style.borderRadius = '8px';
    messageElement.style.width = 'fit-content';
    messageElement.style.maxWidth = '90%';
    messageElement.style.textAlign = 'center';
    messageElement.style.fontStyle = 'italic';
    
    // Add message text
    messageElement.textContent = text;
    
    // Add to container and scroll to bottom
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Set up event listeners for the chat interface
function setupChatInterface() {
    const sendButton = document.getElementById('send-message-btn');
    const chatInput = document.getElementById('chat-input');
    
    // Initially disable chat until data channel is open
    chatInput.disabled = true;
    sendButton.disabled = true;
    
    // Send button click handler
    sendButton.addEventListener('click', sendChatMessage);
    
    // Enter key press handler
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendChatMessage();
        }
    });
}

// Add chat interface setup to the init function
function initChat() {
    setupChatInterface();
}

window.addEventListener('beforeunload', () => {
    // Close any active call
    if (currentPeerId) {
        endCall();
    }
    
    // Close WebSocket connection
    if (socket) {
        socket.close();
    }
    
    // Stop local media streams
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
});
