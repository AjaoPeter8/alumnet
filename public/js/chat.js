// AlumNet Chat System with Auto-Increment Message ID Support
class ChatSystem {
  constructor() {
    this.socket = null;
    this.currentReceiver = null;
    this.currentUser = null;
    this.messages = new Map(); // Store messages by receiver ID
    this.typingTimeout = null;
    this.isTyping = false;
    
    this.init();
  }
  
  async init() {
    try {
      // Get user data from the page
      this.currentUser = {
        id: window.user_id,
        username: window.user
      };
      
      // Initialize Socket.IO connection
      this.initSocket();
      
      // Set up event listeners
      this.setupEventListeners();
      
      console.log('Chat system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize chat system:', error);
    }
  }
  
  initSocket() {
    // Connect to Socket.IO server
    this.socket = io('http://localhost:3000', {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });
    
    this.socket.on('connect', () => {
      console.log('Connected to chat server');
      this.socket.emit('user_online');
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from chat server');
    });
    
    // Listen for new messages
    this.socket.on('new_message', (messageData) => {
      this.handleNewMessage(messageData);
    });
    
    // Listen for typing indicators
    this.socket.on('user_typing', (data) => {
      this.showTypingIndicator(data.username);
    });
    
    this.socket.on('user_stopped_typing', (data) => {
      this.hideTypingIndicator();
    });
    
    // Listen for user status changes
    this.socket.on('user_status_change', (data) => {
      this.updateUserStatus(data.userId, data.status);
    });
    
    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.showNotification('Connection error: ' + error.message, 'error');
    });
  }
  
  setupEventListeners() {
    // Contact list click handlers
    document.addEventListener('click', (e) => {
      if (e.target.closest('.contact-item')) {
        const contactItem = e.target.closest('.contact-item');
        const userId = contactItem.dataset.userId;
        const username = contactItem.dataset.username;
        this.selectContact(userId, username);
      }
    });
    
    // Message form submission
    const messageForm = document.getElementById('messageForm');
    if (messageForm) {
      messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.sendMessage();
      });
    }
    
    // Message input typing detection
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.addEventListener('input', () => {
        this.handleTyping();
      });
      
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }
    
    // Mobile sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        this.toggleSidebar();
      });
    }
  }
  
  async selectContact(userId, username) {\n    this.currentReceiver = { id: userId, username };\n    \n    // Update UI to show selected contact\n    document.querySelectorAll('.contact-item').forEach(item => {\n      item.classList.remove('active');\n    });\n    \n    const selectedContact = document.querySelector(`[data-user-id=\"${userId}\"]`);\n    if (selectedContact) {\n      selectedContact.classList.add('active');\n    }\n    \n    // Update chat header\n    this.updateChatHeader(username);\n    \n    // Load messages for this contact\n    await this.loadMessages(userId);\n    \n    // Mark messages as read\n    await this.markMessagesAsRead(userId);\n    \n    // Show chat area on mobile\n    this.showChatArea();\n  }\n  \n  async loadMessages(receiverId) {\n    try {\n      const response = await fetch(`/api/messages/${receiverId}`, {\n        headers: {\n          'Authorization': `Bearer ${this.getAuthToken()}`\n        }\n      });\n      \n      if (!response.ok) {\n        throw new Error('Failed to load messages');\n      }\n      \n      const data = await response.json();\n      \n      if (data.success) {\n        this.messages.set(receiverId, data.messages);\n        this.displayMessages(data.messages);\n      }\n    } catch (error) {\n      console.error('Error loading messages:', error);\n      this.showNotification('Failed to load messages', 'error');\n    }\n  }\n  \n  displayMessages(messages) {\n    const messagesContainer = document.getElementById('messagesContainer');\n    if (!messagesContainer) return;\n    \n    messagesContainer.innerHTML = '';\n    \n    messages.forEach(message => {\n      const messageElement = this.createMessageElement(message);\n      messagesContainer.appendChild(messageElement);\n    });\n    \n    // Scroll to bottom\n    this.scrollToBottom();\n  }\n  \n  createMessageElement(message) {\n    const messageDiv = document.createElement('div');\n    const isOwnMessage = message.sender_id === this.currentUser.id;\n    \n    messageDiv.className = `message ${isOwnMessage ? 'message-sent' : 'message-received'} mb-4`;\n    \n    const time = new Date(message.timestamp).toLocaleTimeString([], {\n      hour: '2-digit',\n      minute: '2-digit'\n    });\n    \n    messageDiv.innerHTML = `\n      <div class=\"${isOwnMessage ? 'ml-auto max-w-xs lg:max-w-md' : 'mr-auto max-w-xs lg:max-w-md'}\">\n        <div class=\"${isOwnMessage ? 'message-sent' : 'message-received'} px-4 py-2 rounded-lg\">\n          <p class=\"text-sm\">${this.escapeHtml(message.content)}</p>\n        </div>\n        <div class=\"${isOwnMessage ? 'text-right' : 'text-left'} mt-1\">\n          <span class=\"text-xs text-gray-500\">${time}</span>\n        </div>\n      </div>\n    `;\n    \n    return messageDiv;\n  }\n  \n  async sendMessage() {\n    const messageInput = document.getElementById('messageInput');\n    if (!messageInput || !this.currentReceiver) return;\n    \n    const content = messageInput.value.trim();\n    if (!content) return;\n    \n    try {\n      // Send via Socket.IO for real-time delivery\n      this.socket.emit('send_message', {\n        receiverId: this.currentReceiver.id,\n        content: content\n      });\n      \n      // Clear input\n      messageInput.value = '';\n      \n      // Stop typing indicator\n      this.stopTyping();\n      \n    } catch (error) {\n      console.error('Error sending message:', error);\n      this.showNotification('Failed to send message', 'error');\n    }\n  }\n  \n  handleNewMessage(messageData) {\n    // Add message to local storage\n    const receiverId = messageData.sender_id === this.currentUser.id \n      ? messageData.receiver_id \n      : messageData.sender_id;\n    \n    if (!this.messages.has(receiverId)) {\n      this.messages.set(receiverId, []);\n    }\n    \n    this.messages.get(receiverId).push(messageData);\n    \n    // If this message is for the current conversation, display it\n    if (this.currentReceiver && \n        (messageData.sender_id === this.currentReceiver.id || \n         messageData.receiver_id === this.currentReceiver.id)) {\n      \n      const messageElement = this.createMessageElement(messageData);\n      const messagesContainer = document.getElementById('messagesContainer');\n      \n      if (messagesContainer) {\n        messagesContainer.appendChild(messageElement);\n        this.scrollToBottom();\n      }\n      \n      // Mark as read if it's from the current receiver\n      if (messageData.sender_id === this.currentReceiver.id) {\n        this.markMessagesAsRead(this.currentReceiver.id);\n      }\n    }\n    \n    // Update contact list with new message indicator\n    this.updateContactList(messageData);\n    \n    // Show notification if not in current conversation\n    if (!this.currentReceiver || messageData.sender_id !== this.currentReceiver.id) {\n      this.showNotification(`New message from ${messageData.sender_username}`, 'info');\n    }\n  }\n  \n  handleTyping() {\n    if (!this.currentReceiver) return;\n    \n    if (!this.isTyping) {\n      this.isTyping = true;\n      this.socket.emit('typing_start', { receiverId: this.currentReceiver.id });\n    }\n    \n    // Clear existing timeout\n    clearTimeout(this.typingTimeout);\n    \n    // Set new timeout to stop typing indicator\n    this.typingTimeout = setTimeout(() => {\n      this.stopTyping();\n    }, 1000);\n  }\n  \n  stopTyping() {\n    if (this.isTyping && this.currentReceiver) {\n      this.isTyping = false;\n      this.socket.emit('typing_stop', { receiverId: this.currentReceiver.id });\n    }\n  }\n  \n  showTypingIndicator(username) {\n    const typingIndicator = document.getElementById('typingIndicator');\n    if (typingIndicator) {\n      typingIndicator.innerHTML = `\n        <div class=\"flex items-center space-x-2 text-gray-500 text-sm\">\n          <div class=\"flex space-x-1\">\n            <div class=\"typing-dot\"></div>\n            <div class=\"typing-dot\"></div>\n            <div class=\"typing-dot\"></div>\n          </div>\n          <span>${username} is typing...</span>\n        </div>\n      `;\n      typingIndicator.classList.remove('hidden');\n    }\n  }\n  \n  hideTypingIndicator() {\n    const typingIndicator = document.getElementById('typingIndicator');\n    if (typingIndicator) {\n      typingIndicator.classList.add('hidden');\n    }\n  }\n  \n  async markMessagesAsRead(senderId) {\n    try {\n      await fetch('/api/messages/mark-read', {\n        method: 'POST',\n        headers: {\n          'Content-Type': 'application/json',\n          'Authorization': `Bearer ${this.getAuthToken()}`\n        },\n        body: JSON.stringify({ senderId })\n      });\n    } catch (error) {\n      console.error('Error marking messages as read:', error);\n    }\n  }\n  \n  updateChatHeader(username) {\n    const chatHeader = document.getElementById('chatHeader');\n    if (chatHeader) {\n      chatHeader.innerHTML = `\n        <div class=\"flex items-center space-x-3\">\n          <button id=\"backButton\" class=\"md:hidden text-gray-600 hover:text-gray-800\">\n            <svg class=\"w-6 h-6\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">\n              <path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M15 19l-7-7 7-7\"></path>\n            </svg>\n          </button>\n          <div class=\"w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center\">\n            <span class=\"text-white font-semibold text-sm\">${username.charAt(0).toUpperCase()}</span>\n          </div>\n          <div>\n            <h3 class=\"font-semibold text-gray-900\">${username}</h3>\n            <p class=\"text-sm text-gray-500\">Online</p>\n          </div>\n        </div>\n      `;\n      \n      // Add back button functionality\n      const backButton = document.getElementById('backButton');\n      if (backButton) {\n        backButton.addEventListener('click', () => {\n          this.showSidebar();\n        });\n      }\n    }\n  }\n  \n  updateContactList(messageData) {\n    // Update the contact list to show new message indicators\n    // This would typically update unread count badges\n  }\n  \n  updateUserStatus(userId, status) {\n    const contactElement = document.querySelector(`[data-user-id=\"${userId}\"]`);\n    if (contactElement) {\n      const statusIndicator = contactElement.querySelector('.status-indicator');\n      if (statusIndicator) {\n        statusIndicator.className = `status-indicator w-3 h-3 rounded-full ${\n          status === 'online' ? 'bg-green-400' : 'bg-gray-400'\n        }`;\n      }\n    }\n  }\n  \n  scrollToBottom() {\n    const messagesContainer = document.getElementById('messagesContainer');\n    if (messagesContainer) {\n      messagesContainer.scrollTop = messagesContainer.scrollHeight;\n    }\n  }\n  \n  toggleSidebar() {\n    const sidebar = document.getElementById('sidebar');\n    if (sidebar) {\n      sidebar.classList.toggle('-translate-x-full');\n    }\n  }\n  \n  showSidebar() {\n    const sidebar = document.getElementById('sidebar');\n    const chatArea = document.getElementById('chatArea');\n    \n    if (sidebar) sidebar.classList.remove('-translate-x-full');\n    if (chatArea) chatArea.classList.add('hidden', 'md:block');\n  }\n  \n  showChatArea() {\n    const sidebar = document.getElementById('sidebar');\n    const chatArea = document.getElementById('chatArea');\n    \n    if (window.innerWidth < 768) {\n      if (sidebar) sidebar.classList.add('-translate-x-full');\n      if (chatArea) chatArea.classList.remove('hidden');\n    }\n  }\n  \n  showNotification(message, type = 'info') {\n    // Create notification element\n    const notification = document.createElement('div');\n    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${\n      type === 'error' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'\n    }`;\n    notification.textContent = message;\n    \n    document.body.appendChild(notification);\n    \n    // Remove after 3 seconds\n    setTimeout(() => {\n      notification.remove();\n    }, 3000);\n  }\n  \n  getAuthToken() {\n    // Get token from cookie or localStorage\n    return document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] || \n           localStorage.getItem('token');\n  }\n  \n  escapeHtml(text) {\n    const div = document.createElement('div');\n    div.textContent = text;\n    return div.innerHTML;\n  }\n}\n\n// Initialize chat system when DOM is loaded\ndocument.addEventListener('DOMContentLoaded', () => {\n  new ChatSystem();\n});
