// ZeroClaw Web Chat - 主要聊天逻辑

class ZeroClawChat {
    constructor() {
        // 配置
        this.gatewayUrl = localStorage.getItem('gatewayUrl') || 'http://localhost:8190';
        this.token = localStorage.getItem('token') || '';
        this.sessionId = this.getOrCreateSessionId();
        
        // WebSocket 连接
        this.ws = null;
        this.isConnected = false;
        this.isTyping = false;
        
        // 消息状态
        this.messages = [];
        this.pendingContent = '';
        this.pendingThinking = '';
        this.capturedThinking = '';
        this.streamingContent = '';
        this.streamingThinking = '';
        
        // DOM 元素
        this.messagesWrapper = document.getElementById('messagesWrapper');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.welcomeMessage = document.getElementById('welcomeMessage');
        
        // 初始化
        this.init();
    }
    
    init() {
        this.loadMessages();
        this.setupEventListeners();
        this.connect();
    }
    
    // 获取或创建会话 ID
    getOrCreateSessionId() {
        let sessionId = sessionStorage.getItem('zeroclaw_session_id');
        if (!sessionId) {
            sessionId = this.generateUUID();
            sessionStorage.setItem('zeroclaw_session_id', sessionId);
        }
        return sessionId;
    }
    
    // 生成 UUID
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    // 设置事件监听
    setupEventListeners() {
        // 发送按钮
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // 输入框键盘事件
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // 自动调整文本框高度
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 150) + 'px';
        });
        
        // 清空聊天
        document.getElementById('clearChatBtn').addEventListener('click', () => {
            if (confirm('确定要清空对话吗？')) {
                this.clearMessages();
            }
        });
        
        // 设置按钮
        const settingsBtn = document.getElementById('settingsBtn');
        settingsBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
            document.getElementById('gatewayUrl').value = this.gatewayUrl;
            document.getElementById('token').value = this.token;
            modal.show();
        });
        
        // 保存设置
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.gatewayUrl = document.getElementById('gatewayUrl').value;
            this.token = document.getElementById('token').value;
            localStorage.setItem('gatewayUrl', this.gatewayUrl);
            localStorage.setItem('token', this.token);
            bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
            this.reconnect();
        });
    }
    
    // 连接 WebSocket
    connect() {
        const wsUrl = this.gatewayUrl.replace(/^http/, 'ws');
        const params = new URLSearchParams();
        params.set('session_id', this.sessionId);
        if (this.token) {
            params.set('token', this.token);
        }
        
        const url = `${wsUrl}/ws/chat?${params.toString()}`;
        const protocols = ['zeroclaw.v1'];
        if (this.token) {
            protocols.push(`bearer.${this.token}`);
        }
        
        console.log('连接到:', url);
        this.ws = new WebSocket(url, protocols);
        
        this.ws.onopen = () => {
            console.log('WebSocket 连接已建立');
            this.setConnected(true);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (error) {
                console.error('解析消息失败:', error);
            }
        };
        
        this.ws.onclose = (event) => {
            console.log('WebSocket 连接已关闭:', event.code, event.reason);
            this.setConnected(false);
            
            // 自动重连
            if (event.code !== 1000 && event.code !== 1001) {
                setTimeout(() => {
                    console.log('尝试重连...');
                    this.connect();
                }, 3000);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket 错误:', error);
            this.setConnected(false);
        };
    }
    
    // 断开连接
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    
    // 重连
    reconnect() {
        this.disconnect();
        setTimeout(() => {
            this.connect();
        }, 500);
    }
    
    // 设置连接状态
    setConnected(connected) {
        this.isConnected = connected;
        
        if (connected) {
            this.statusDot.classList.remove('disconnected');
            this.statusDot.classList.add('connected');
            this.statusText.textContent = '已连接';
            this.messageInput.disabled = false;
            this.sendBtn.disabled = false;
        } else {
            this.statusDot.classList.remove('connected');
            this.statusDot.classList.add('disconnected');
            this.statusText.textContent = '已断开';
            this.messageInput.disabled = true;
            this.sendBtn.disabled = true;
        }
    }
    
    // 处理 WebSocket 消息
    handleMessage(msg) {
        switch (msg.type) {
            case 'session_start':
            case 'connected':
                console.log('会话已启动');
                break;
                
            case 'thinking':
                this.isTyping = true;
                this.pendingThinking += msg.content || '';
                this.updateStreaming();
                break;
                
            case 'chunk':
                this.isTyping = true;
                this.pendingContent += msg.content || '';
                this.updateStreaming();
                break;
                
            case 'chunk_reset':
                this.capturedThinking = this.pendingThinking;
                this.pendingContent = '';
                this.pendingThinking = '';
                this.streamingContent = '';
                this.streamingThinking = '';
                this.removeStreamingMessage();
                break;
                
            case 'message':
            case 'done': {
                const content = msg.full_response || msg.content || this.pendingContent;
                const thinking = this.capturedThinking || this.pendingThinking || undefined;
                
                if (content) {
                    this.addAgentMessage(content, thinking);
                }
                
                this.pendingContent = '';
                this.pendingThinking = '';
                this.capturedThinking = '';
                this.streamingContent = '';
                this.streamingThinking = '';
                this.isTyping = false;
                this.removeStreamingMessage();
                break;
            }
                
            case 'tool_call': {
                const toolName = msg.name || 'unknown';
                const toolArgs = msg.args;
                this.addToolCallMessage(toolName, toolArgs);
                break;
            }
                
            case 'tool_result': {
                this.updateToolCallOutput(msg.output || '');
                break;
            }
                
            case 'error':
                console.error('服务器错误:', msg.message);
                this.addAgentMessage(`❌ 错误: ${msg.message || '未知错误'}`);
                this.isTyping = false;
                this.pendingContent = '';
                this.pendingThinking = '';
                this.removeStreamingMessage();
                break;
        }
    }
    
    // 发送消息
    sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content || !this.isConnected || this.isTyping) return;
        
        // 添加用户消息
        this.addUserMessage(content);
        
        // 发送到服务器
        try {
            this.ws.send(JSON.stringify({ type: 'message', content }));
            this.isTyping = true;
            this.pendingContent = '';
            this.pendingThinking = '';
            this.showTypingIndicator();
        } catch (error) {
            console.error('发送消息失败:', error);
            this.addAgentMessage('❌ 发送消息失败，请检查连接');
        }
        
        // 清空输入框
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.messageInput.focus();
    }
    
    // 添加用户消息
    addUserMessage(content) {
        const message = {
            id: this.generateUUID(),
            role: 'user',
            content: content,
            timestamp: new Date()
        };
        
        this.messages.push(message);
        this.renderMessage(message);
        this.saveMessages();
        this.scrollToBottom();
    }
    
    // 添加 Agent 消息
    addAgentMessage(content, thinking = null) {
        const message = {
            id: this.generateUUID(),
            role: 'agent',
            content: content,
            thinking: thinking,
            markdown: true,
            timestamp: new Date()
        };
        
        this.messages.push(message);
        this.renderMessage(message);
        this.saveMessages();
        this.scrollToBottom();
    }
    
    // 添加工具调用消息
    addToolCallMessage(name, args) {
        const message = {
            id: this.generateUUID(),
            role: 'agent',
            content: `🔧 调用工具: ${name}`,
            toolCall: {
                name: name,
                args: args,
                output: undefined
            },
            timestamp: new Date()
        };
        
        this.messages.push(message);
        this.renderToolCallMessage(message);
        this.saveMessages();
        this.scrollToBottom();
    }
    
    // 更新工具调用输出
    updateToolCallOutput(output) {
        // 找到最后一个未完成的工具调用
        const lastToolMsg = [...this.messages].reverse().find(m => m.toolCall && m.toolCall.output === undefined);
        if (lastToolMsg) {
            lastToolMsg.toolCall.output = output;
            this.updateToolCallElement(lastToolMsg.id, output);
            this.saveMessages();
        }
    }
    
    // 更新流式内容显示
    updateStreaming() {
        this.streamingContent = this.pendingContent;
        this.streamingThinking = this.pendingThinking;
        this.updateStreamingMessage();
    }
    
    // 显示流式消息
    updateStreamingMessage() {
        let streamingEl = document.getElementById('streaming-message');
        
        if (!streamingEl) {
            streamingEl = document.createElement('div');
            streamingEl.id = 'streaming-message';
            streamingEl.className = 'message agent';
            streamingEl.innerHTML = `
                <div class="message-avatar">
                    <i class="bi bi-robot"></i>
                </div>
                <div class="message-content streaming-content">
                    <div class="thinking-section streaming-thinking" style="display: none;">
                        <div class="thinking-content"></div>
                    </div>
                    <div class="content-text"></div>
                </div>
            `;
            this.messagesWrapper.appendChild(streamingEl);
        }
        
        const thinkingSection = streamingEl.querySelector('.thinking-section');
        const thinkingContent = streamingEl.querySelector('.thinking-content');
        const contentText = streamingEl.querySelector('.content-text');
        
        if (this.streamingThinking) {
            thinkingSection.style.display = 'block';
            thinkingContent.textContent = this.streamingThinking;
        } else {
            thinkingSection.style.display = 'none';
        }
        
        if (this.streamingContent) {
            contentText.innerHTML = marked.parse(this.streamingContent);
        } else {
            contentText.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
        }
        
        this.scrollToBottom();
    }
    
    // 移除流式消息
    removeStreamingMessage() {
        const streamingEl = document.getElementById('streaming-message');
        if (streamingEl) {
            streamingEl.remove();
        }
    }
    
    // 显示打字指示器
    showTypingIndicator() {
        this.updateStreamingMessage();
    }
    
    // 渲染消息
    renderMessage(message) {
        // 隐藏欢迎消息
        if (this.welcomeMessage) {
            this.welcomeMessage.style.display = 'none';
        }
        
        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.role}`;
        messageEl.dataset.messageId = message.id;
        
        const avatarIcon = message.role === 'user' ? 'bi-person' : 'bi-robot';
        const timeStr = message.timestamp.toLocaleTimeString();
        
        let contentHtml = '';
        
        // 思考过程
        if (message.thinking) {
            contentHtml += `
                <div class="thinking-section">
                    <div class="thinking-summary" data-bs-toggle="collapse" data-bs-target="#thinking-${message.id}">
                        <i class="bi bi-lightbulb"></i>
                        <span>思考过程</span>
                        <i class="bi bi-chevron-down ms-auto"></i>
                    </div>
                    <div id="thinking-${message.id}" class="collapse">
                        <div class="thinking-content">${message.thinking}</div>
                    </div>
                </div>
            `;
        }
        
        // 工具调用
        if (message.toolCall) {
            contentHtml += this.renderToolCall(message.toolCall);
        } else if (message.markdown) {
            // Markdown 渲染
            contentHtml += `<div class="content-text">${marked.parse(message.content)}</div>`;
        } else {
            // 纯文本
            contentHtml += `<div class="content-text">${this.escapeHtml(message.content)}</div>`;
        }
        
        messageEl.innerHTML = `
            <div class="message-avatar">
                <i class="bi ${avatarIcon}"></i>
            </div>
            <div class="message-content">
                ${contentHtml}
                <div class="message-time">${timeStr}</div>
            </div>
        `;
        
        this.messagesWrapper.appendChild(messageEl);
        this.scrollToBottom();
    }
    
    // 渲染工具调用
    renderToolCall(toolCall) {
        let html = `
            <div class="tool-call-card">
                <div class="tool-call-header">
                    <i class="bi bi-wrench-adjustable"></i>
                    <span>${toolCall.name}</span>
                </div>
                <div class="tool-call-args">${this.escapeHtml(JSON.stringify(toolCall.args || {}))}</div>
        `;
        
        if (toolCall.output !== undefined) {
            html += `<div class="tool-call-output">${this.escapeHtml(toolCall.output.substring(0, 200))}${toolCall.output.length > 200 ? '...' : ''}</div>`;
        } else {
            html += `<div class="tool-call-output"><i class="bi bi-hourglass-split"></i> 执行中...</div>`;
        }
        
        html += '</div>';
        return html;
    }
    
    // 渲染工具调用消息
    renderToolCallMessage(message) {
        this.renderMessage(message);
    }
    
    // 更新工具调用元素
    updateToolCallElement(messageId, output) {
        const messageEl = this.messagesWrapper.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            const outputEl = messageEl.querySelector('.tool-call-output');
            if (outputEl) {
                outputEl.innerHTML = this.escapeHtml(output.substring(0, 200)) + (output.length > 200 ? '...' : '');
            }
        }
    }
    
    // 清空消息
    clearMessages() {
        this.messages = [];
        localStorage.removeItem(`zeroclaw_messages_${this.sessionId}`);
        
        // 清空 DOM
        const messageEls = this.messagesWrapper.querySelectorAll('.message');
        messageEls.forEach(el => el.remove());
        
        if (this.welcomeMessage) {
            this.welcomeMessage.style.display = 'flex';
        }
    }
    
    // 滚动到底部
    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
    
    // 保存消息到 localStorage
    saveMessages() {
        try {
            localStorage.setItem(`zeroclaw_messages_${this.sessionId}`, JSON.stringify(this.messages));
        } catch (error) {
            console.error('保存消息失败:', error);
        }
    }
    
    // 从 localStorage 加载消息
    loadMessages() {
        try {
            const saved = localStorage.getItem(`zeroclaw_messages_${this.sessionId}`);
            if (saved) {
                this.messages = JSON.parse(saved).map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));
                
                // 重新渲染
                if (this.messages.length > 0 && this.welcomeMessage) {
                    this.welcomeMessage.style.display = 'none';
                }
                
                this.messages.forEach(msg => this.renderMessage(msg));
            }
        } catch (error) {
            console.error('加载消息失败:', error);
        }
    }
    
    // HTML 转义
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.chat = new ZeroClawChat();
});
