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

// Default server address - will be overridden by user input
let serverAddress = 'localhost';
let serverPort = '8081';

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
        if (peerConnection.iceConnectionState === 'disconnected' || 
            peerConnection.iceConnectionState === 'failed' || 
            peerConnection.iceConnectionState === 'closed') {
            // Connection lost, clean up
            endCall();
        }
    };
    
    // When remote streams are received
    peerConnection.ontrack = (event) => {
        console.log('Remote track received:', event.track.kind);
        if (event.streams && event.streams[0]) {
            const remoteStream = event.streams[0];
            
            // If this is a video call, attach to video element, otherwise to audio element
            if (currentCallType === 'video') {
                // Show video container if hidden
                videoContainer.classList.remove('hidden');
                
                // Attach to remote video element
                remoteVideo.srcObject = remoteStream;
                
                // Show video toggle control
                if (videoToggleBtn) {
                    videoToggleBtn.classList.remove('hidden');
                }
            } else {
                // Audio-only call
                remoteAudio.srcObject = remoteStream;
            }
        }
    };
    
    return peerConnection;
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
        
        // Create button container for audio/video call buttons
        const btnContainer = document.createElement('div');
        btnContainer.className = 'call-buttons';
        
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
}

// Reset call state and UI
function resetCall() {
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Clear audio and video elements
    remoteAudio.srcObject = null;
    
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

// Clean up resources when page is unloaded
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
