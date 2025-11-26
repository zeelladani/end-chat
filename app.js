// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, onSnapshot, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAv8sLro0XRpTNLwOgqcUVPIGpiv5Extts",
  authDomain: "shadowchat-ffbd0.firebaseapp.com",
  projectId: "shadowchat-ffbd0",
  storageBucket: "shadowchat-ffbd0.firebasestorage.app",
  messagingSenderId: "912440519677",
  appId: "1:912440519677:web:3faa4355da07651337c794",
  measurementId: "G-NK7LVB0KDN"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let messaging = null;

// Vapid key for web push
const vapidKey = "BEGnjIBE1xF4qORw0xpXJgL6ZyQaSI4jmIMOBTfB2deq48JqZJlUyTR3zo-f9A0vjWXN_MpY1dJE-g--dQ3vDl8";

// DOM Elements
const loadingOverlay = document.getElementById('loading-overlay');
const landingPage = document.getElementById('landing-page');
const generateCodeBtn = document.getElementById('generate-code-btn');
const enterCodeBtn = document.getElementById('enter-code-btn');
const generatePopup = document.getElementById('generate-popup');
const enterPopup = document.getElementById('enter-popup');
const generatedCode = document.getElementById('generated-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const goToChatBtn = document.getElementById('go-to-chat-btn');
const codeInput = document.getElementById('code-input');
const joinChatBtn = document.getElementById('join-chat-btn');
const chatArea = document.getElementById('chat-area');
const endChatBtn = document.getElementById('end-chat-btn');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const closeModalBtns = document.querySelectorAll('.close-modal');
const typingIndicator = document.getElementById('typing-indicator');
const statusIndicator = document.getElementById('status-indicator');
const messageSound = document.getElementById('message-sound');
const codeDisplay = document.getElementById('code-display');
const activeCode = document.getElementById('active-code');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmEndBtn = document.getElementById('confirm-end-btn');
const cancelEndBtn = document.getElementById('cancel-end-btn');
const replyPreview = document.getElementById('reply-preview');
const replyPreviewText = document.getElementById('reply-preview-text');
const cancelReplyPreview = document.getElementById('cancel-reply-preview');
const messageActions = document.getElementById('message-actions');
const replyActionBtn = document.getElementById('reply-action-btn');
const notificationPermissionDialog = document.getElementById('notification-permission');
const allowNotificationBtn = document.getElementById('allow-notification-btn');
const denyNotificationBtn = document.getElementById('deny-notification-btn');

// App state
let currentUser = null; // 'owner' or 'participant'
let currentChatId = null;
let currentChatCode = null;
let userId = localStorage.getItem('userId') || generateUserId();
let messageListener = null;
let chatListener = null;
let statusListener = null;
let typingTimeout = null;
let idleTimeout = null;
let otherPersonId = null;
let isPageVisible = true;
let isInChatScreen = false; // Track if user is on chat screen
let replyingToMessage = null;
let touchStartX = 0;
let touchStartY = 0;
let activeMessageElement = null;
let lastTapTime = 0;
let isSwipingRight = false;
let isSwipingLeft = false;
let messageActionsVisible = false;
let selectedMessage = null;
let fcmToken = null;
let notificationPermissionState = localStorage.getItem('notificationPermission') || 'default';
let unreadMessages = 0;

// Calculate correct viewport height for mobile
function setViewportHeight() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Call on load and resize
setViewportHeight();
window.addEventListener('resize', setViewportHeight);

// Save userId to localStorage
localStorage.setItem('userId', userId);

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    checkForExistingSession();
    showLoading(false);
    
    // Set up activity tracking
    resetIdleTimer();
    
    // Initialize audio handling specifically for mobile
    initAudioForMobile();
    
    // Initialize notifications
    initializeNotifications();
});

// Initialize push notifications
function initializeNotifications() {
    // First check if the browser supports notifications
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return;
    }
    
    // Initialize Firebase Messaging
    try {
        messaging = getMessaging(app);
        
        // Handle foreground messages
        onMessage(messaging, (payload) => {
            console.log('Message received in foreground:', payload);
            
            // If the app is not visible, show a notification
            if (!isPageVisible && payload.notification) {
                const { title, body } = payload.notification;
                showBrowserNotification(title, body);
            }
        });
    } catch (e) {
        console.error('Error initializing Firebase Messaging:', e);
    }
    
    // Check if we should ask for permission
    if (Notification.permission === 'default' && notificationPermissionState === 'default') {
        // We'll ask after user interaction with the app
        setTimeout(() => {
            showNotificationPermissionDialog();
        }, 10000); // Ask after 10 seconds of app use
    } else if (Notification.permission === 'granted') {
        // Already have permission, get token
        getNotificationToken();
    }
}

// Show notification permission dialog
function showNotificationPermissionDialog() {
    showModal(notificationPermissionDialog);
}

// Get FCM token for this device
function getNotificationToken(isPWAContext = false) {
    if (!messaging) return Promise.reject('Messaging not initialized');
    
    const options = { vapidKey };
    
    // Add special options for PWA context if needed
    if (isPWAContext) {
        options.serviceWorkerRegistration = navigator.serviceWorker.ready;
    }
    
    return getToken(messaging, options)
        .then((currentToken) => {
            if (currentToken) {
                console.log('FCM Token:', currentToken);
                fcmToken = currentToken;
                
                // Save token to user's device list
                if (currentChatId) {
                    saveDeviceToken(currentToken);
                }
                
                return currentToken;
            } else {
                console.log('No registration token available. Request permission to generate one.');
                return null;
            }
        })
        .catch((err) => {
            console.error('An error occurred while retrieving token:', err);
            // In PWA context, try an alternative approach if the first one fails
            if (isPWAContext) {
                // Try using the compat version directly
                return firebase.messaging().getToken({ vapidKey });
            }
            return null;
        });
}

// Save device token to Firestore
function saveDeviceToken(token) {
    if (!currentChatId || !userId) return Promise.resolve();
    
    const tokenRef = doc(db, "chats", currentChatId, "tokens", userId);
    return setDoc(tokenRef, {
        token: token,
        lastUpdated: serverTimestamp()
    });
}

// Show browser notification
function showBrowserNotification(title, body) {
    if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: body,
            icon: 'App-Icon.png'
        });
        
        notification.onclick = function() {
            window.focus();
            this.close();
        };
    }
}

// Initialize audio for better mobile support
function initAudioForMobile() {
    // Pre-load the audio and set up for iOS
    messageSound.load();
    
    // Create a touch event handler to enable audio
    document.addEventListener('touchstart', function() {
        // Create and play a silent audio context to unlock audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const silentBuffer = audioContext.createBuffer(1, 1, 22050);
        const source = audioContext.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(audioContext.destination);
        source.start(0);
        
        // Also try to play our message sound at very low volume
        messageSound.volume = 0.01;
        messageSound.play().then(() => {
            messageSound.pause();
            messageSound.currentTime = 0;
            messageSound.volume = 1.0;
        }).catch(e => console.log("Audio pre-play failed, this is normal:", e));
        
        // Remove this listener once it's been triggered
        document.removeEventListener('touchstart', this);
    }, { once: true });
}

// Track page visibility
document.addEventListener('visibilitychange', () => {
    isPageVisible = !document.hidden;
    
    if (currentChatId) {
        if (isPageVisible) {
            updateUserStatus('active');
            // Reset unread count
            unreadMessages = 0;
        } else {
            updateUserStatus('away');
        }
    }
});

// Hide message actions when clicking outside
document.addEventListener('click', (e) => {
    if (messageActionsVisible && !e.target.closest('.message-container') && !e.target.closest('.message-actions')) {
        hideMessageActions();
    }
});

// Reply action button
replyActionBtn.addEventListener('click', () => {
    if (selectedMessage) {
        const messageId = selectedMessage.id.replace('msg-', '');
        const messageText = selectedMessage.querySelector('.message').textContent;
        setReplyToMessage(messageId, messageText);
        hideMessageActions();
    }
});

// Notification permission buttons
allowNotificationBtn.addEventListener('click', () => {
    hideModal(notificationPermissionDialog);
    
    Notification.requestPermission().then(permission => {
        notificationPermissionState = permission;
        localStorage.setItem('notificationPermission', permission);
        
        if (permission === 'granted') {
            getNotificationToken();
            showNotification("Notifications enabled", "success");
        }
    });
});

denyNotificationBtn.addEventListener('click', () => {
    hideModal(notificationPermissionDialog);
    notificationPermissionState = 'denied';
    localStorage.setItem('notificationPermission', 'denied');
});

generateCodeBtn.addEventListener('click', () => {
    showModal(generatePopup);
    generateNewCode();
});

enterCodeBtn.addEventListener('click', () => {
    showModal(enterPopup);
});

closeModalBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        hideModal(modal);
    });
});

copyCodeBtn.addEventListener('click', copyCodeToClipboard);
goToChatBtn.addEventListener('click', startChatAsOwner);
joinChatBtn.addEventListener('click', joinChatAsParticipant);

// Show confirm dialog for ending chat
endChatBtn.addEventListener('click', () => {
    showModal(confirmDialog);
});

// Confirm end chat
confirmEndBtn.addEventListener('click', () => {
    hideModal(confirmDialog);
    endChat();
});

// Cancel end chat
cancelEndBtn.addEventListener('click', () => {
    hideModal(confirmDialog);
});

// Cancel reply
cancelReplyPreview.addEventListener('click', () => {
    replyPreview.classList.add('hidden');
    replyingToMessage = null;
});

// Modified send button event listener to prevent keyboard from closing
sendBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent default behavior
    sendMessage();
    // Don't blur the input, keep keyboard open
    messageInput.focus();
});

// For non-touch devices
sendBtn.addEventListener('click', (e) => {
    if (!('ontouchstart' in window)) {
        e.preventDefault();
        sendMessage();
        messageInput.focus();
    }
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    } else {
        // Show typing indicator to other person
        updateTypingStatus(true);
    }
});

// Detect when user stops typing
messageInput.addEventListener('keyup', () => {
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        updateTypingStatus(false);
    }, 3000);
});

// Set up activity detection
document.addEventListener('mousemove', resetIdleTimer);
document.addEventListener('keypress', resetIdleTimer);
document.addEventListener('click', resetIdleTimer);
document.addEventListener('touchstart', resetIdleTimer);

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal') && 
        e.target.id !== 'confirm-dialog' && 
        e.target.id !== 'notification-permission') {
        hideModal(e.target);
    }
});

// Check for existing session on page load
function checkForExistingSession() {
    const savedChatId = localStorage.getItem('chatId');
    const savedChatCode = localStorage.getItem('chatCode');
    const savedUserType = localStorage.getItem('userType');
    
    if (savedChatId && savedUserType) {
        currentChatId = savedChatId;
        currentChatCode = savedChatCode;
        currentUser = savedUserType;
        
        // Check if the chat still exists
        getDoc(doc(db, "chats", currentChatId))
            .then((snapshot) => {
                if (snapshot.exists() && snapshot.data().status !== 'ended') {
                    // Chat exists, resume session
                    landingPage.style.display = 'none';
                    chatArea.style.display = 'flex';
                    
                    // Set chat screen active flag
                    isInChatScreen = true;
                    
                    if (currentUser === 'owner') {
                        endChatBtn.style.display = 'block';
                        activeCode.style.display = 'flex';
                        codeDisplay.textContent = currentChatCode;
                    }
                    
                    // Setup chat listeners
                    setupChatListeners();
                    
                    // Update our status
                    updateUserStatus('active');
                    
                    // If we have notification permission, save the token
                    if (Notification.permission === 'granted') {
                        getNotificationToken().then(token => {
                            if (token) saveDeviceToken(token);
                        });
                    }
                } else {
                    // Chat doesn't exist or has ended, clear session
                    clearChatSession();
                }
            })
            .catch(error => {
                console.error("Error checking existing session:", error);
                clearChatSession();
            });
    }
}

// Reset idle timer
function resetIdleTimer() {
    clearTimeout(idleTimeout);
    
    // If we were idle, update status to active
    if (document.body.classList.contains('idle')) {
        document.body.classList.remove('idle');
        updateUserStatus('active');
    }
    
    // Set new idle timer (5 minutes)
    idleTimeout = setTimeout(() => {
        document.body.classList.add('idle');
        updateUserStatus('idle');
    }, 5 * 60 * 1000);
}

// Update user status in Firebase
function updateUserStatus(status) {
    if (!currentChatId || !userId) return;
    
    const statusRef = doc(db, "chats", currentChatId, "status", userId);
    setDoc(statusRef, {
        status: status,
        lastUpdated: serverTimestamp()
    }, { merge: true }).catch(error => {
        console.error("Error updating status:", error);
    });
}

// Update typing status
function updateTypingStatus(isTyping) {
    if (!currentChatId || !userId) return;
    
    const statusRef = doc(db, "chats", currentChatId, "status", userId);
    setDoc(statusRef, {
        isTyping: isTyping,
        lastUpdated: serverTimestamp()
    }, { merge: true }).catch(error => {
        console.error("Error updating typing status:", error);
    });
}

// Clear chat session data
function clearChatSession() {
    localStorage.removeItem('chatId');
    localStorage.removeItem('chatCode');
    localStorage.removeItem('userType');
    currentChatId = null;
    currentChatCode = null;
    currentUser = null;
    otherPersonId = null;
    isInChatScreen = false;
}

// Generate a unique user ID
function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 15);
}

// Generate a random 4-digit code
function generateNewCode() {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    generatedCode.textContent = code;
    currentChatCode = code;
}

// Show/hide loading overlay
function showLoading(show = true) {
    if (show) {
        loadingOverlay.classList.add('visible');
    } else {
        loadingOverlay.classList.remove('visible');
    }
}

// Show modal
function showModal(modal) {
    modal.classList.add('show');
}

// Hide modal
function hideModal(modal) {
    modal.classList.remove('show');
}

// Copy the generated code to clipboard
function copyCodeToClipboard() {
    const code = generatedCode.textContent;
    navigator.clipboard.writeText(code)
        .then(() => {
            copyCodeBtn.innerHTML = '<i class="fas fa-check"></i>';
            showNotification("Code copied to clipboard", "success");
            setTimeout(() => {
                copyCodeBtn.innerHTML = '<i class="fas fa-copy"></i>';
            }, 2000);
        })
        .catch(() => {
            showNotification("Failed to copy code", "error");
        });
}

// Play message sound with improved mobile support
function playMessageSound() {
    // Only play sound if user is not in the chat screen or app is not visible
    if (!isInChatScreen || !isPageVisible) {
        messageSound.currentTime = 0;
        messageSound.volume = 1.0;
        
        const playPromise = messageSound.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn("Sound play failed, trying again:", error);
                // Try a different approach on error
                setTimeout(() => {
                    messageSound.play().catch(e => console.error("Retry failed:", e));
                }, 100);
            });
        }
    }
}

// Simple encryption/decryption
function encryptMessage(message) {
    return btoa(encodeURIComponent(message)); // Simple base64 encoding
}

function decryptMessage(encrypted) {
    try {
        return decodeURIComponent(atob(encrypted));
    } catch (e) {
        console.error("Decryption error:", e);
        return "Message could not be decrypted";
    }
}

// Send notification to the other person
function sendNotificationToOther(messageText) {
    if (!otherPersonId || !currentChatId) return Promise.resolve();
    
    // Get the other person's token
    return getDoc(doc(db, "chats", currentChatId, "tokens", otherPersonId))
        .then(snapshot => {
            if (snapshot.exists() && snapshot.data().token) {
                const token = snapshot.data().token;
                
                // We would typically call a cloud function here to send the actual notification
                // For now, we'll just log it - in a real app, you'd implement a cloud function
                console.log(`Would send notification to token ${token} with message "${messageText}"`);
                
                // In a real implementation, you'd call your Firebase Cloud Function like:
                // return fetch('https://your-cloud-function-url', {
                //     method: 'POST',
                //     headers: { 'Content-Type': 'application/json' },
                //     body: JSON.stringify({
                //         token: token,
                //         title: 'New message in EndChat',
                //         body: messageText
                //     })
                // });
            }
            return Promise.resolve();
        });
}

// Start chat as the owner
function startChatAsOwner() {
    showLoading(true);
    
    // Create a simple data structure
    const chatData = {
        code: currentChatCode,
        owner: userId,
        participants: [userId],
        status: 'active',
        created: serverTimestamp()
    };
    
    // Create a new chat document with auto-generated ID
    addDoc(collection(db, "chats"), chatData)
        .then(docRef => {
            currentChatId = docRef.id;
            currentUser = 'owner';
            
            console.log("Chat created with ID:", currentChatId);
            
            // Save to localStorage
            localStorage.setItem('chatId', currentChatId);
            localStorage.setItem('chatCode', currentChatCode);
            localStorage.setItem('userType', 'owner');
            
            // Set initial status
            return setDoc(doc(db, "chats", currentChatId, "status", userId), {
                status: 'active',
                isTyping: false,
                lastUpdated: serverTimestamp()
            });
        })
        .then(() => {
            // If we have notification permission, save the token
            if (Notification.permission === 'granted') {
                return getNotificationToken().then(token => {
                    if (token) return saveDeviceToken(token);
                    return Promise.resolve();
                });
            }
            return Promise.resolve();
        })
        .then(() => {
            // Show chat interface
            hideModal(generatePopup);
            landingPage.style.display = 'none';
            chatArea.style.display = 'flex';
            endChatBtn.style.display = 'block';
            activeCode.style.display = 'flex';
            codeDisplay.textContent = currentChatCode;
            
            // Set chat screen active flag
            isInChatScreen = true;
            
            // Setup chat listeners
            setupChatListeners();
            
            showLoading(false);
        })
        .catch(error => {
            console.error("Error starting chat:", error);
            showNotification("Error starting chat. Please try again.", "error");
            showLoading(false);
        });
}

// Join chat as a participant
function joinChatAsParticipant() {
    const code = codeInput.value.trim();
    if (code.length !== 4 || isNaN(parseInt(code))) {
        showNotification("Please enter a valid 4-digit code", "error");
        return;
    }
    
    showLoading(true);
    
    // Query for the chat with this code
    const q = query(collection(db, "chats"), where("code", "==", code), where("status", "==", "active"));
    
    getDocs(q)
        .then(querySnapshot => {
            if (querySnapshot.empty) {
                showNotification("Chat not found. Check the code and try again.", "error");
                showLoading(false);
                return Promise.reject("Chat not found");
            }
            
            // Use the first matching document
            const chatDoc = querySnapshot.docs[0];
            const chatData = chatDoc.data();
            
            currentChatId = chatDoc.id;
            currentChatCode = code;
            currentUser = 'participant';
            
            console.log("Joining chat with ID:", currentChatId);
            
            // Check if chat is full
            if (chatData.participants && chatData.participants.length >= 2 && !chatData.participants.includes(userId)) {
                showNotification("This chat is already full", "error");
                showLoading(false);
                return Promise.reject("Chat is full");
            }
            
            // Add this user to participants if not already there
            if (!chatData.participants.includes(userId)) {
                return updateDoc(doc(db, "chats", currentChatId), {
                    participants: [...chatData.participants, userId]
                });
            }
            
            return Promise.resolve();
        })
        .then(() => {
            // Set status for this user
            return setDoc(doc(db, "chats", currentChatId, "status", userId), {
                status: 'active',
                isTyping: false,
                lastUpdated: serverTimestamp()
            });
        })
        .then(() => {
            // If we have notification permission, save the token
            if (Notification.permission === 'granted') {
                return getNotificationToken().then(token => {
                    if (token) return saveDeviceToken(token);
                    return Promise.resolve();
                });
            }
            return Promise.resolve();
        })
        .then(() => {
            // Save to localStorage
            localStorage.setItem('chatId', currentChatId);
            localStorage.setItem('chatCode', currentChatCode);
            localStorage.setItem('userType', 'participant');
            
            // Show chat interface
            hideModal(enterPopup);
            landingPage.style.display = 'none';
            chatArea.style.display = 'flex';
            
            // Set chat screen active flag
            isInChatScreen = true;
            
            // Setup chat listeners
            setupChatListeners();
            
            showLoading(false);
        })
        .catch(error => {
            if (error === "Chat not found" || error === "Chat is full") {
                // Already handled
                return;
            }
            console.error("Error joining chat:", error);
            showNotification("Error joining chat. Please try again.", "error");
            showLoading(false);
        });
}

// Setup chat listeners
function setupChatListeners() {
    const chatDocRef = doc(db, "chats", currentChatId);
    
    // Listen for chat status changes
    chatListener = onSnapshot(chatDocRef, (snapshot) => {
        if (!snapshot.exists() || snapshot.data().status === 'ended') {
            showNotification("Chat has been ended", "info");
            cleanupChat();
            setTimeout(() => {
                window.location.reload();
            }, 2000);
            return;
        }
        
        // Update other person ID if needed
        const participants = snapshot.data().participants;
        if (participants && participants.length === 2) {
            otherPersonId = participants.find(id => id !== userId);
            
            // Start listening for other person's status
            if (otherPersonId) {
                setupStatusListener();
            }
        }
    }, error => {
        console.error("Chat listener error:", error);
    });
    
    // Listen for messages
    const messagesQuery = query(
        collection(db, "chats", currentChatId, "messages"),
        orderBy("timestamp", "asc")
    );
    
    messageListener = onSnapshot(messagesQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const messageData = change.doc.data();
            const messageId = change.doc.id;
            
            if (change.type === "added") {
                displayMessage(messageData, messageId);
                
                // If message is from other person
                if (messageData.sender !== userId) {
                    // Play sound if user is not actively on the chat screen
                    playMessageSound();
                    
                    // If app is not visible, show notification and increment unread count
                    if (!isPageVisible || !isInChatScreen) {
                        unreadMessages++;
                        
                        // Get the decrypted message text
                        const decryptedText = decryptMessage(messageData.text);
                        
                        // Show browser notification if permission granted
                        if (Notification.permission === 'granted') {
                            showBrowserNotification('New message in EndChat', decryptedText);
                        }
                    }
                }
            }
        });
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, error => {
        console.error("Messages listener error:", error);
    });
    
    // Set up message container touch events for reply feature
    setupMessageTouchEvents();
    
    // Set up message container click events for desktop
    setupMessageClickEvents();
}

// Set up message click events for desktop
function setupMessageClickEvents() {
    // Add click listener to messages container
    messagesContainer.addEventListener('click', handleMessageClick);
}

function handleMessageClick(e) {
    // Only handle if clicking a message
    const messageContainer = e.target.closest('.message-container');
    if (!messageContainer) return;
    
    // Show the action menu for this message
    selectedMessage = messageContainer;
    showMessageActions(e.clientX, e.clientY);
    
    // Add ripple effect for visual feedback
    createRippleEffect(e);
}

// Create ripple effect on message click
function createRippleEffect(e) {
    const messageEl = e.target.closest('.message');
    if (!messageEl) return;
    
    // Create ripple element
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');
    messageEl.appendChild(ripple);
    
    // Calculate position relative to the message
    const rect = messageEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Set position and size
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    
    // Remove after animation completes
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Show message actions menu
function showMessageActions(x, y) {
    // Position the menu near where clicked, but make sure it's within viewport
    const menuWidth = 120;
    const menuHeight = 40;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Calculate position, keeping menu within viewport
    let menuX = Math.min(x, windowWidth - menuWidth - 10);
    let menuY = Math.min(y, windowHeight - menuHeight - 10);
    
    // Position the menu
    messageActions.style.left = menuX + 'px';
    messageActions.style.top = menuY + 'px';
    
    // Show the menu
    messageActions.style.display = 'block';
    messageActionsVisible = true;
}

// Hide message actions menu
function hideMessageActions() {
    messageActions.style.display = 'none';
    messageActionsVisible = false;
    selectedMessage = null;
}

// Set up touch events for reply feature
function setupMessageTouchEvents() {
    // Remove any existing listeners first
    messagesContainer.removeEventListener('touchstart', handleTouchStart);
    messagesContainer.removeEventListener('touchmove', handleTouchMove);
    messagesContainer.removeEventListener('touchend', handleTouchEnd);
    
    // Add new listeners
    messagesContainer.addEventListener('touchstart', handleTouchStart);
    messagesContainer.addEventListener('touchmove', handleTouchMove);
    messagesContainer.addEventListener('touchend', handleTouchEnd);
}

function handleTouchStart(e) {
    // Only handle if touching a message
    if (!e.target.closest('.message')) return;
    
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    
    // Store the message element we're touching
    activeMessageElement = e.target.closest('.message-container');
    
    // Reset swipe direction flags
    isSwipingRight = false;
    isSwipingLeft = false;
    
    // Detect double tap
    const now = Date.now();
    const timeSince = now - lastTapTime;
    
    if (timeSince < 300 && timeSince > 0) {
        // Double tap detected
        e.preventDefault();
        handleDoubleTap(e);
    }
    
    lastTapTime = now;
}

function handleDoubleTap(e) {
    // Show reply actions for this message
    selectedMessage = activeMessageElement;
    
    // Get tap coordinates for positioning the menu
    const touch = e.touches[0];
    showMessageActions(touch.clientX, touch.clientY);
}

function handleTouchMove(e) {
    if (!activeMessageElement) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    // If mostly horizontal swipe (to reduce accidental swipes when scrolling)
    if (Math.abs(deltaX) > Math.abs(deltaY) * 2) {
        const messageEl = activeMessageElement.querySelector('.message');
        
        // Right swipe (for reply on received messages)
        if (deltaX > 20 && activeMessageElement.classList.contains('received')) {
            messageEl.classList.add('swiping-right');
            isSwipingRight = true;
            e.preventDefault(); // Prevent scrolling
        }
        // Left swipe (for reply on sent messages)
        else if (deltaX < -20 && activeMessageElement.classList.contains('sent')) {
            messageEl.classList.add('swiping-left');
            isSwipingLeft = true;
            e.preventDefault(); // Prevent scrolling
        }
    }
}

function handleTouchEnd(e) {
    if (!activeMessageElement) return;
    
    const messageEl = activeMessageElement.querySelector('.message');
    
    // If we were swiping, handle reply
    if (isSwipingRight || isSwipingLeft) {
        // Get message data
        const messageId = activeMessageElement.id.replace('msg-', '');
        const messageText = messageEl.textContent;
        
        // Set up reply
        setReplyToMessage(messageId, messageText);
    }
    
    // Remove swiping classes
    if (messageEl) {
        messageEl.classList.remove('swiping-right');
        messageEl.classList.remove('swiping-left');
    }
    
    // Reset
    activeMessageElement = null;
    isSwipingRight = false;
    isSwipingLeft = false;
}

// Set up reply to message
function setReplyToMessage(messageId, messageText) {
    replyingToMessage = messageId;
    replyPreviewText.textContent = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;
    replyPreview.classList.remove('hidden');
    messageInput.focus();
}

// Set up status listener for the other person
function setupStatusListener() {
    if (!otherPersonId) return;
    
    const statusDocRef = doc(db, "chats", currentChatId, "status", otherPersonId);
    
    statusListener = onSnapshot(statusDocRef, (snapshot) => {
        if (snapshot.exists()) {
            const statusData = snapshot.data();
            
            // Update typing indicator
            if (statusData.isTyping) {
                typingIndicator.style.display = 'block';
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            } else {
                typingIndicator.style.display = 'none';
            }
            
            // Update status indicator
            updateStatusIndicator(statusData.status || 'offline');
        }
    }, error => {
        console.error("Status listener error:", error);
    });
}

// Update status indicator
function updateStatusIndicator(status) {
    const statusDot = statusIndicator.querySelector('.status-dot');
    const statusText = statusIndicator.querySelector('span:last-child');
    
    // Remove all status classes
    statusDot.classList.remove('online', 'idle', 'away', 'offline');
    
    // Add appropriate class and text
    switch(status) {
        case 'active':
            statusDot.classList.add('online');
            statusText.textContent = 'Online';
            break;
        case 'idle':
            statusDot.classList.add('idle');
            statusText.textContent = 'Away';
            break;
        case 'away':
            statusDot.classList.add('away');
            statusText.textContent = 'Away';
            break;
        default:
            statusDot.classList.add('offline');
            statusText.textContent = 'Offline';
    }
}

// Clean up listeners
function cleanupListeners() {
    if (messageListener) {
        messageListener();
        messageListener = null;
    }
    
    if (chatListener) {
        chatListener();
        chatListener = null;
    }
    
    if (statusListener) {
        statusListener();
        statusListener = null;
    }
    
    // Remove message interaction listeners
    messagesContainer.removeEventListener('touchstart', handleTouchStart);
    messagesContainer.removeEventListener('touchmove', handleTouchMove);
    messagesContainer.removeEventListener('touchend', handleTouchEnd);
    messagesContainer.removeEventListener('click', handleMessageClick);
}

// Send a message
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    // Get any reply data
    const replyData = replyingToMessage ? { replyTo: replyingToMessage } : null;
    
    // Encrypt the message
    const encryptedMessage = encryptMessage(message);
    
    // Clear input immediately
    const oldMessage = messageInput.value;
    messageInput.value = '';
    
    // Hide reply preview
    if (replyingToMessage) {
        replyPreview.classList.add('hidden');
    }
    
    // Add message to Firestore
    addDoc(collection(db, "chats", currentChatId, "messages"), {
        text: encryptedMessage,
        sender: userId,
        timestamp: serverTimestamp(),
        ...(replyData ? { replyTo: replyData.replyTo } : {})
    })
    .then(() => {
        // Reset reply state
        replyingToMessage = null;
        updateTypingStatus(false);
        
        // Send notification to the other person if they're not active
        return sendNotificationToOther(message);
    })
    .then(() => {
        // Keep focus on the input field
        messageInput.focus();
    })
    .catch(error => {
        console.error("Error sending message:", error);
        showNotification("Failed to send message", "error");
        // Restore the message if sending failed
        messageInput.value = oldMessage;
    });
}

// Format timestamp for display - improved for consistent formatting
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    // Format time as hours:minutes AM/PM with consistent appearance
    return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

// Display a message in the chat with consistent timestamp
function displayMessage(message, messageId) {
    const isOwn = message.sender === userId;
    
    // Check if message already exists
    if (document.getElementById(`msg-${messageId}`)) {
        return;
    }
    
    // Create container for message and timestamp
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message-container');
    messageContainer.classList.add(isOwn ? 'sent' : 'received');
    messageContainer.id = `msg-${messageId}`;
    
    // If this is a reply message, add the replied-to message preview
    if (message.replyTo) {
        const repliedMessage = document.getElementById(`msg-${message.replyTo}`);
        if (repliedMessage) {
            const replyContainer = document.createElement('div');
            replyContainer.classList.add('message-reply-container');
            const replyText = repliedMessage.querySelector('.message').textContent;
            replyContainer.textContent = replyText.length > 30 ? replyText.substring(0, 30) + '...' : replyText;
            messageContainer.appendChild(replyContainer);
        }
    }
    
    // Create the message element
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(isOwn ? 'message-sent' : 'message-received');
    if (message.replyTo) {
        messageElement.classList.add('with-reply');
    }
    
    // Decrypt the message
    const decryptedText = decryptMessage(message.text);
    
    // Set the message content
    messageElement.textContent = decryptedText;
    
    // Create timestamp element with just the time
    const timestampElement = document.createElement('div');
    timestampElement.classList.add('message-timestamp');
    timestampElement.textContent = formatTimestamp(message.timestamp);
    
    // Add elements to the container
    messageContainer.appendChild(messageElement);
    messageContainer.appendChild(timestampElement);
    
    // Add to messages container
    messagesContainer.appendChild(messageContainer);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// COMPLETELY REVISED end chat function that uses the REST API directly for deletion
function endChat() {
    if (currentUser !== 'owner') return;
    
    showLoading(true);
    showNotification("Ending chat...", "info");
    
    // First, mark chat as ended to trigger notification for the other user
    updateDoc(doc(db, "chats", currentChatId), {
        status: 'ended'
    }).then(() => {
        // Detach listeners before deleting data
        cleanupListeners();
        
        // Wait a moment to ensure the 'ended' status is propagated
        setTimeout(() => {
            // Simply clean up the UI side first
            clearChatSession();
            showNotification("Chat ended successfully", "success");
            
            // Then redirect
            setTimeout(() => {
                window.location.reload();
            }, 1500);
            
            // In the background, try to delete the chat data using fetch
            // (this is more reliable than using Firestore SDK for deletions)
            const projectId = firebaseConfig.projectId;
            const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
            
            // Delete the chat document
            fetch(`${baseUrl}/chats/${currentChatId}`, { method: 'DELETE' })
                .then(() => console.log("Chat document deleted"))
                .catch(err => console.error("Error deleting chat document:", err));
            
            // Note: Since we are redirecting anyway, we don't need to wait for these
            // delete operations to complete.
        }, 500);
    }).catch(error => {
        console.error("Error ending chat:", error);
        showNotification("Failed to end chat. Please try again.", "error");
        showLoading(false);
    });
}

// Cleanup chat
function cleanupChat() {
    cleanupListeners();
    clearChatSession();
    showLoading(false);
}

// Show notification
function showNotification(message, type = "info") {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Handle browser navigation
window.addEventListener('popstate', function() {
    // If user navigates away from chat screen using browser back button
    if (currentChatId && isInChatScreen) {
        isInChatScreen = false;
    }
});

// This function would be called when navigating to other screens within the app
function navigateAwayFromChat() {
    isInChatScreen = false;
}

// This function would be called when returning to the chat screen
function navigateToChat() {
    isInChatScreen = true;
    // Reset unread count
    unreadMessages = 0;
}

// Check if running as installed PWA
const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
              window.navigator.standalone || 
              document.referrer.includes('android-app://');

if (isPWA) {
    console.log('Running as installed PWA');
    // Different handling for installed PWA mode
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            // Force update the service worker to ensure latest version
            registration.update();
            
            // Use compatibility version for installed PWA context
            messaging = firebase.messaging();
            messaging.useServiceWorker(registration);
            
            // Re-request permission if needed
            if (Notification.permission === 'granted') {
                getNotificationToken(true); // Pass true to indicate PWA context
            } else if (Notification.permission === 'default') {
                setTimeout(() => {
                    showNotificationPermissionDialog();
                }, 3000); // Ask sooner in PWA context
            }
        });
    }
}
