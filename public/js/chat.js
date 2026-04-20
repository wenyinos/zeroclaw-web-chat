// ZeroClaw Web Chat - 主要聊天逻辑

class ZeroClawChat {
    constructor() {
        // 配置（优先从服务器 API 获取，其次 localStorage，最后默认值）
        this.gatewayUrl = null;  // 将从 /api/config 加载
        this.token = null;       // 将从 /api/config 加载
        this.sessionId = this.getOrCreateSessionId();
        this.accessKey = null;

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
        this.authContainer = document.getElementById('authContainer');
        this.chatContainer = document.getElementById('chatContainer');
        this.authForm = document.getElementById('authForm');
        this.accessKeyInput = document.getElementById('accessKeyInput');
        this.authError = document.getElementById('authError');
        this.authSubmitBtn = document.getElementById('authSubmitBtn');
        this.messagesWrapper = document.getElementById('messagesWrapper');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.welcomeMessage = document.getElementById('welcomeMessage');
        this.themeToggleBtn = document.getElementById('themeToggleBtn');

        // 初始化
        this.init();
    }

    init() {
        // 先加载服务器配置
        this.loadServerConfig().then(() => {
            // 检查是否已有访问密钥（优先 localStorage，其次 sessionStorage）
            const savedKey = localStorage.getItem('access_key') || sessionStorage.getItem('access_key');
            if (savedKey) {
                this.accessKey = savedKey;
                this.showChat();
            } else {
                this.showAuth();
            }
        });

        // 初始化主题
        this.initTheme();
    }

    // 从服务器加载配置
    async loadServerConfig() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();

            // 优先使用 localStorage 中用户自定义的值
            let savedGatewayUrl = localStorage.getItem('gatewayUrl');
            let savedToken = localStorage.getItem('token');

            // 自动修复旧的错误配置
            if (savedGatewayUrl && savedGatewayUrl.includes(':8190')) {
                console.log('⚠️ [配置] 检测到旧的错误配置 (:8190)，自动修复');
                localStorage.removeItem('gatewayUrl');
                savedGatewayUrl = null;
            }

            // 智能处理 Gateway URL
            let serverGatewayUrl = config.gatewayUrl || 'http://localhost:42617';
            
            // 如果服务器返回的 Gateway URL 是 localhost,则使用当前页面的 hostname
            // 这样可以适配手机端访问
            if (serverGatewayUrl.includes('localhost') || serverGatewayUrl.includes('127.0.0.1')) {
                const currentHost = window.location.hostname;
                const gatewayPort = new URL(serverGatewayUrl).port;
                serverGatewayUrl = `http://${currentHost}:${gatewayPort}`;
                console.log('⚙️ [配置] 自动替换 localhost 为当前主机地址:', serverGatewayUrl);
            }

            // 如果用户没有自定义配置，使用服务器配置
            this.gatewayUrl = savedGatewayUrl || serverGatewayUrl;
            this.token = savedToken !== null ? savedToken : config.token || '';

            console.log('⚙️ [配置] 已加载服务器配置');
            console.log('   - Gateway URL:', this.gatewayUrl);
            console.log('   - Token:', this.token ? '已配置' : '未配置');
        } catch (error) {
            console.warn('⚠️ [配置] 无法加载服务器配置，使用默认值');
            this.gatewayUrl = localStorage.getItem('gatewayUrl') || 'http://localhost:42617';
            this.token = localStorage.getItem('token') || '';
        }
    }
    
    // 初始化主题
    initTheme() {
        // 从 localStorage 加载主题，如果没有则使用日间主题
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    }

    // 设置主题
    setTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            // 更新按钮图标为太阳
            if (this.themeToggleBtn) {
                const icon = this.themeToggleBtn.querySelector('i');
                if (icon) {
                    icon.className = 'bi bi-sun-fill';
                }
            }
        } else {
            document.documentElement.removeAttribute('data-theme');
            // 更新按钮图标为月亮
            if (this.themeToggleBtn) {
                const icon = this.themeToggleBtn.querySelector('i');
                if (icon) {
                    icon.className = 'bi bi-moon-fill';
                }
            }
        }
        // 保存到 localStorage
        localStorage.setItem('theme', theme);
    }

    // 切换主题
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        console.log(`🎨 [主题] 切换主题: ${currentTheme} → ${newTheme}`);
        this.setTheme(newTheme);
    }

    // 显示验证界面
    showAuth() {
        this.authContainer.classList.remove('d-none');
        this.chatContainer.classList.add('d-none');
        this.accessKeyInput.focus();
        
        // 绑定表单事件
        this.authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAuth();
        });
        
        this.authSubmitBtn.addEventListener('click', () => {
            this.handleAuth();
        });
    }
    
    // 处理验证
    async handleAuth() {
        const key = this.accessKeyInput.value.trim();
        if (!key) return;

        this.authSubmitBtn.disabled = true;
        this.authSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>验证中...';
        this.authError.classList.add('d-none');

        try {
            // 验证密钥（发送到后端）
            const response = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key })
            });

            const result = await response.json();

            if (result.success) {
                console.log('验证成功，进入聊天界面');
                this.accessKey = key;

                // 根据用户选择保存密钥
                const rememberMe = document.getElementById('rememberKey') && document.getElementById('rememberKey').checked;
                if (rememberMe) {
                    localStorage.setItem('access_key', key);
                    console.log('已记住密钥（localStorage）');
                } else {
                    sessionStorage.setItem('access_key', key);
                    console.log('仅当前会话有效（sessionStorage）');
                }

                this.showChat();
            } else {
                console.error('密钥错误:', result.message);
                this.authError.classList.remove('d-none');
                this.authError.innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i>${result.message || '密钥错误，请重试'}`;
                this.accessKeyInput.value = '';
                this.accessKeyInput.focus();
            }
        } catch (error) {
            console.error('验证失败:', error);
            this.authError.classList.remove('d-none');
            this.authError.innerHTML = '<i class="bi bi-exclamation-triangle me-1"></i>验证失败，请检查网络连接';
        } finally {
            this.authSubmitBtn.disabled = false;
            this.authSubmitBtn.innerHTML = '<i class="bi bi-unlock me-1"></i>验证并进入';
        }
    }

    // 显示聊天界面
    showChat() {
        console.log('显示聊天界面...');
        this.authContainer.classList.add('d-none');
        this.chatContainer.classList.remove('d-none');
        
        // 确保 DOM 已更新
        setTimeout(() => {
            console.log('加载消息和建立连接...');
            this.loadMessages();
            this.setupEventListeners();
            this.connect();
        }, 100);
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

    // 退出登录
    logout() {
        // 清除保存的密钥
        localStorage.removeItem('access_key');
        sessionStorage.removeItem('access_key');
        // 断开连接
        this.disconnect();
        // 重置状态
        this.accessKey = null;
        this.messages = [];
        // 重新加载页面
        window.location.reload();
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

        // 主题切换
        this.themeToggleBtn.addEventListener('click', () => {
            this.toggleTheme();
        });

        // 设置按钮
        const settingsBtn = document.getElementById('settingsBtn');
        settingsBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
            document.getElementById('gatewayUrl').value = this.gatewayUrl;
            document.getElementById('token').value = this.token;
            modal.show();
        });

        // 退出登录
        document.getElementById('logoutBtn').addEventListener('click', () => {
            if (confirm('确定要退出登录吗？')) {
                this.logout();
            }
        });
        
        // 保存设置
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            const oldGatewayUrl = this.gatewayUrl;
            const oldToken = this.token;
            
            this.gatewayUrl = document.getElementById('gatewayUrl').value;
            this.token = document.getElementById('token').value;
            localStorage.setItem('gatewayUrl', this.gatewayUrl);
            localStorage.setItem('token', this.token);
            
            console.log('⚙️ [Gateway] 配置已更新');
            console.log('   - Gateway URL:', oldGatewayUrl, '→', this.gatewayUrl);
            console.log('   - Token:', oldToken ? '(已配置)' : '(未配置)', '→', this.token ? '(已配置)' : '(未配置)');
            console.log('   - 正在重新连接...');
            
            bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
            this.reconnect();
        });
    }
    
    // 连接 WebSocket
    connect() {
        // 使用相对路径,通过 Web 服务器代理到 Gateway
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.host;
        const url = `${wsProtocol}//${wsHost}/ws/chat`;
        
        const params = new URLSearchParams();
        params.set('session_id', this.sessionId);
        if (this.token) {
            params.set('token', this.token);
        }

        const fullUrl = `${url}?${params.toString()}`;

        console.log('═'.repeat(60));
        console.log('🔌 [WebSocket] 正在连接到 ZeroClaw Gateway (通过代理)');
        console.log('═'.repeat(60));
        console.log('📍 Web 服务器:', window.location.origin);
        console.log('🔗 WebSocket URL:', fullUrl);
        console.log('📡 模式: WebSocket 代理 (服务器内部转发)');
        console.log('🆔 Session ID:', this.sessionId);
        console.log('🔑 Token:', this.token ? '已配置 (' + this.token.substring(0, 8) + '...)' : '未配置');
        console.log('─'.repeat(60));

        // 不传递子协议以兼容 ZeroClaw v0.1.7
        this.ws = new WebSocket(fullUrl);

        this.ws.onopen = () => {
            console.log('✅ [WebSocket] 连接已成功建立');
            console.log('📊 连接信息:');
            console.log('   - URL:', fullUrl);
            console.log('   - 协议:', this.ws.protocol || '(无子协议)');
            console.log('   - 状态:', this.ws.readyState === WebSocket.OPEN ? 'OPEN' : 'UNKNOWN');
            console.log('═'.repeat(60));
            this.setConnected(true);
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                // 记录关键事件
                if (['session_start', 'connected', 'error'].includes(msg.type)) {
                    console.log(`📨 [WebSocket] 收到事件: ${msg.type}`, msg);
                }
                this.handleMessage(msg);
            } catch (error) {
                console.error('❌ [WebSocket] 解析消息失败:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('─'.repeat(60));
            console.log('❌ [WebSocket] 连接已关闭');
            console.log('📊 关闭信息:');
            console.log('   - Code:', event.code, this.getCloseCodeDescription(event.code));
            console.log('   - Reason:', event.reason || '无');
            console.log('   -  Was Clean:', event.wasClean);
            console.log('─'.repeat(60));
            this.setConnected(false);

            // 自动重连
            if (event.code !== 1000 && event.code !== 1001) {
                console.log('🔄 [WebSocket] 将在 3 秒后尝试重连...');
                setTimeout(() => {
                    console.log('🔄 [WebSocket] 正在重连...');
                    this.connect();
                }, 3000);
            }
        };

        this.ws.onerror = (error) => {
            console.error('═'.repeat(60));
            console.error('❌ [WebSocket] 连接错误');
            console.error('📍 目标 URL:', fullUrl);
            console.error('🔍 错误详情:', error);
            console.error('💡 可能原因:');
            console.error('   1. Gateway 未启动或端口错误');
            console.error('   2. 网络连接问题');
            console.error('   3. 代理配置问题');
            console.error('═'.repeat(60));
            this.setConnected(false);
        };
    }

    // 获取 WebSocket 关闭代码说明
    getCloseCodeDescription(code) {
        const descriptions = {
            1000: '正常关闭',
            1001: '端点离开',
            1002: '协议错误',
            1003: '不支持的数据类型',
            1005: '未提供状态码',
            1006: '异常断开',
            1008: '政策违规',
            1009: '消息过大',
            1011: '服务器内部错误',
            1012: '服务重启',
            1013: '服务暂时不可用'
        };
        return descriptions[code] || '未知代码';
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
                console.log('📨 [Gateway] 会话启动');
                console.log('   - Session ID:', msg.session_id);
                console.log('   - 会话名称:', msg.name || '未命名');
                console.log('   - 是否恢复:', msg.resumed ? '是' : '否');
                console.log('   - 历史消息数:', msg.message_count || 0);
                console.log('   - Gateway URL:', this.gatewayUrl);
                break;

            case 'connected':
                console.log('📨 [Gateway] 连接确认');
                console.log('   - 消息:', msg.message || 'Connection established');
                break;

            case 'agent_start':
                console.log('🤖 [Gateway] Agent 启动');
                console.log('   - Provider:', msg.provider || '未知');
                console.log('   - Model:', msg.model || '未知');
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
                console.log('🔄 [Gateway] 重置流式缓冲区');
                this.capturedThinking = this.pendingThinking;
                this.pendingContent = '';
                this.pendingThinking = '';
                this.streamingContent = '';
                this.streamingThinking = '';
                this.removeStreamingMessage();
                break;

            case 'message':
            case 'done': {
                let content = msg.full_response || msg.content || this.pendingContent;
                const thinking = this.capturedThinking || this.pendingThinking || undefined;

                console.log('✅ [Gateway] 消息完成');
                console.log('   - 内容长度:', content?.length || 0, '字符');
                console.log('   - 思考长度:', thinking?.length || 0, '字符');

                // 检测并解析工具调用格式
                if (content && typeof content === 'string') {
                    // 匹配 shell 命令格式
                    const shellMatch = content.match(/`+[\s\n]*shell\(command="([^"]+)"\)[\s\n]*`+/);
                    if (shellMatch) {
                        const shellCmd = shellMatch[1];
                        console.log('🔧 [Gateway] 检测到 shell 工具调用:', shellCmd);
                        
                        // 创建工具调用消息
                        this.addToolCallMessage('shell', { command: shellCmd });
                        
                        // 在前端执行 shell 命令
                        this.executeShellCommand(shellCmd);
                        
                        // 不显示原始命令，等待执行结果
                        content = null;
                    }
                }

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

            case 'agent_end':
                console.log('🏁 [Gateway] Agent 完成');
                console.log('   - Provider:', msg.provider || '未知');
                console.log('   - Model:', msg.model || '未知');
                this.finalizeToolCalls();
                break;

            case 'tool_call': {
                const toolName = msg.name || msg.tool || 'unknown';
                const toolArgs = msg.args || msg.input || {};
                console.log('🔧 [Gateway] 工具调用:', toolName);
                console.log('   - 参数:', JSON.stringify(toolArgs, null, 2));
                this.addToolCallMessage(toolName, toolArgs);
                break;
            }

            case 'tool_result': {
                const output = msg.output || msg.result || '';
                console.log('✅ [Gateway] 工具结果');
                console.log('   - 输出长度:', output.length, '字符');
                console.log('   - 输出预览:', output.substring(0, 100) + (output.length > 100 ? '...' : ''));
                this.updateToolCallOutput(output);
                break;
            }
                
            case 'error':
                console.error('❌ [Gateway] 服务器错误');
                console.error('   - 错误代码:', msg.code || '未知');
                console.error('   - 错误消息:', msg.message || '未知错误');
                console.error('   - Gateway URL:', this.gatewayUrl);
                this.addAgentMessage(`❌ Gateway 错误 [${msg.code || 'UNKNOWN'}]: ${msg.message || '未知错误'}`);
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
            const msgData = JSON.stringify({ type: 'message', content });
            console.log('📤 [Gateway] 发送消息');
            console.log('   - 内容长度:', content.length, '字符');
            console.log('   - 内容预览:', content.substring(0, 50) + (content.length > 50 ? '...' : ''));
            console.log('   - WebSocket 状态:', this.ws.readyState === WebSocket.OPEN ? 'OPEN' : 'CLOSED');
            
            this.ws.send(msgData);
            this.isTyping = true;
            this.pendingContent = '';
            this.pendingThinking = '';
            this.showTypingIndicator();
        } catch (error) {
            console.error('❌ [Gateway] 发送消息失败:', error);
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
            
            // 工具结果更新后，滚动到底部
            this.scrollToBottom();
        }
    }
    
    // 在前端执行 shell 命令（通过后端 API 代理）
    async executeShellCommand(command) {
        console.log('🔧 [前端] 执行 shell 命令:', command);
        
        try {
            // 调用后端 API 执行命令
            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✅ [前端] 命令执行成功');
                console.log('   输出长度:', result.output?.length || 0, '字符');
                this.updateToolCallOutput(result.output || '执行成功，无输出');
                
                // 创建最终回复消息
                const replyMsg = {
                    id: this.generateUUID(),
                    role: 'agent',
                    content: `命令执行完成。\\n\\n\`\`\`\\n${result.output}\\n\`\`\``,
                    markdown: true,
                    timestamp: new Date()
                };
                this.messages.push(replyMsg);
                this.renderMessage(replyMsg);
                this.saveMessages();
            } else {
                console.error('❌ [前端] 命令执行失败:', result.error);
                this.updateToolCallOutput('执行失败: ' + (result.error || '未知错误'));
            }
        } catch (error) {
            console.error('❌ [前端] 执行命令异常:', error);
            this.updateToolCallOutput('执行异常: ' + error.message);
        }
        
        this.scrollToBottom();
    }
    
    // 处理所有工具调用完成后的最终显示
    finalizeToolCalls() {
        // 检查是否有未显示的工具调用结果
        const lastToolMsg = [...this.messages].reverse().find(m => m.toolCall && m.toolCall.output);
        if (lastToolMsg && lastToolMsg.toolCall.output) {
            // 如果工具结果很长，可以创建额外的消息显示
            const output = lastToolMsg.toolCall.output;
            if (output.length > 500) {
                // 如果结果很长，创建单独的摘要消息
                const summaryMsg = {
                    id: this.generateUUID(),
                    role: 'agent',
                    content: `工具 \`${lastToolMsg.toolCall.name}\` 执行完成，输出 ${output.length} 字符。`,
                    markdown: true,
                    timestamp: new Date()
                };
                this.messages.push(summaryMsg);
                this.renderMessage(summaryMsg);
                this.saveMessages();
            }
        }
        this.scrollToBottom();
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
                <details class="tool-call-args-details">
                    <summary>参数</summary>
                    <div class="tool-call-args">${this.escapeHtml(JSON.stringify(toolCall.args || {}, null, 2))}</div>
                </details>
        `;

        if (toolCall.output !== undefined && toolCall.output !== '') {
            const output = toolCall.output;
            const previewLength = 300;
            const preview = output.substring(0, previewLength);
            const isLong = output.length > previewLength;
            
            html += `<details class="tool-call-output-details" ${isLong ? '' : 'open'}>
                <summary>输出结果 (${output.length} 字符)</summary>
                <div class="tool-call-output">${this.escapeHtml(output)}</div>
            </details>`;
        } else if (toolCall.output === undefined) {
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
