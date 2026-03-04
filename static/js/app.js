/**
 * UITM Receptionist AI - Frontend JavaScript
 * Handles chat functionality, theme switching, panel toggling, and streaming responses
 */

// ========================================
// STATE MANAGEMENT
// ========================================

const state = {
    messages: [],
    isTyping: false,
    currentPanel: 'quick', // 'quick' or 'chat' (for mobile)
    theme: localStorage.getItem('uitm-theme') || 'light',
    model: 'deepseek/deepseek-r1',
    currentReasoning: '',
    currentContent: ''
};

// ========================================
// DOM ELEMENTS
// ========================================

const elements = {
    // Theme
    themeToggle: document.getElementById('themeToggle'),
    html: document.documentElement,
    
    // Panels
    quickAccessPanel: document.getElementById('quickAccessPanel'),
    chatPanel: document.getElementById('chatPanel'),
    mobileToggle: document.getElementById('mobileToggle'),
    quickToggleBtn: document.getElementById('quickToggleBtn'),
    chatToggleBtn: document.getElementById('chatToggleBtn'),
    
    // Chat
    messagesArea: document.getElementById('messagesArea'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    charCount: document.getElementById('charCount'),
    
    // Typing indicator
    typingIndicator: document.getElementById('typingIndicator'),
    liveReasoningContainer: document.getElementById('liveReasoningContainer'),
    liveReasoningToggle: document.getElementById('liveReasoningToggle'),
    liveReasoningContent: document.getElementById('liveReasoningContent'),
    liveReasoningText: document.getElementById('liveReasoningText'),
    
    // Quick access items
    quickItems: document.querySelectorAll('.quick-item'),
    
    // Welcome timestamp
    welcomeTime: document.getElementById('welcomeTime')
};

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Set theme
    setTheme(state.theme);
    
    // Set welcome message timestamp
    elements.welcomeTime.textContent = formatTime(new Date());
    
    // Initialize Lucide icons
    lucide.createIcons();
    
    // Setup event listeners
    setupEventListeners();
    
    // Check screen size for mobile layout
    handleResize();
    
    // Focus input on desktop
    if (window.innerWidth >= 1024) {
        elements.messageInput.focus();
    }
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);
    
    // Mobile panel toggles
    elements.quickToggleBtn.addEventListener('click', () => switchPanel('quick'));
    elements.chatToggleBtn.addEventListener('click', () => switchPanel('chat'));
    
    // Chat input
    elements.messageInput.addEventListener('input', handleInput);
    elements.messageInput.addEventListener('keydown', handleKeyDown);
    elements.sendButton.addEventListener('click', sendMessage);
    
    // Quick access items
    elements.quickItems.forEach(item => {
        item.addEventListener('click', () => {
            const question = item.getAttribute('data-question');
            handleQuickQuestion(question);
        });
    });
    
    // Live reasoning toggle during typing
    elements.liveReasoningToggle.addEventListener('click', () => {
        elements.liveReasoningContainer.classList.toggle('minimized');
        elements.liveReasoningContainer.classList.toggle('expanded');
    });
    
    // Window resize
    window.addEventListener('resize', handleResize);
    
    // Auto-resize textarea
    elements.messageInput.addEventListener('input', autoResizeTextarea);
}

// ========================================
// THEME MANAGEMENT
// ========================================

function setTheme(theme) {
    state.theme = theme;
    elements.html.setAttribute('data-theme', theme);
    localStorage.setItem('uitm-theme', theme);
}

function toggleTheme() {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

// ========================================
// PANEL MANAGEMENT (Mobile/Tablet)
// ========================================

function switchPanel(panel) {
    state.currentPanel = panel;
    
    // Update toggle buttons
    elements.quickToggleBtn.classList.toggle('active', panel === 'quick');
    elements.chatToggleBtn.classList.toggle('active', panel === 'chat');
    
    // Show/hide panels (mobile/tablet only)
    if (window.innerWidth < 1024) {
        if (panel === 'quick') {
            elements.quickAccessPanel.classList.remove('hidden');
            elements.chatPanel.classList.remove('visible');
        } else {
            elements.quickAccessPanel.classList.add('hidden');
            elements.chatPanel.classList.add('visible');
            // Focus input when switching to chat
            setTimeout(() => elements.messageInput.focus(), 300);
        }
    }
}

function handleResize() {
    const isDesktop = window.innerWidth >= 1024;
    
    if (isDesktop) {
        // Desktop: Show both panels, remove mobile visibility classes
        elements.quickAccessPanel.classList.remove('hidden');
        elements.chatPanel.classList.remove('visible');
        
        // Focus input on desktop
        if (document.activeElement !== elements.messageInput) {
            elements.messageInput.focus();
        }
    } else {
        // Mobile/Tablet: Apply current panel state
        switchPanel(state.currentPanel);
    }
    
    // Update CSS custom property for viewport height (for mobile address bar handling)
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    
    // Dispatch custom event for components that need to know about resize
    window.dispatchEvent(new CustomEvent('app:resize', { 
        detail: { isDesktop, width: window.innerWidth } 
    }));
}

// ========================================
// CHAT INPUT HANDLING
// ========================================

function handleInput() {
    const length = elements.messageInput.value.length;
    elements.charCount.textContent = `${length} / 2000`;
    
    // Update char count color
    if (length > 1800) {
        elements.charCount.style.color = 'var(--accent-primary)';
    } else {
        elements.charCount.style.color = 'var(--text-muted)';
    }
}

function handleKeyDown(e) {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function autoResizeTextarea() {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 150) + 'px';
}

// ========================================
// MESSAGE HANDLING
// ========================================

async function sendMessage() {
    const content = elements.messageInput.value.trim();
    if (!content || state.isTyping) return;
    
    // Add user message
    addMessage('user', content);
    
    // Clear input
    elements.messageInput.value = '';
    elements.charCount.textContent = '0 / 2000';
    elements.messageInput.style.height = 'auto';
    
    // Save to state
    state.messages.push({ role: 'user', content });
    
    // Show typing indicator with live reasoning
    showTypingIndicator();
    
    // Send to API
    await sendToAPI();
}

function handleQuickQuestion(question) {
    // Set input value
    elements.messageInput.value = question;
    handleInput();
    
    // Switch to chat panel on mobile
    if (window.innerWidth < 1024) {
        switchPanel('chat');
    }
    
    // Auto-send after short delay
    setTimeout(() => sendMessage(), 300);
}

function addMessage(role, content, reasoning = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    const timestamp = formatTime(new Date());
    const isAI = role === 'assistant';
    
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <i data-lucide="${isAI ? 'bot' : 'user'}"></i>
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="sender-name">${isAI ? 'Penerima AI UITM' : 'Anda'}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="message-text">
                ${formatMessageContent(content)}
            </div>
            ${reasoning ? createReasoningHTML(reasoning) : ''}
        </div>
    `;
    
    elements.messagesArea.appendChild(messageDiv);
    lucide.createIcons();
    
    // Scroll to bottom
    scrollToBottom();
    
    return messageDiv;
}

function formatMessageContent(content) {
    // Convert markdown-style formatting to HTML
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function createReasoningHTML(reasoning) {
    const reasoningId = 'reasoning-' + Date.now();
    return `
        <div class="reasoning-container minimized" id="${reasoningId}">
            <button class="reasoning-toggle" onclick="toggleReasoning('${reasoningId}')">
                <i data-lucide="brain-circuit"></i>
                <span>Tunjuk Penjelasan AI</span>
                <i data-lucide="chevron-down" class="toggle-icon"></i>
            </button>
            <div class="reasoning-content">
                <div class="reasoning-text">${escapeHtml(reasoning)}</div>
            </div>
        </div>
    `;
}

function toggleReasoning(id) {
    const container = document.getElementById(id);
    if (container) {
        container.classList.toggle('minimized');
        container.classList.toggle('expanded');
        
        // Update button text
        const button = container.querySelector('.reasoning-toggle span');
        if (button) {
            button.textContent = container.classList.contains('expanded') 
                ? 'Sembunyikan Penjelasan' 
                : 'Tunjuk Penjelasan AI';
        }
        
        // Re-render icons
        lucide.createIcons();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(date) {
    return date.toLocaleTimeString('ms-MY', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function scrollToBottom() {
    elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
}

// ========================================
// TYPING INDICATOR
// ========================================

function showTypingIndicator() {
    state.isTyping = true;
    state.currentReasoning = '';
    state.currentContent = '';
    
    // Reset live reasoning
    elements.liveReasoningContainer.classList.add('minimized');
    elements.liveReasoningContainer.classList.remove('expanded');
    elements.liveReasoningText.textContent = '';
    
    elements.typingIndicator.style.display = 'block';
    elements.sendButton.disabled = true;
    
    scrollToBottom();
}

function hideTypingIndicator() {
    state.isTyping = false;
    elements.typingIndicator.style.display = 'none';
    elements.sendButton.disabled = false;
    
    // Focus input
    elements.messageInput.focus();
}

function updateLiveReasoning(reasoning) {
    state.currentReasoning = reasoning;
    elements.liveReasoningText.textContent = reasoning;
    
    // Auto-scroll reasoning content
    elements.liveReasoningContent.scrollTop = elements.liveReasoningContent.scrollHeight;
}

function updateLiveContent(content) {
    state.currentContent = content;
}

// ========================================
// API COMMUNICATION
// ========================================

async function sendToAPI() {
    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: state.messages,
                model: state.model,
                stream: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            // Process SSE data
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        // Stream complete
                        finalizeResponse();
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        processStreamData(parsed);
                    } catch (e) {
                        // Ignore parse errors for incomplete chunks
                    }
                }
            }
        }
        
        // Finalize any remaining content
        finalizeResponse();
        
    } catch (error) {
        console.error('API Error:', error);
        hideTypingIndicator();
        addErrorMessage('Maaf, terdapat masalah teknikal. Sila cuba lagi.');
    }
}

function processStreamData(data) {
    if (!data.choices || !data.choices[0]) return;
    
    const delta = data.choices[0].delta;
    if (!delta) return;
    
    // Handle reasoning (thinking process)
    if (delta.reasoning) {
        updateLiveReasoning(state.currentReasoning + delta.reasoning);
    }
    
    // Handle content (actual response)
    if (delta.content) {
        updateLiveContent(state.currentContent + delta.content);
    }
}

function finalizeResponse() {
    hideTypingIndicator();
    
    // Add the complete AI message
    if (state.currentContent || state.currentReasoning) {
        const messageContent = state.currentContent || 'Tiada respons.';
        const reasoning = state.currentReasoning || null;
        
        addMessage('assistant', messageContent, reasoning);
        
        // Save to state
        state.messages.push({
            role: 'assistant',
            content: messageContent,
            reasoning: reasoning
        });
    }
}

function addErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message ai-message';
    errorDiv.innerHTML = `
        <div class="message-avatar" style="background-color: var(--accent-primary);">
            <i data-lucide="alert-circle"></i>
        </div>
        <div class="message-content" style="border-color: var(--accent-primary);">
            <div class="message-header">
                <span class="sender-name" style="color: var(--accent-primary);">Ralat Sistem</span>
                <span class="timestamp">${formatTime(new Date())}</span>
            </div>
            <div class="message-text" style="color: var(--accent-primary);">
                ${message}
            </div>
        </div>
    `;
    elements.messagesArea.appendChild(errorDiv);
    lucide.createIcons();
    scrollToBottom();
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Expose toggleReasoning to global scope for onclick handlers
window.toggleReasoning = toggleReasoning;

// Handle page visibility change (pause/resume functionality)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.isTyping) {
        // Page hidden while typing - could add pause functionality here
        console.log('Page hidden - chat continues in background');
    }
});

// Prevent accidental page leave while typing
window.addEventListener('beforeunload', (e) => {
    if (state.isTyping) {
        e.preventDefault();
        e.returnValue = 'AI sedang menjawab. Anda pasti mahu tinggalkan halaman?';
    }
});
