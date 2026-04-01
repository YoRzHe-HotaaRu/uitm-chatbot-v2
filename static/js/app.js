/**
 * UiTM Receptionist AI - Frontend JavaScript
 * Handles chat functionality, theme switching, panel toggling, and streaming responses
 */

// ========================================
// STATE MANAGEMENT
// ========================================

const state = {
    messages: [],
    isTyping: false,
    isSpeaking: false, // true while TTS audio is playing
    currentPanel: 'quick', // 'quick' or 'chat' (for mobile)
    theme: localStorage.getItem('uitm-theme') || 'light',
    model: 'google/gemini-3.1-flash-lite-preview',
    currentReasoning: '',
    currentContent: '',
    ragUsed: false,
    structuredResponse: null, // For special responses like creator info
    ttsEnabled: localStorage.getItem('uitm-tts-enabled') !== 'false', // Default: true
    lastUserMessage: null, // Store last user message for gesture triggering with TTS

    // Audio recording state (for OpenRouter multimodal)
    audio: {
        isRecording: false,
        mediaRecorder: null,
        audioChunks: [],
        stream: null,
        selectedDevice: localStorage.getItem('uitm-selected-mic') || null,
        format: 'webm'
    },

    // VTube Studio state
    vts: {
        enabled: localStorage.getItem('uitm-vts-enabled') === 'true',
        connected: false,
        connecting: false,
        lipSyncData: null,
        currentAudio: null
    },

    // Remote control state
    remote: {
        role: localStorage.getItem('uitm-remote-role') || 'standalone', // 'standalone', 'master', 'remote'
        socket: null,
        connected: false,
        sessionCode: null,
        room: null,
        masterSid: null,
        devices: [],
        isRemoteRecording: false // Track master's recording state on remote device
    },

    // Settings modal state
    settings: {
        isOpen: false
    },

    // Performance monitor state
    perfMonitor: {
        enabled: localStorage.getItem('uitm-perf-monitor-enabled') === 'true',
        metrics: {
            llm: {
                responseTime: null,
                tokensPerSec: null,
                totalTokens: null
            },
            tts: {
                genTime: null,
                audioSize: null,
                lipSyncFrames: null,
                cacheStatus: null
            },
            vts: {
                connectionStatus: 'Tidak disambung',
                latency: null
            },
            network: {
                serverResponseTime: null
            }
        },
        timing: {
            llmStart: null,
            ttsStart: null,
            serverStart: null
        }
    },

    // Human Detection state
    detection: {
        available: false,
        enabled: localStorage.getItem('uitm-detection-enabled') === 'true',
        running: false,
        autoGreet: true,
        personCount: 0,
        sessionCount: 0,
        fps: 0,
        streamUrl: null
    }
};

// ========================================
// DOM ELEMENTS
// ========================================

const elements = {
    // Settings
    settingsToggle: document.getElementById('settingsToggle'),
    settingsModal: document.getElementById('settingsModal'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    closeSettings: document.getElementById('closeSettings'),
    themeLight: document.getElementById('themeLight'),
    themeDark: document.getElementById('themeDark'),
    microphoneSelect: document.getElementById('microphoneSelect'),
    testMicBtn: document.getElementById('testMicBtn'),
    ttsToggle: document.getElementById('ttsToggle'),
    vtsToggle: document.getElementById('vtsToggle'),
    vtsStatus: document.getElementById('vtsStatus'),
    vtsSettingsSection: document.getElementById('vtsSettingsSection'),
    perfMonitorToggle: document.getElementById('perfMonitorToggle'),
    perfMonitorOverlay: document.getElementById('perfMonitorOverlay'),
    html: document.documentElement,

    // Remote control elements
    roleStandalone: document.getElementById('roleStandalone'),
    roleMaster: document.getElementById('roleMaster'),
    roleRemote: document.getElementById('roleRemote'),
    remoteStatus: document.getElementById('remoteStatus'),
    sessionCodeContainer: document.getElementById('sessionCodeContainer'),
    sessionCode: document.getElementById('sessionCode'),
    copySessionCode: document.getElementById('copySessionCode'),
    joinSessionContainer: document.getElementById('joinSessionContainer'),
    sessionCodeInput: document.getElementById('sessionCodeInput'),
    joinSessionBtn: document.getElementById('joinSessionBtn'),

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
    welcomeTime: document.getElementById('welcomeTime'),

    // Voice input
    inputContainer: document.getElementById('inputContainer'),
    micButton: document.getElementById('micButton'),
    inputHint: document.getElementById('inputHint'),
    voiceVisualizer: document.getElementById('voiceVisualizer'),
    sendingVoiceIndicator: document.getElementById('sendingVoiceIndicator'),

    // Detection elements
    detectionSettingsSection: document.getElementById('detectionSettingsSection'),
    detectionToggle: document.getElementById('detectionToggle'),
    detectionStatus: document.getElementById('detectionStatus'),
    detectionStats: document.getElementById('detectionStats'),
    detectionPreview: document.getElementById('detectionPreview'),
    detectionStreamImg: document.getElementById('detectionStreamImg'),
    detectionCurrentCount: document.getElementById('detectionCurrentCount'),
    detectionSessionCount: document.getElementById('detectionSessionCount'),
    detectionFps: document.getElementById('detectionFps'),
    detectionAutoGreetContainer: document.getElementById('detectionAutoGreetContainer'),
    detectionAutoGreetToggle: document.getElementById('detectionAutoGreetToggle'),
    detectionGreetBtn: document.getElementById('detectionGreetBtn'),
    detectionCameraSelect: document.getElementById('detectionCameraSelect'),
    detectionCameraRefresh: document.getElementById('detectionCameraRefresh')
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

    // Initialize settings
    initializeSettings();

    // Initialize audio devices
    initializeAudioDevices();

    // Initialize VTS (VTube Studio)
    initializeVTS();
    checkVTSStatus();

    // Initialize performance monitor
    initializePerfMonitor();

    // Initialize remote control
    initializeRemoteControl();

    // Initialize human detection
    initializeDetection();

    // Schedule startup audio to play after user interaction + 5 seconds
    scheduleStartupAudio();
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    // Settings modal
    elements.settingsToggle.addEventListener('click', toggleSettingsModal);
    elements.closeSettings.addEventListener('click', toggleSettingsModal);
    elements.settingsOverlay.addEventListener('click', toggleSettingsModal);

    // Theme options in settings
    elements.themeLight.addEventListener('click', () => setTheme('light'));
    elements.themeDark.addEventListener('click', () => setTheme('dark'));

    // TTS toggle
    elements.ttsToggle.addEventListener('change', handleTTSToggle);

    // Performance monitor toggle
    if (elements.perfMonitorToggle) {
        elements.perfMonitorToggle.addEventListener('change', handlePerfMonitorToggle);
    }

    // Detection toggle
    if (elements.detectionToggle) {
        elements.detectionToggle.addEventListener('change', handleDetectionToggle);
    }
    if (elements.detectionAutoGreetToggle) {
        elements.detectionAutoGreetToggle.addEventListener('change', handleDetectionAutoGreetToggle);
    }
    if (elements.detectionGreetBtn) {
        elements.detectionGreetBtn.addEventListener('click', handleDetectionManualGreet);
    }

    // Microphone selection
    elements.microphoneSelect.addEventListener('change', handleMicrophoneSelect);
    elements.testMicBtn.addEventListener('click', testMicrophone);

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

    // Voice input toggle
    elements.micButton.addEventListener('click', () => {
        // Block voice input while speaking
        if (state.isSpeaking) return;

        // Remote mode: send command to master
        if (state.remote.role === 'remote' && state.remote.socket) {
            if (state.remote.isRemoteRecording) {
                console.log('[Remote] Sending stop recording to master');
                state.remote.socket.emit('remote_stop_recording', {
                    room: state.remote.room
                });
            } else {
                console.log('[Remote] Sending start recording to master');
                state.remote.socket.emit('remote_start_recording', {
                    room: state.remote.room
                });
            }
            return;
        }

        // Standalone/Master mode: record locally
        if (state.audio.isRecording) {
            stopAudioRecording();
        } else {
            startAudioRecording();
        }
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
    if (!content || state.isTyping || state.isSpeaking) return;

    // Add user message
    addMessage('user', content);

    // Store user message for gesture triggering when TTS starts
    state.lastUserMessage = content;

    // Clear input
    elements.messageInput.value = '';
    elements.charCount.textContent = '0 / 2000';
    elements.messageInput.style.height = 'auto';

    // Save to state
    state.messages.push({ role: 'user', content });

    // Sync user message to remote devices (Master mode)
    if (state.remote.role === 'master' && state.remote.socket && state.remote.connected) {
        state.remote.socket.emit('master_chat_update', {
            messages: state.messages,
            room: state.remote.room
        });
    }

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

function addMessage(role, content, reasoning = null, ragUsed = false, imageData = null, isVoice = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;

    const timestamp = formatTime(new Date());
    const isAI = role === 'assistant';

    // Build image HTML if present
    let imageHTML = '';
    if (imageData) {
        // Support both direct links in imageData or nested links array
        const links = imageData.links || (imageData._links ? [imageData._links] : []);
        const linksHTML = links.length > 0 ? links.map(link => `
            <a href="${link.url}" target="_blank" rel="noopener" class="creator-link">
                <i data-lucide="${link.icon || 'external-link'}"></i>
                <span>${link.text}</span>
            </a>
        `).join('') : '';

        imageHTML = `
            <div class="creator-card">
                <div class="creator-image-wrapper">
                    <img src="${imageData.url}"
                         alt="${imageData.alt || ''}"
                         class="creator-image"
                         loading="lazy">
                </div>
                <div class="creator-info">
                    <h4 class="creator-name">${imageData.title || ''}</h4>
                    ${linksHTML ? `<div class="creator-links">${linksHTML}</div>` : ''}
                </div>
            </div>
        `;
    }

    // Build voice visualizer HTML if it's a voice message
    let contentHTML = '';
    if (isVoice) {
        contentHTML = `
            <div class="voice-message-indicator">
                <div class="voice-wave">
                    <span class="voice-bar"></span>
                    <span class="voice-bar"></span>
                    <span class="voice-bar"></span>
                    <span class="voice-bar"></span>
                    <span class="voice-bar"></span>
                </div>
                <span class="voice-label">Mesej Suara</span>
            </div>
        `;
    } else {
        contentHTML = formatMessageContent(content);
    }

    messageDiv.innerHTML = `
        <div class="message-avatar">
            ${isAI ? '<img src="/static/assets/bot-avatar.svg" alt="AI Avatar" class="avatar-svg" />' : '<img src="/static/assets/user-avatar.svg" alt="User Avatar" class="avatar-svg" />'}
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="sender-name">${isAI ? 'AI Receptionist UiTM' : 'Anda'}</span>
                <div class="message-meta">
                    ${ragUsed ? '<span class="rag-indicator" title="Jawapan menggunakan maklumat dari pangkalan pengetahuan UiTM"><i data-lucide="database"></i> RAG</span>' : ''}
                    <span class="timestamp">${timestamp}</span>
                </div>
            </div>
            <div class="message-text ${isVoice ? 'voice-message-text' : ''}">
                ${contentHTML}
            </div>
            ${imageHTML}
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
        // Convert markdown links [text](url) to HTML anchor tags
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>')
        // Style email addresses
        .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<span class="message-email">$1</span>')
        // Style phone numbers (various formats)
        .replace(/((\+?6?0)?[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/g, '<span class="message-phone">$1</span>')
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

    // Show live reasoning expanded by default
    elements.liveReasoningContainer.classList.add('expanded');
    elements.liveReasoningContainer.classList.remove('minimized');
    elements.liveReasoningText.textContent = '';

    elements.typingIndicator.style.display = 'block';
    elements.sendButton.disabled = true;
    updateInputState();

    scrollToBottom();
}

function hideTypingIndicator() {
    state.isTyping = false;
    elements.typingIndicator.style.display = 'none';
    elements.sendButton.disabled = false;
    updateInputState();

    // Focus input
    elements.messageInput.focus();
}

function updateInputState() {
    const blocked = state.isTyping || state.isSpeaking;

    // Disable send button
    if (elements.sendButton) {
        elements.sendButton.disabled = blocked;
    }

    // Visually disable mic button
    if (elements.micButton) {
        elements.micButton.style.opacity = blocked ? '0.4' : '1';
        elements.micButton.style.pointerEvents = blocked ? 'none' : 'auto';
    }

    // Show hint when blocked
    if (elements.inputHint) {
        if (state.isSpeaking) {
            elements.inputHint.textContent = '🔊 Avatar sedang bercakap...';
            elements.inputHint.style.color = 'var(--accent-tertiary)';
        } else if (state.isTyping) {
            elements.inputHint.textContent = '⏳ AI sedang menjawab...';
            elements.inputHint.style.color = 'var(--accent-tertiary)';
        } else {
            elements.inputHint.textContent = 'Taip mesej atau tekan ikon mikrofon untuk bercakap';
            elements.inputHint.style.color = '';
        }
    }
}

function updateLiveReasoning(reasoning) {
    state.currentReasoning = reasoning;
    elements.liveReasoningText.textContent = reasoning;

    // Auto-scroll after DOM update
    requestAnimationFrame(() => {
        // Scroll the reasoning content to show latest thoughts
        elements.liveReasoningContent.scrollTo({
            top: elements.liveReasoningContent.scrollHeight,
            behavior: 'auto'
        });
    });
}

function updateLiveContent(content) {
    state.currentContent = content;
}

// ========================================
// API COMMUNICATION
// ========================================

// Token counter for LLM performance tracking
let currentTokenCount = 0;

async function sendToAPI() {
    try {
        // Reset state for new message
        state.currentReasoning = '';
        state.currentContent = '';
        state.ragUsed = false;
        currentTokenCount = 0;

        // Start LLM timing
        startLLMTiming();

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
    // Handle RAG metadata
    if (data.rag_metadata) {
        state.ragUsed = data.rag_metadata.rag_used || false;
        return;
    }

    if (!data.choices || !data.choices[0]) return;

    const delta = data.choices[0].delta;
    if (!delta) return;

    // Handle reasoning (thinking process)
    if (delta.reasoning) {
        updateLiveReasoning(state.currentReasoning + delta.reasoning);
    }

    // Handle content (actual response)
    if (delta.content) {
        // Count tokens (approximate: 1 token ≈ 4 chars for English, 1-2 chars for Malay)
        currentTokenCount += Math.ceil(delta.content.length / 3);

        // Check if this is a special structured response (e.g., creator info)
        try {
            const parsed = JSON.parse(delta.content);
            if (parsed.type === 'creator_info') {
                // Store as structured data for finalizeResponse
                state.structuredResponse = parsed;
                return;
            }
        } catch (e) {
            // Not JSON, treat as regular content
        }
        updateLiveContent(state.currentContent + delta.content);
    }
}

async function finalizeResponse() {
    // End LLM timing with token count
    endLLMTiming(currentTokenCount);

    // Handle structured response (e.g., creator info with image)
    if (state.structuredResponse) {
        const response = state.structuredResponse;

        // Combine image data with links
        const imageData = {
            ...response.image,
            links: response.links || []
        };

        // Wait for TTS to be ready before showing the message
        try { await playTTS(response.content); } catch(e) { console.error('TTS error:', e); }

        // Now hide typing and show message + audio together
        hideTypingIndicator();
        addMessage('assistant', response.content, null, false, imageData);

        // Save to state
        state.messages.push({
            role: 'assistant',
            content: response.content,
            reasoning: null,
            ragUsed: false,
            image: imageData
        });

        // Reset structured response
        state.structuredResponse = null;
        state.ragUsed = false;
        return;
    }

    // Add the complete AI message
    if (state.currentContent || state.currentReasoning) {
        const messageContent = state.currentContent || 'Tiada respons.';
        const reasoning = state.currentReasoning || null;

        // Wait for TTS to be ready before showing the message
        try { await playTTS(messageContent); } catch(e) { console.error('TTS error:', e); }

        // Now hide typing and show message + audio together
        hideTypingIndicator();
        addMessage('assistant', messageContent, reasoning, state.ragUsed);

        // Save to state
        state.messages.push({
            role: 'assistant',
            content: messageContent,
            reasoning: reasoning,
            ragUsed: state.ragUsed
        });

        // Reset RAG flag for next message
        state.ragUsed = false;

        // Disable explain gesture after response is complete (with delay)
        setTimeout(() => {
            disableExplainGesture();
        }, 1000);
    }

    // Sync chat to remote devices (Master mode)
    if (state.remote.role === 'master' && state.remote.socket && state.remote.connected) {
        state.remote.socket.emit('master_chat_update', {
            messages: state.messages,
            room: state.remote.room
        });
        console.log('[Remote/Master] Synced chat to remote devices');
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

// ========================================
// SETTINGS MODULE
// ========================================

function initializeSettings() {
    // Update theme buttons state
    updateThemeButtons();
    // Update TTS toggle state
    updateTTSToggle();
    // Update performance monitor toggle state
    updatePerfMonitorToggleState();
}

function updateTTSToggle() {
    if (elements.ttsToggle) {
        elements.ttsToggle.checked = state.ttsEnabled;
    }
}

function handleTTSToggle(e) {
    state.ttsEnabled = e.target.checked;
    localStorage.setItem('uitm-tts-enabled', state.ttsEnabled);
}

function toggleSettingsModal() {
    state.settings.isOpen = !state.settings.isOpen;
    elements.settingsModal.classList.toggle('open', state.settings.isOpen);

    if (state.settings.isOpen) {
        // Refresh mic list when opening
        populateMicrophoneList();
        updateThemeButtons();
        updateTTSToggle();
        updatePerfMonitorToggleState();
    }
}

function updateThemeButtons() {
    // Update active state of theme buttons
    elements.themeLight.classList.toggle('active', state.theme === 'light');
    elements.themeDark.classList.toggle('active', state.theme === 'dark');
}

// Override setTheme to also update buttons
const originalSetTheme = setTheme;
setTheme = function (theme) {
    originalSetTheme(theme);
    updateThemeButtons();
};

// ========================================
// PERFORMANCE MONITOR MODULE
// ========================================

function initializePerfMonitor() {
    // Show/hide overlay based on saved preference
    updatePerfMonitorVisibility();

    // Start periodic VTS status updates for latency tracking
    if (state.perfMonitor.enabled) {
        startVTSPerfTracking();
    }
}

function updatePerfMonitorToggleState() {
    if (elements.perfMonitorToggle) {
        elements.perfMonitorToggle.checked = state.perfMonitor.enabled;
    }
}

function handlePerfMonitorToggle(e) {
    state.perfMonitor.enabled = e.target.checked;
    localStorage.setItem('uitm-perf-monitor-enabled', state.perfMonitor.enabled);
    updatePerfMonitorVisibility();

    if (state.perfMonitor.enabled) {
        startVTSPerfTracking();
    }
}

function updatePerfMonitorVisibility() {
    if (elements.perfMonitorOverlay) {
        elements.perfMonitorOverlay.style.display = state.perfMonitor.enabled ? 'block' : 'none';
    }
}

// Start tracking LLM request timing
function startLLMTiming() {
    if (!state.perfMonitor.enabled) return;
    state.perfMonitor.timing.llmStart = performance.now();
}

// End tracking LLM request timing
function endLLMTiming(tokenCount = null) {
    if (!state.perfMonitor.enabled || !state.perfMonitor.timing.llmStart) return;

    const endTime = performance.now();
    const duration = endTime - state.perfMonitor.timing.llmStart;

    state.perfMonitor.metrics.llm.responseTime = duration;

    if (tokenCount && duration > 0) {
        state.perfMonitor.metrics.llm.tokensPerSec = Math.round((tokenCount / duration) * 1000);
        state.perfMonitor.metrics.llm.totalTokens = tokenCount;
    }

    updatePerfMonitorDisplay();
    state.perfMonitor.timing.llmStart = null;
}

// Start tracking TTS generation timing
function startTTSTiming() {
    if (!state.perfMonitor.enabled) return;
    state.perfMonitor.timing.ttsStart = performance.now();
}

// End tracking TTS generation timing
function endTTSTiming(audioSize = null, lipSyncFrames = null, cacheHit = false) {
    if (!state.perfMonitor.enabled || !state.perfMonitor.timing.ttsStart) return;

    const endTime = performance.now();
    const duration = endTime - state.perfMonitor.timing.ttsStart;

    state.perfMonitor.metrics.tts.genTime = duration;

    if (audioSize !== null) {
        state.perfMonitor.metrics.tts.audioSize = audioSize;
    }

    if (lipSyncFrames !== null) {
        state.perfMonitor.metrics.tts.lipSyncFrames = lipSyncFrames;
    }

    state.perfMonitor.metrics.tts.cacheStatus = cacheHit ? 'Cache' : 'Live';

    updatePerfMonitorDisplay();
    state.perfMonitor.timing.ttsStart = null;
}

// Start tracking server request timing
function startServerTiming() {
    if (!state.perfMonitor.enabled) return;
    state.perfMonitor.timing.serverStart = performance.now();
}

// End tracking server request timing
function endServerTiming() {
    if (!state.perfMonitor.enabled || !state.perfMonitor.timing.serverStart) return;

    const endTime = performance.now();
    const duration = endTime - state.perfMonitor.timing.serverStart;

    state.perfMonitor.metrics.network.serverResponseTime = duration;

    updatePerfMonitorDisplay();
    state.perfMonitor.timing.serverStart = null;
}

// Update VTS performance metrics
function updateVTSPerfMetrics(status, latency = null) {
    if (!state.perfMonitor.enabled) return;

    state.perfMonitor.metrics.vts.connectionStatus = status ? 'Disambung' : 'Tidak disambung';

    if (latency !== null) {
        state.perfMonitor.metrics.vts.latency = latency;
    }

    updatePerfMonitorDisplay();
}

// Start periodic VTS tracking
function startVTSPerfTracking() {
    // Update VTS status immediately
    updateVTSPerfMetrics(state.vts.connected);

    // Update every 5 seconds while monitor is enabled
    setInterval(() => {
        if (state.perfMonitor.enabled) {
            updateVTSPerfMetrics(state.vts.connected);
        }
    }, 5000);
}

// Update the performance monitor display
function updatePerfMonitorDisplay() {
    if (!state.perfMonitor.enabled) return;

    const metrics = state.perfMonitor.metrics;

    // LLM metrics
    const llmResponseTimeEl = document.getElementById('llmResponseTime');
    const llmTokensPerSecEl = document.getElementById('llmTokensPerSec');
    const llmTotalTokensEl = document.getElementById('llmTotalTokens');

    if (llmResponseTimeEl && metrics.llm.responseTime !== null) {
        llmResponseTimeEl.textContent = `${Math.round(metrics.llm.responseTime)}ms`;
    }
    if (llmTokensPerSecEl && metrics.llm.tokensPerSec !== null) {
        llmTokensPerSecEl.textContent = `${metrics.llm.tokensPerSec} t/s`;
    }
    if (llmTotalTokensEl && metrics.llm.totalTokens !== null) {
        llmTotalTokensEl.textContent = metrics.llm.totalTokens.toLocaleString();
    }

    // TTS metrics
    const ttsGenTimeEl = document.getElementById('ttsGenTime');
    const ttsAudioSizeEl = document.getElementById('ttsAudioSize');
    const ttsLipSyncFramesEl = document.getElementById('ttsLipSyncFrames');
    const ttsCacheStatusEl = document.getElementById('ttsCacheStatus');

    if (ttsGenTimeEl && metrics.tts.genTime !== null) {
        ttsGenTimeEl.textContent = `${Math.round(metrics.tts.genTime)}ms`;
    }
    if (ttsAudioSizeEl && metrics.tts.audioSize !== null) {
        const sizeKB = (metrics.tts.audioSize / 1024).toFixed(1);
        ttsAudioSizeEl.textContent = `${sizeKB} KB`;
    }
    if (ttsLipSyncFramesEl && metrics.tts.lipSyncFrames !== null) {
        ttsLipSyncFramesEl.textContent = `${metrics.tts.lipSyncFrames} frame`;
    }
    if (ttsCacheStatusEl && metrics.tts.cacheStatus !== null) {
        ttsCacheStatusEl.textContent = metrics.tts.cacheStatus;
        ttsCacheStatusEl.className = 'perf-value ' + (metrics.tts.cacheStatus === 'Cache' ? 'cache-hit' : 'cache-miss');
    }

    // VTS metrics
    const vtsStatusEl = document.getElementById('vtsConnectionStatus');
    const vtsLatencyEl = document.getElementById('vtsLatency');

    if (vtsStatusEl) {
        vtsStatusEl.textContent = metrics.vts.connectionStatus;
        vtsStatusEl.className = 'perf-value ' + (state.vts.connected ? 'connected' : 'disconnected');
    }
    if (vtsLatencyEl && metrics.vts.latency !== null) {
        vtsLatencyEl.textContent = `${Math.round(metrics.vts.latency)}ms`;
    }

    // Network metrics
    const serverResponseTimeEl = document.getElementById('serverResponseTime');
    if (serverResponseTimeEl && metrics.network.serverResponseTime !== null) {
        serverResponseTimeEl.textContent = `${Math.round(metrics.network.serverResponseTime)}ms`;
    }
}

// ========================================
// TTS MODULE (Text-to-Speech)
// ========================================

async function playTTS(text) {
    // Skip if TTS is disabled
    if (!state.ttsEnabled) return;

    // Skip if no text
    if (!text || text.trim().length === 0) return;

    // Start TTS timing
    startTTSTiming();

    // Clean text for TTS (remove markdown formatting and URLs)
    const cleanText = text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\n/g, ' ')
        // Remove URLs (http/https links)
        .replace(/https?:\/\/[^\s]+/g, '')
        // Remove markdown links [text](url) - keep only the text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove any remaining URL-like patterns
        .replace(/www\.[^\s]+/g, '')
        // Remove email addresses
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
        // Remove phone numbers (various formats: 03-5544 4444, +6012-345 6789, etc.)
        .replace(/(\+?6?0)?[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g, '')
        // Clean up extra spaces left by removed content
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 4000); // Limit to 4000 chars

    try {
        // Check if VTS is enabled and connected
        const includeLipSync = state.vts.enabled && state.vts.connected;

        const response = await fetch('/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: cleanText,
                include_lip_sync: includeLipSync
            })
        });

        if (!response.ok) {
            console.error('TTS request failed:', response.status);
            return;
        }

        // Check if response is JSON (with lip sync) or audio blob
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            // Response includes lip sync data
            const data = await response.json();

            // End TTS timing with metrics
            const audioSize = data.audio ? Math.ceil(data.audio.length * 0.75) : 0; // Approximate base64 to bytes
            const lipSyncFrames = data.lip_sync ? data.lip_sync.length : 0;
            const cacheHit = data.cached === true;
            endTTSTiming(audioSize, lipSyncFrames, cacheHit);

            // Decode base64 audio
            const audioBytes = atob(data.audio);
            const audioArray = new Uint8Array(audioBytes.length);
            for (let i = 0; i < audioBytes.length; i++) {
                audioArray[i] = audioBytes.charCodeAt(i);
            }

            const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            // Store lip sync data
            if (data.lip_sync && data.lip_sync.length > 0) {
                state.vts.lipSyncData = data.lip_sync;
                state.vts.currentAudio = audio;

                // Start lip sync playback (pass text for explain gesture decision)
                playLipSync(data.lip_sync, audio, cleanText);
            }

            // Trigger gesture based on user input right before audio plays
            // This ensures the wave_hello gesture syncs with TTS audio playback
            if (state.lastUserMessage && state.vts.enabled && state.vts.connected) {
                // Fire-and-forget gesture trigger (non-blocking)
                detectAndTriggerGesture(state.lastUserMessage, 'user');
                // Clear the stored message to prevent duplicate triggers
                state.lastUserMessage = null;
            }

            // Trigger wave_hello for greeting messages
            if (cleanText.includes('Assalamualaikum') && state.vts.enabled && state.vts.connected) {
                triggerVTSGesture('wave_hello', true).catch(err => {
                    console.error('[Greeting] wave_hello error:', err);
                });
            }

            audio.play().catch(err => {
                console.error('Audio playback failed:', err);
                state.isSpeaking = false;
            });

            // Block input while speaking
            state.isSpeaking = true;
            updateInputState();

            // Cleanup URL after playback
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                state.vts.lipSyncData = null;
                state.vts.currentAudio = null;
                state.isSpeaking = false;
                updateInputState();
            };
        } else {
            // Response is audio only
            const audioBlob = await response.blob();

            // End TTS timing with audio size
            endTTSTiming(audioBlob.size, 0, false);

            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            // Trigger gesture based on user input right before audio plays
            // This ensures the wave_hello gesture syncs with TTS audio playback
            if (state.lastUserMessage && state.vts.enabled && state.vts.connected) {
                // Fire-and-forget gesture trigger (non-blocking)
                detectAndTriggerGesture(state.lastUserMessage, 'user');
                // Clear the stored message to prevent duplicate triggers
                state.lastUserMessage = null;
            }

            // Trigger wave_hello for greeting messages
            if (cleanText.includes('Assalamualaikum') && state.vts.enabled && state.vts.connected) {
                triggerVTSGesture('wave_hello', true).catch(err => {
                    console.error('[Greeting] wave_hello error:', err);
                });
            }

            audio.play().catch(err => {
                console.error('Audio playback failed:', err);
                state.isSpeaking = false;
            });

            // Block input while speaking
            state.isSpeaking = true;
            updateInputState();

            // Cleanup URL after playback
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                state.isSpeaking = false;
                updateInputState();
            };
        }

    } catch (error) {
        console.error('TTS error:', error);
    }
}

// ========================================
// STARTUP AUDIO
// ========================================

let startupAudioScheduled = false;
let startupAudioPlayed = false;

/**
 * Play startup greeting audio with lip-sync after user interaction.
 * Waits for first user click, then plays audio after 5 seconds.
 * Respects TTS toggle setting.
 */
function scheduleStartupAudio() {
    if (startupAudioScheduled) return;
    startupAudioScheduled = true;

    // Wait for first user interaction
    const waitForInteraction = () => {
        // If TTS is disabled or already played, don't play audio
        if (!state.ttsEnabled || startupAudioPlayed) {
            console.log('[Startup Audio] TTS disabled or already played, skipping');
            return;
        }

        console.log('[Startup Audio] User interaction detected, scheduling playback in 1.5 seconds');

        // Wait 1.5 seconds after first interaction
        setTimeout(async () => {
            await playStartupAudio();
        }, 1500);
    };

    // Listen for first user interaction
    document.addEventListener('click', waitForInteraction, { once: true });
    document.addEventListener('keydown', waitForInteraction, { once: true });
}

/**
 * Fetch and play startup greeting audio with lip-sync.
 * Only plays once per session.
 */
async function playStartupAudio() {
    // Prevent multiple plays
    if (startupAudioPlayed) {
        console.log('[Startup Audio] Already played, skipping');
        return;
    }

    // Check if TTS is enabled
    if (!state.ttsEnabled) {
        console.log('[Startup Audio] TTS disabled, skipping playback');
        return;
    }

    // Mark as played immediately to prevent duplicates
    startupAudioPlayed = true;

    try {
        console.log('[Startup Audio] Fetching startup audio...');

        // Check if VTS is enabled and connected for lip-sync
        const includeLipSync = state.vts.enabled && state.vts.connected;

        const response = await fetch('/tts/play-startup-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                include_lip_sync: includeLipSync
            })
        });

        if (!response.ok) {
            console.error('[Startup Audio] Request failed:', response.status);
            return;
        }

        const data = await response.json();

        // Decode base64 audio
        const audioBytes = atob(data.audio);
        const audioArray = new Uint8Array(audioBytes.length);
        for (let i = 0; i < audioBytes.length; i++) {
            audioArray[i] = audioBytes.charCodeAt(i);
        }

        const audioBlob = new Blob([audioArray], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        console.log(`[Startup Audio] Loaded ${data.duration.toFixed(2)}s audio, ${data.lip_sync.length} lip-sync frames`);

        // Step 1: Trigger wave_hello gesture + start audio/lip-sync together
        if (state.vts.enabled && state.vts.connected) {
            triggerVTSGesture('wave_hello').catch(err => {
                console.error('[Startup Audio] Wave gesture failed:', err);
            });
            console.log('[Startup Audio] Wave hello started');
        }

        // Store lip sync data and start playback
        if (data.lip_sync && data.lip_sync.length > 0 && includeLipSync) {
            state.vts.lipSyncData = data.lip_sync;
            state.vts.currentAudio = audio;

            // Start lip-sync first (fire and forget - don't await)
            playLipSync(data.lip_sync, audio, '');

            // Wait a small delay for backend to receive and start lip-sync
            await new Promise(resolve => setTimeout(resolve, 80));

            console.log('[Startup Audio] Lip-sync started, playing audio now');
        }

        // Play audio (slightly delayed to sync with lip-sync)
        audio.play().catch(err => {
            console.error('[Startup Audio] Playback failed:', err);
        });

        // Step 2: After wave completes (~2.5s), toggle explain_arm_gesture ON
        // Delay ensures cooldown (2s) has passed since wave_hello
        if (state.vts.enabled && state.vts.connected) {
            setTimeout(async () => {
                await triggerVTSGesture('explain_arm_gesture').catch(err => {
                    console.error('[Startup Audio] Explain arm toggle failed:', err);
                });
                console.log('[Startup Audio] Explain arm gesture ON');
            }, 2500);
        }

        // Cleanup URL after playback and toggle explain_arm OFF
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            state.vts.lipSyncData = null;
            state.vts.currentAudio = null;
            console.log('[Startup Audio] Playback completed');

            // Step 3: Toggle explain_arm_gesture OFF after speech ends
            if (state.vts.enabled && state.vts.connected) {
                triggerVTSGesture('explain_arm_gesture').then(() => {
                    console.log('[Startup Audio] Explain arm gesture OFF');
                }).catch(err => {
                    console.error('[Startup Audio] Explain arm off failed:', err);
                });
            }
        };

    } catch (error) {
        console.error('[Startup Audio] Error:', error);
    }
}

// ========================================
// VTS MODULE (VTube Studio)
// ========================================

async function initializeVTS() {
    // Check if VTS section exists (indicates VTS is enabled on backend)
    if (!elements.vtsSettingsSection) {
        return;
    }

    // Update toggle state
    if (elements.vtsToggle) {
        elements.vtsToggle.checked = state.vts.enabled;
        elements.vtsToggle.addEventListener('change', handleVTSToggle);
    }

    // If VTS was enabled, try to connect
    if (state.vts.enabled) {
        await connectVTS();
    }
}

async function handleVTSToggle(event) {
    const enabled = event.target.checked;
    state.vts.enabled = enabled;
    localStorage.setItem('uitm-vts-enabled', enabled);

    if (enabled) {
        await connectVTS();
    } else {
        await disconnectVTS();
    }
}

async function connectVTS() {
    if (state.vts.connecting || state.vts.connected) return;

    state.vts.connecting = true;
    updateVTSStatus('connecting');

    try {
        const response = await fetch('/vts/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            state.vts.connected = true;
            updateVTSStatus('connected');
            console.log('[VTS] Connected to VTube Studio');
        } else {
            state.vts.connected = false;
            updateVTSStatus('error', data.message || 'Connection failed');
            console.error('[VTS] Connection failed:', data.message);
        }
    } catch (error) {
        state.vts.connected = false;
        updateVTSStatus('error', 'Connection error');
        console.error('[VTS] Connection error:', error);
    } finally {
        state.vts.connecting = false;
    }
}

async function disconnectVTS() {
    if (!state.vts.connected) return;

    try {
        await fetch('/vts/disconnect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        state.vts.connected = false;
        updateVTSStatus('disconnected');
        console.log('[VTS] Disconnected from VTube Studio');
    } catch (error) {
        console.error('[VTS] Disconnect error:', error);
    }
}

function updateVTSStatus(status, message = null) {
    if (!elements.vtsStatus) return;

    const indicator = elements.vtsStatus.querySelector('.status-indicator');
    const text = elements.vtsStatus.querySelector('.status-text');

    if (!indicator || !text) return;

    // Remove all status classes
    indicator.classList.remove('connected', 'disconnected', 'connecting', 'error');

    switch (status) {
        case 'connected':
            indicator.classList.add('connected');
            text.textContent = 'Disambung';
            break;
        case 'connecting':
            indicator.classList.add('connecting');
            text.textContent = 'Menyambung...';
            break;
        case 'error':
            indicator.classList.add('error');
            text.textContent = message || 'Ralat';
            break;
        default:
            indicator.classList.add('disconnected');
            text.textContent = 'Tidak disambung';
    }
}

async function playLipSync(lipSyncData, audio, text = '') {
    if (!lipSyncData || lipSyncData.length === 0) return;
    if (!state.vts.connected) return;

    // Estimate token count from text (rough: ~4 chars per token for Malay/English)
    const estimatedTokens = text ? Math.ceil(text.length / 4) : 0;

    // Send the entire lip sync data to backend to play
    // This ensures proper timing and synchronization
    try {
        await fetch('/vts/play_lip_sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lip_sync: lipSyncData,
                text: text,
                token_count: estimatedTokens
            })
        });
    } catch (error) {
        console.error('[VTS] Error playing lip sync:', error);
    }
}

async function sendVTSMouthValue(value) {
    // Send individual mouth value to VTS via backend
    if (!state.vts.connected) return;

    try {
        await fetch('/vts/set_mouth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value: value })
        });
    } catch (error) {
        console.error('[VTS] Error setting mouth:', error);
    }
}

// Check VTS status on page load
async function checkVTSStatus() {
    if (!elements.vtsSettingsSection) return;

    try {
        const response = await fetch('/vts/status');
        const data = await response.json();

        if (data.enabled) {
            // Backend has VTS enabled, sync frontend state
            // If user previously enabled VTS in frontend, keep that preference
            const userEnabledVTS = localStorage.getItem('uitm-vts-enabled') === 'true';

            // Update toggle to reflect user preference
            if (elements.vtsToggle) {
                elements.vtsToggle.checked = userEnabledVTS;
            }

            // Update state
            state.vts.enabled = userEnabledVTS;
            state.vts.connected = data.connected;

            updateVTSStatus(data.connected ? 'connected' : 'disconnected');

            // If user had VTS enabled, try to connect
            if (userEnabledVTS && !data.connected) {
                connectVTS();
            }
        } else {
            // VTS not enabled on backend
            if (elements.vtsSettingsSection) {
                elements.vtsSettingsSection.style.display = 'none';
            }
        }
    } catch (error) {
        console.log('[VTS] Status check failed:', error);
    }
}

// ========================================
// GESTURE ANIMATION MODULE
// ========================================

/**
 * Trigger a specific gesture animation in VTube Studio.
 * Available gestures: wave_hello, nod_head_agree, explain_arm_gesture,
 *                     explain_hand_left, explain_hand_right, idle_waiting
 */
async function triggerVTSGesture(gestureName, force = false) {
    if (!state.vts.enabled || !state.vts.connected) {
        console.log('[Gesture] VTS not connected, cannot trigger gesture');
        return null;
    }

    try {
        const response = await fetch('/vts/trigger_gesture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gesture: gestureName, force: force })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`[Gesture] Triggered: ${gestureName}`);
        } else {
            console.log(`[Gesture] Failed to trigger: ${gestureName}`, data);
        }

        return data;
    } catch (error) {
        console.error('[Gesture] Error triggering gesture:', error);
        return null;
    }
}

/**
 * Detect intent from text and trigger appropriate gesture automatically.
 * Used when user sends a message.
 */
async function detectAndTriggerGesture(text, source = 'user') {
    if (!state.vts.enabled || !state.vts.connected) {
        return null;
    }

    try {
        const response = await fetch('/vts/detect_and_trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, source: source })
        });

        const data = await response.json();

        if (data.success && data.gesture) {
            console.log(`[Gesture] Auto-triggered: ${data.gesture} from ${source}`);
        }

        return data;
    } catch (error) {
        console.error('[Gesture] Error in detect and trigger:', error);
        return null;
    }
}

/**
 * Disable the explain_arm_gesture toggle.
 * Should be called after AI finishes explaining.
 */
async function disableExplainGesture() {
    if (!state.vts.enabled || !state.vts.connected) {
        return null;
    }

    try {
        const response = await fetch('/vts/disable_explain_gesture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            console.log('[Gesture] Explain gesture disabled');
        }

        return data;
    } catch (error) {
        console.error('[Gesture] Error disabling explain gesture:', error);
        return null;
    }
}

/**
 * Get gesture animator status.
 */
async function getGestureStatus() {
    try {
        const response = await fetch('/vts/gesture_status');
        return await response.json();
    } catch (error) {
        console.error('[Gesture] Error getting status:', error);
        return null;
    }
}

// ========================================
// AUDIO DEVICES MODULE
// ========================================

async function initializeAudioDevices() {
    try {
        // Request permission to access microphones
        await navigator.mediaDevices.getUserMedia({ audio: true });

        // Populate the microphone list
        await populateMicrophoneList();
    } catch (error) {
        console.log('Microphone permission not granted or not available:', error);
        elements.microphoneSelect.innerHTML = '<option value="">Tiada kebenaran mikrofon</option>';
    }
}

async function populateMicrophoneList() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        // Clear current options
        elements.microphoneSelect.innerHTML = '<option value="">Pilih mikrofon...</option>';

        // Add devices
        audioInputs.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Mikrofon ${index + 1}`;

            // Select saved device
            if (device.deviceId === state.audio.selectedDevice) {
                option.selected = true;
            }

            elements.microphoneSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error enumerating devices:', error);
    }
}

function handleMicrophoneSelect(event) {
    const deviceId = event.target.value;
    state.audio.selectedDevice = deviceId || null;

    if (deviceId) {
        localStorage.setItem('uitm-selected-mic', deviceId);
    } else {
        localStorage.removeItem('uitm-selected-mic');
    }
}

async function testMicrophone() {
    try {
        const constraints = {
            audio: state.audio.selectedDevice
                ? { deviceId: { exact: state.audio.selectedDevice } }
                : true
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        // Visual feedback
        elements.testMicBtn.innerHTML = '<i data-lucide="volume-2"></i> Sedang uji...';
        lucide.createIcons();

        // Stop after 2 seconds
        setTimeout(() => {
            stream.getTracks().forEach(track => track.stop());
            elements.testMicBtn.innerHTML = '<i data-lucide="check"></i> Mikrofon OK';
            lucide.createIcons();

            setTimeout(() => {
                elements.testMicBtn.innerHTML = '<i data-lucide="volume-2"></i> Uji Mikrofon';
                lucide.createIcons();
            }, 2000);
        }, 2000);
    } catch (error) {
        console.error('Microphone test failed:', error);
        elements.testMicBtn.innerHTML = '<i data-lucide="x"></i> Ralat';
        lucide.createIcons();

        setTimeout(() => {
            elements.testMicBtn.innerHTML = '<i data-lucide="volume-2"></i> Uji Mikrofon';
            lucide.createIcons();
        }, 2000);
    }
}

// ========================================
// AUDIO RECORDING MODULE
// ========================================

async function startAudioRecording() {
    try {
        // Get microphone stream
        const constraints = {
            audio: state.audio.selectedDevice
                ? { deviceId: { exact: state.audio.selectedDevice } }
                : true
        };

        state.audio.stream = await navigator.mediaDevices.getUserMedia(constraints);

        // Create MediaRecorder
        state.audio.mediaRecorder = new MediaRecorder(state.audio.stream, {
            mimeType: 'audio/webm'
        });

        state.audio.audioChunks = [];

        // Handle data available
        state.audio.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                state.audio.audioChunks.push(event.data);
            }
        };

        // Handle recording stop
        state.audio.mediaRecorder.onstop = handleRecordingStop;

        // Start recording
        state.audio.mediaRecorder.start(100); // Collect data every 100ms
        state.audio.isRecording = true;

        // Update UI
        enterRecordingMode();

        // Notify remote devices (Master mode)
        if (state.remote.role === 'master' && state.remote.socket) {
            state.remote.socket.emit('master_recording_state', {
                isRecording: true,
                room: state.remote.room
            });
        }

        // Auto-stop after 30 seconds (prevent long recordings)
        setTimeout(() => {
            if (state.audio.isRecording) {
                stopAudioRecording();
            }
        }, 30000);

    } catch (error) {
        console.error('Error starting audio recording:', error);
        elements.inputHint.textContent = 'Tidak dapat mengakses mikrofon. Pastikan kebenaran diberi.';
    }
}

function stopAudioRecording() {
    if (state.audio.mediaRecorder && state.audio.mediaRecorder.state !== 'inactive') {
        state.audio.mediaRecorder.stop();
    }

    if (state.audio.stream) {
        state.audio.stream.getTracks().forEach(track => track.stop());
    }

    state.audio.isRecording = false;

    // Notify remote devices (Master mode)
    if (state.remote.role === 'master' && state.remote.socket) {
        state.remote.socket.emit('master_recording_state', {
            isRecording: false,
            room: state.remote.room
        });
    }
}

async function handleRecordingStop() {
    if (state.audio.audioChunks.length === 0) {
        exitRecordingMode();
        return;
    }

    // Create blob from chunks
    const audioBlob = new Blob(state.audio.audioChunks, { type: 'audio/webm' });

    // Convert to base64
    const base64Audio = await blobToBase64(audioBlob);

    // Show sending state
    elements.inputHint.textContent = 'Menghantar audio...';

    // Send as multimodal message
    await sendAudioMessage(base64Audio);

    // Clear chunks
    state.audio.audioChunks = [];

    exitRecordingMode();
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Get base64 string without data URL prefix
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function showSendingVoiceState() {
    elements.inputContainer.classList.remove('voice-mode');
    elements.inputContainer.classList.add('sending-voice');
    elements.micButton.classList.remove('active');
    elements.inputHint.textContent = 'Menghantar audio ke AI...';
}

function hideSendingVoiceState() {
    elements.inputContainer.classList.remove('sending-voice');
    elements.inputHint.textContent = 'Tekan Enter untuk hantar, Shift+Enter untuk baris baru';
}

async function sendAudioMessage(base64Audio) {
    // Show sending state
    showSendingVoiceState();

    // Disable input while sending
    elements.sendButton.disabled = true;

    // Add user message to UI with voice indicator
    addMessage('user', '[Mesej Suara]', null, false, null, true);

    // Save user message to state (with isVoice flag for remote sync)
    state.messages.push({ role: 'user', content: '[Mesej Suara]', isVoice: true });

    // Sync user message to remote devices (Master mode)
    if (state.remote.role === 'master' && state.remote.socket && state.remote.connected) {
        state.remote.socket.emit('master_chat_update', {
            messages: state.messages,
            room: state.remote.room
        });
        console.log('[Remote/Master] Synced voice message to remote devices');
    }

    try {
        // Step 1: Transcribe audio using dedicated transcription endpoint
        console.log('[Voice] Transcribing audio...');
        elements.inputHint.textContent = 'Mentranskripsi audio...';

        const transcribeResponse = await fetch('/transcribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio: base64Audio,
                format: 'webm'
            })
        });

        if (!transcribeResponse.ok) {
            throw new Error(`Transcription failed: ${transcribeResponse.status}`);
        }

        const transcribeResult = await transcribeResponse.json();

        if (!transcribeResult.success || !transcribeResult.text) {
            throw new Error('No transcription returned');
        }

        const transcribedText = transcribeResult.text;
        console.log('[Voice] Transcribed:', transcribedText);

        // Step 2: Send transcribed text through normal chat flow (with RAG)
        elements.inputHint.textContent = 'Menghantar ke AI...';

        // Update the message in state with actual transcribed text
        // This is what the API will receive (RAG will work now!)
        state.messages[state.messages.length - 1] = {
            role: 'user',
            content: transcribedText,
            isVoice: true
        };

        // Store transcribed text for gesture triggering when TTS starts
        // This enables wave_hello detection for greetings like "hello", "hai", "hi"
        state.lastUserMessage = transcribedText;

        // Send to API using normal flow (RAG enabled!)
        await sendToAPI();

    } catch (error) {
        console.error('Error processing audio message:', error);
        addErrorMessage('Ralat memproses mesej audio. Sila cuba lagi.');
    }

    // Hide sending state
    hideSendingVoiceState();
    elements.sendButton.disabled = false;
}

// Modified sendToAPI that accepts a pre-built message
async function sendToAPIWithMessage(message) {
    try {
        state.isTyping = true;
        showTypingIndicator();

        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [...state.messages, message],
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

        state.currentReasoning = '';
        state.currentContent = '';
        state.ragUsed = false;  // Reset RAG flag for new message

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                const dataStr = line.slice(6).trim();
                if (dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    processStreamData(data);
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }

        finalizeResponse();

    } catch (error) {
        console.error('API Error:', error);
        addErrorMessage('Maaf, terdapat ralat semasa berkomunikasi dengan AI. Sila cuba lagi.');
        finalizeResponse();
    }
}

function enterRecordingMode() {
    elements.inputContainer.classList.add('voice-mode');
    elements.micButton.classList.add('active');
    elements.inputHint.textContent = 'Merakam... ketuk mic untuk berhenti';
    elements.messageInput.placeholder = 'Merakam audio...';
}

function exitRecordingMode() {
    elements.inputContainer.classList.remove('voice-mode');
    elements.micButton.classList.remove('active');
    elements.inputHint.textContent = 'Tekan Enter untuk hantar, Shift+Enter untuk baris baru';
    elements.messageInput.placeholder = 'Taip mesej anda di sini...';
}

// Expose toggleReasoning to global scope for onclick handlers
window.toggleReasoning = toggleReasoning;

// ========================================
// REMOTE CONTROL FUNCTIONS
// ========================================

/**
 * Initialize remote control functionality.
 */
function initializeRemoteControl() {
    // Set initial role from localStorage
    const savedRole = state.remote.role;
    updateRoleUI(savedRole);

    // Add event listeners for role buttons
    if (elements.roleStandalone) {
        elements.roleStandalone.addEventListener('click', () => setDeviceRole('standalone'));
    }
    if (elements.roleMaster) {
        elements.roleMaster.addEventListener('click', () => setDeviceRole('master'));
    }
    if (elements.roleRemote) {
        elements.roleRemote.addEventListener('click', () => setDeviceRole('remote'));
    }

    // Join session button
    if (elements.joinSessionBtn) {
        elements.joinSessionBtn.addEventListener('click', joinRemoteSession);
    }

    // Copy session code button
    if (elements.copySessionCode) {
        elements.copySessionCode.addEventListener('click', copySessionCodeToClipboard);
    }

    // Session code input - auto uppercase
    if (elements.sessionCodeInput) {
        elements.sessionCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
        elements.sessionCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinRemoteSession();
            }
        });
        // Prevent touch events from propagating to parent elements
        elements.sessionCodeInput.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });
        elements.sessionCodeInput.addEventListener('touchend', (e) => {
            e.stopPropagation();
        }, { passive: true });
        // Ensure focus is maintained on touch
        elements.sessionCodeInput.addEventListener('focus', (e) => {
            e.stopPropagation();
        });
    }

    console.log('[Remote] Initialized with role:', savedRole);
}

/**
 * Set device role and update UI.
 * @param {string} role - 'standalone', 'master', or 'remote'
 */
function setDeviceRole(role) {
    console.log('[Remote] Setting role to:', role);

    // Disconnect current socket if exists
    if (state.remote.socket) {
        state.remote.socket.disconnect();
        state.remote.socket = null;
        state.remote.connected = false;
    }

    state.remote.role = role;
    localStorage.setItem('uitm-remote-role', role);

    updateRoleUI(role);

    // Connect based on role
    if (role === 'master') {
        connectAsMaster();
    } else if (role === 'remote') {
        showJoinSessionUI();
    }
}

/**
 * Update UI based on current role.
 * @param {string} role - Current role
 */
function updateRoleUI(role) {
    // Update role buttons
    document.querySelectorAll('.role-option').forEach(btn => {
        btn.classList.remove('active');
    });

    const activeBtn = document.getElementById(`role${role.charAt(0).toUpperCase() + role.slice(1)}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Show/hide appropriate containers
    if (elements.sessionCodeContainer) {
        elements.sessionCodeContainer.style.display = (role === 'master' && state.remote.sessionCode) ? 'block' : 'none';
    }
    if (elements.joinSessionContainer) {
        elements.joinSessionContainer.style.display = role === 'remote' ? 'flex' : 'none';
    }
}

/**
 * Connect as Master device.
 */
function connectAsMaster() {
    console.log('[Remote] Connecting as Master...');

    updateRemoteStatus('connecting', 'Menyambung...');

    // Generate session code
    const sessionCode = generateSessionCode();
    state.remote.sessionCode = sessionCode;
    state.remote.room = sessionCode;

    // Connect to WebSocket
    connectWebSocket(() => {
        // Emit join session as master
        state.remote.socket.emit('join_session', {
            room: sessionCode,
            role: 'master'
        });

        // Update UI
        if (elements.sessionCode) {
            elements.sessionCode.textContent = sessionCode;
        }
        if (elements.sessionCodeContainer) {
            elements.sessionCodeContainer.style.display = 'block';
        }

        updateRemoteStatus('connected', 'Disambung (Master)');
        console.log('[Remote] Connected as Master with code:', sessionCode);
    });
}

/**
 * Show join session UI for remote device.
 */
function showJoinSessionUI() {
    updateRemoteStatus('disconnected', 'Masukkan kod sesi');
    if (elements.joinSessionContainer) {
        elements.joinSessionContainer.style.display = 'flex';
    }
    if (elements.sessionCodeInput) {
        elements.sessionCodeInput.focus();
    }
}

/**
 * Join a remote session as Remote device.
 */
function joinRemoteSession() {
    const code = elements.sessionCodeInput?.value.trim().toUpperCase();

    if (!code || code.length !== 6) {
        alert('Sila masukkan kod sesi 6 aksara');
        return;
    }

    console.log('[Remote] Joining session with code:', code);

    updateRemoteStatus('connecting', 'Menyambung...');

    state.remote.room = code;

    // Connect to WebSocket
    connectWebSocket(() => {
        // Emit join session as remote
        state.remote.socket.emit('join_session', {
            room: code,
            role: 'remote'
        });

        // Update status after successful join
        updateRemoteStatus('connected', 'Disambung (Remote)');
        console.log('[Remote] Joined session:', code);

        console.log('[Remote] Joined session:', code);
    });
}

/**
 * Connect to WebSocket server.
 * @param {Function} callback - Called when connected
 */
function connectWebSocket(callback) {
    if (state.remote.socket && state.remote.socket.connected) {
        callback();
        return;
    }

    try {
        state.remote.socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });

        state.remote.socket.on('connect', () => {
            console.log('[Remote] WebSocket connected');
            state.remote.connected = true;
            callback();
            // Re-register detection listeners on reconnect
            setupDetectionSocketListeners();
        });

        state.remote.socket.on('disconnect', () => {
            console.log('[Remote] WebSocket disconnected');
            state.remote.connected = false;
            updateRemoteStatus('disconnected', 'Terputus');
        });

        state.remote.socket.on('connect_error', (error) => {
            console.error('[Remote] WebSocket error:', error);
            updateRemoteStatus('error', 'Ralat sambungan');
        });

        // --- Master events ---
        state.remote.socket.on('master_receive_message', handleMasterReceiveMessage);
        state.remote.socket.on('master_start_recording', handleMasterStartRecording);
        state.remote.socket.on('master_stop_recording', handleMasterStopRecording);

        // --- Remote events ---
        state.remote.socket.on('remote_receive_transcribed', handleRemoteReceiveTranscribed);
        state.remote.socket.on('remote_chat_update', handleRemoteChatUpdate);
        state.remote.socket.on('remote_ai_response_start', handleRemoteAIResponseStart);
        state.remote.socket.on('remote_ai_response_chunk', handleRemoteAIResponseChunk);
        state.remote.socket.on('remote_ai_response_end', handleRemoteAIResponseEnd);
        state.remote.socket.on('remote_recording_state', handleRemoteRecordingState);

        // --- Device events ---
        state.remote.socket.on('device_joined', handleDeviceJoined);
        state.remote.socket.on('device_disconnected', handleDeviceDisconnected);
        state.remote.socket.on('device_list', handleDeviceList);

    } catch (error) {
        console.error('[Remote] Failed to connect WebSocket:', error);
        updateRemoteStatus('error', 'Ralat sambungan');
    }
}

/**
 * Update remote status indicator.
 * @param {string} status - 'connected', 'connecting', 'disconnected', 'error'
 * @param {string} text - Status text to display
 */
function updateRemoteStatus(status, text) {
    if (!elements.remoteStatus) return;

    const indicator = elements.remoteStatus.querySelector('.status-indicator');
    const statusText = elements.remoteStatus.querySelector('.status-text');

    if (indicator) {
        indicator.className = 'status-indicator ' + status;
    }
    if (statusText) {
        statusText.textContent = text;
    }
}

/**
 * Generate a 6-character session code.
 * @returns {string} Session code
 */
function generateSessionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: I, O, 0, 1
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Copy session code to clipboard.
 */
async function copySessionCodeToClipboard() {
    if (!state.remote.sessionCode) return;

    try {
        await navigator.clipboard.writeText(state.remote.sessionCode);

        // Visual feedback
        const btn = elements.copySessionCode;
        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check"></i>';
        lucide.createIcons();

        setTimeout(() => {
            btn.innerHTML = originalIcon;
            lucide.createIcons();
        }, 2000);

        console.log('[Remote] Session code copied');
    } catch (error) {
        console.error('[Remote] Failed to copy:', error);
    }
}

// ========================================
// MASTER EVENT HANDLERS
// ========================================

/**
 * Handle message received from remote device.
 * @param {Object} data - Message data
 */
function handleMasterReceiveMessage(data) {
    if (state.remote.role !== 'master') return;

    console.log('[Remote/Master] Received message from remote:', data.message);

    // Set message input and trigger send
    elements.messageInput.value = data.message;
    sendMessage();
}

/**
 * Handle start recording request from remote device.
 * @param {Object} data - Request data
 */
function handleMasterStartRecording(data) {
    if (state.remote.role !== 'master') return;

    console.log('[Remote/Master] Start recording requested');

    // Trigger mic button click
    if (elements.micButton && !state.audio.isRecording) {
        elements.micButton.click();
    }
}

/**
 * Handle stop recording request from remote device.
 * @param {Object} data - Request data
 */
function handleMasterStopRecording(data) {
    if (state.remote.role !== 'master') return;

    console.log('[Remote/Master] Stop recording requested');

    // Trigger mic button click to stop
    if (elements.micButton && state.audio.isRecording) {
        elements.micButton.click();
    }
}

// ========================================
// REMOTE EVENT HANDLERS
// ========================================

/**
 * Handle transcribed text received from master.
 * @param {Object} data - Transcribed data
 */
function handleRemoteReceiveTranscribed(data) {
    if (state.remote.role !== 'remote') return;

    console.log('[Remote/Remote] Received transcribed text:', data.text);

    // Show in input
    elements.messageInput.value = data.text;
}

/**
 * Handle chat update from master.
 * @param {Object} data - Chat data
 */
function handleRemoteChatUpdate(data) {
    if (state.remote.role !== 'remote') return;

    console.log('[Remote/Remote] Received chat update, messages:', data.messages?.length);

    // Update messages
    if (data.messages && data.messages.length > 0) {
        // Check if we have new messages (AI response)
        const currentLength = state.messages.length;
        const newLength = data.messages.length;

        if (newLength > currentLength) {
            // We have new messages - likely the AI response
            state.messages = data.messages;

            // Clear and re-render all messages
            elements.messagesArea.innerHTML = '';
            data.messages.forEach(msg => {
                // Check if this is a voice message
                const isVoice = msg.isVoice || msg.content === '[Mesej Suara]';
                addMessage(msg.role, msg.content, msg.reasoning, msg.ragUsed, null, isVoice);
            });
            scrollToBottom();

            // Hide typing indicator since we have the response
            hideTypingIndicator();
        }
    }
}

/**
 * Handle AI response start from master.
 * @param {Object} data - Response data
 */
function handleRemoteAIResponseStart(data) {
    if (state.remote.role !== 'remote') return;

    console.log('[Remote/Remote] AI response starting');

    state.isTyping = true;
    state.currentContent = '';
    state.currentReasoning = '';

    // Show typing indicator
    showTypingIndicator();
}

/**
 * Handle AI response chunk from master.
 * @param {Object} data - Chunk data
 */
function handleRemoteAIResponseChunk(data) {
    if (state.remote.role !== 'remote') return;

    // Append content
    state.currentContent += data.chunk || '';

    // Update typing indicator with content
    updateTypingMessage(state.currentContent);
}

/**
 * Handle AI response end from master.
 */
function handleRemoteAIResponseEnd() {
    if (state.remote.role !== 'remote') return;

    console.log('[Remote/Remote] AI response ended');

    state.isTyping = false;

    // Just hide typing indicator - the final chat state will come via master_chat_update
    hideTypingIndicator();

    // Reset content state (don't call finalizeResponse as it plays TTS and adds to state)
    state.currentContent = '';
    state.currentReasoning = '';
    state.structuredResponse = null;
    state.ragUsed = false;
}

/**
 * Handle recording state change from master.
 * @param {Object} data - Recording state data
 */
function handleRemoteRecordingState(data) {
    if (state.remote.role !== 'remote') return;

    console.log('[Remote/Remote] Recording state:', data.isRecording ? 'recording' : 'stopped');

    // Update remote recording state
    state.remote.isRemoteRecording = data.isRecording;

    if (data.isRecording) {
        // Show recording UI on remote device
        enterRecordingMode();
    } else {
        // Hide recording UI on remote device
        exitRecordingMode();
    }
}

// ========================================
// DEVICE EVENT HANDLERS
// ========================================

function handleDeviceJoined(data) {
    console.log('[Remote] Device joined:', data.role);
}

function handleDeviceDisconnected(data) {
    console.log('[Remote] Device disconnected:', data.role);
}

function handleDeviceList(data) {
    console.log('[Remote] Device list:', data.devices);
    state.remote.devices = data.devices;
}

// ========================================
// HUMAN DETECTION
// ========================================

async function initializeDetection() {
    // Check if detection is available on the server
    try {
        const response = await fetch('/detection/status');
        const data = await response.json();

        state.detection.available = data.available || false;
        state.detection.running = data.running || false;
        state.detection.autoGreet = data.auto_greet !== false;

        if (data.available) {
            // Show detection settings section
            if (elements.detectionSettingsSection) {
                elements.detectionSettingsSection.style.display = 'block';
            }

            // Update toggle state
            if (elements.detectionToggle) {
                elements.detectionToggle.checked = data.running;
            }
            if (elements.detectionAutoGreetToggle) {
                elements.detectionAutoGreetToggle.checked = state.detection.autoGreet;
            }

            // Update UI based on running state
            updateDetectionUI(data.running);

            // Update stats if running
            if (data.running) {
                updateDetectionStats(data);
            }

            // Fetch available cameras
            await fetchAvailableCameras();

            console.log('[Detection] Available, running:', data.running);
        } else {
            console.log('[Detection] Not available on server');
        }
    } catch (e) {
        console.log('[Detection] Could not check status:', e);
    }

    // Camera refresh button
    if (elements.detectionCameraRefresh) {
        elements.detectionCameraRefresh.addEventListener('click', fetchAvailableCameras);
    }

    // Setup SocketIO listeners for detection events
    setupDetectionSocketListeners();
}

async function fetchAvailableCameras() {
    if (!elements.detectionCameraSelect) return;

    elements.detectionCameraSelect.innerHTML = '<option value="">Mengimbas kamera...</option>';

    try {
        const response = await fetch('/detection/cameras');
        const data = await response.json();

        elements.detectionCameraSelect.innerHTML = '';

        if (data.cameras && data.cameras.length > 0) {
            data.cameras.forEach(cam => {
                const opt = document.createElement('option');
                opt.value = cam.index;
                opt.textContent = `${cam.name} (${cam.resolution})`;
                elements.detectionCameraSelect.appendChild(opt);
            });
            console.log('[Detection] Found', data.cameras.length, 'camera(s)');
        } else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Tiada kamera dijumpai';
            elements.detectionCameraSelect.appendChild(opt);
        }
    } catch (e) {
        console.error('[Detection] Camera scan error:', e);
        elements.detectionCameraSelect.innerHTML = '<option value="">Ralat mengimbas kamera</option>';
    }

    lucide.createIcons();
}

function setupDetectionSocketListeners() {
    if (!state.remote.socket) return;

    state.remote.socket.on('detection_person_enter', (data) => {
        console.log('[Detection] Person entered:', data.count);
        state.detection.personCount = data.count;
        if (elements.detectionCurrentCount) {
            elements.detectionCurrentCount.textContent = data.count;
        }
        addDetectionNotification('Pelawat dikesan!', `${data.count} orang memasuki kawasan`, 'enter');
    });

    state.remote.socket.on('detection_person_exit', (data) => {
        console.log('[Detection] Person exited');
        state.detection.personCount = 0;
        if (elements.detectionCurrentCount) {
            elements.detectionCurrentCount.textContent = '0';
        }
    });

    state.remote.socket.on('detection_greeting_trigger', (data) => {
        console.log('[Detection] Greeting triggered for', data.visitor_count, 'visitor(s)');

        // Show greeting as chat message
        const greetingText = data.message || 'Assalamualaikum dan selamat datang!';
        addMessage('assistant', greetingText);

        // Trigger TTS if enabled
        if (state.ttsEnabled) {
            playTTS(greetingText);
        }
    });
}

async function handleDetectionToggle(e) {
    const enabled = e.target.checked;

    if (enabled) {
        // Start detection with selected camera
        try {
            const cameraIndex = elements.detectionCameraSelect
                ? parseInt(elements.detectionCameraSelect.value) || 0
                : 0;

            const response = await fetch('/detection/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ camera_index: cameraIndex })
            });
            const data = await response.json();

            if (data.status === 'started' || data.status === 'already_running') {
                state.detection.running = true;
                state.detection.enabled = true;
                localStorage.setItem('uitm-detection-enabled', 'true');
                updateDetectionUI(true);

                // Start polling stats
                startDetectionStatsPolling();

                console.log('[Detection] Started on camera', data.camera_index);
            } else {
                console.error('[Detection] Failed to start:', data.error);
                e.target.checked = false;
                addDetectionNotification('Ralat', data.error || 'Gagal memulakan pengesan', 'error');
            }
        } catch (err) {
            console.error('[Detection] Start error:', err);
            e.target.checked = false;
            addDetectionNotification('Ralat', 'Sambungan gagal', 'error');
        }
    } else {
        // Stop detection
        try {
            await fetch('/detection/stop', { method: 'POST' });
            state.detection.running = false;
            state.detection.enabled = false;
            localStorage.setItem('uitm-detection-enabled', 'false');
            updateDetectionUI(false);
            stopDetectionStatsPolling();
            console.log('[Detection] Stopped');
        } catch (err) {
            console.error('[Detection] Stop error:', err);
        }
    }
}

function handleDetectionAutoGreetToggle(e) {
    state.detection.autoGreet = e.target.checked;
    console.log('[Detection] Auto-greet:', state.detection.autoGreet);

    // Update server config
    fetch('/detection/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_greet: state.detection.autoGreet })
    }).catch(e => console.error('[Detection] Config error:', e));
}

async function handleDetectionManualGreet() {
    const greetingText = 'Assalamualaikum dan selamat datang ke UiTM Kampus Tapah! Bagaimana saya boleh membantu anda hari ini?';

    // Show message in chat immediately
    addMessage('assistant', greetingText);

    // Play TTS
    playTTS(greetingText);

    // Also notify backend (resets cooldown, etc.)
    try {
        await fetch('/detection/greet', { method: 'POST' });
    } catch (err) {
        console.error('[Detection] Manual greet error:', err);
    }
}

function updateDetectionUI(running) {
    // Disable camera selector while running
    if (elements.detectionCameraSelect) {
        elements.detectionCameraSelect.disabled = running;
    }
    if (elements.detectionCameraRefresh) {
        elements.detectionCameraRefresh.disabled = running;
    }

    if (elements.detectionStatus) {
        elements.detectionStatus.style.display = 'block';
        const indicator = elements.detectionStatus.querySelector('.status-indicator');
        const text = elements.detectionStatus.querySelector('.status-text');
        if (indicator) {
            indicator.className = 'status-indicator ' + (running ? 'connected' : 'disconnected');
        }
        if (text) {
            text.textContent = running ? 'Aktif' : 'Tidak aktif';
        }
    }

    if (elements.detectionStats) {
        elements.detectionStats.style.display = running ? 'block' : 'none';
    }

    if (elements.detectionPreview) {
        elements.detectionPreview.style.display = running ? 'block' : 'none';
        if (running && elements.detectionStreamImg) {
            // Use single-frame endpoint with polling for better compatibility
            elements.detectionStreamImg.src = '/detection/frame?' + Date.now();
        } else if (elements.detectionStreamImg) {
            elements.detectionStreamImg.src = '';
        }
    }

    if (elements.detectionAutoGreetContainer) {
        elements.detectionAutoGreetContainer.style.display = running ? 'flex' : 'none';
    }

    if (elements.detectionGreetBtn) {
        elements.detectionGreetBtn.style.display = running ? 'flex' : 'none';
    }
}

function updateDetectionStats(data) {
    if (elements.detectionCurrentCount) {
        elements.detectionCurrentCount.textContent = data.person_count || data.stats?.current_count || 0;
    }
    if (elements.detectionSessionCount) {
        elements.detectionSessionCount.textContent = data.stats?.session_count || 0;
    }
    if (elements.detectionFps) {
        elements.detectionFps.textContent = data.fps || 0;
    }
}

let detectionStatsInterval = null;
let detectionFrameInterval = null;

function startDetectionStatsPolling() {
    stopDetectionStatsPolling();

    // Poll stats every 2 seconds
    detectionStatsInterval = setInterval(async () => {
        if (!state.detection.running) return;
        try {
            const response = await fetch('/detection/status');
            const data = await response.json();
            if (data.running) {
                updateDetectionStats(data);

                // Check for pending greeting from auto-detection
                if (data.stats && data.stats.pending_greeting) {
                    const greetingText = data.stats.pending_greeting;
                    addMessage('assistant', greetingText);
                    playTTS(greetingText);
                }
            } else {
                state.detection.running = false;
                updateDetectionUI(false);
                stopDetectionStatsPolling();
                if (elements.detectionToggle) {
                    elements.detectionToggle.checked = false;
                }
            }
        } catch (e) {
            // Silent fail - network may be temporarily unavailable
        }
    }, 2000);

    // Update preview frame at 1 FPS — only when settings modal is open
    let frameLoading = false;
    detectionFrameInterval = setInterval(() => {
        if (!state.detection.running || !elements.detectionStreamImg) return;
        if (!state.settings.isOpen) return; // Don't load when modal hidden
        if (frameLoading) return; // Skip if previous request still pending
        frameLoading = true;
        const img = new Image();
        img.onload = () => {
            elements.detectionStreamImg.src = img.src;
            frameLoading = false;
        };
        img.onerror = () => {
            frameLoading = false;
        };
        img.src = '/detection/frame?' + Date.now();
    }, 1000);
}

function stopDetectionStatsPolling() {
    if (detectionStatsInterval) {
        clearInterval(detectionStatsInterval);
        detectionStatsInterval = null;
    }
    if (detectionFrameInterval) {
        clearInterval(detectionFrameInterval);
        detectionFrameInterval = null;
    }
}

function addDetectionNotification(title, message, type) {
    // Add a notification message to chat
    const notificationHtml = `
        <div class="message system-message detection-notification ${type}">
            <div class="message-content">
                <div class="notification-badge">
                    <i data-lucide="${type === 'enter' ? 'user' : type === 'greet' ? 'hand' : 'alert-circle'}"></i>
                    <span class="notification-title">${title}</span>
                </div>
                <span class="notification-text">${message}</span>
            </div>
        </div>
    `;

    elements.messagesArea.insertAdjacentHTML('beforeend', notificationHtml);
    lucide.createIcons();
    scrollToBottom();
}

// ========================================
// OVERRIDDEN FUNCTIONS FOR REMOTE MODE
// ========================================

// Store original sendMessage function
const originalSendMessage = sendMessage;

/**
 * Override sendMessage to handle remote mode.
 */
sendMessage = function() {
    if (state.remote.role === 'remote' && state.remote.socket) {
        // Remote mode: send message to master
        const message = elements.messageInput.value.trim();
        if (message) {
            console.log('[Remote] Sending message to master');

            // Add user message to local state immediately for feedback
            addMessage('user', message);
            state.messages.push({ role: 'user', content: message });

            // Send to master
            state.remote.socket.emit('remote_message', {
                message: message,
                room: state.remote.room
            });
            elements.messageInput.value = '';

            // Show typing indicator while waiting for AI
            showTypingIndicator();
        }
        return;
    }

    // Standalone or Master mode: use original
    originalSendMessage();
};

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
