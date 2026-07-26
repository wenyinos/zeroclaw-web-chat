// ZeroClaw Web Chat - 主应用逻辑
// 基于 companion-app 设计重构

class ClawAgent {
  constructor() {
    // 配置
    this.gatewayUrl = null;
    this.token = null;
    this.backend = 'zeroclaw';
    this.sessionId = this.getOrCreateSessionId();
    this.verifiedSessionId = sessionStorage.getItem('claw_verified_session') || null;
    this.accessKey = null;

    // WebSocket
    this.ws = null;
    this.isConnected = false;
    this.manualDisconnect = false;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;

    // 消息状态
    this.messages = [];
    this.pendingContent = '';
    this.pendingThinking = '';
    this.streamingContent = '';
    this.streamingThinking = '';
    this.drafts = this.loadDrafts();

    // 当前标签页
    this.currentTab = 'chat';

    // 消息上下文：用于区分私聊/群聊回复
    this.messageContext = 'chat'; // 'chat' 或 'group'
    this.pendingGroupReplies = new Map(); // 等待回复的群聊助手 Map<thinkingMsgId, assistant>

    // 助手配置
    this.assistants = [];
    this.currentAssistant = null;
    this.groupMessages = [];

    // 置顶记忆（作为长期记忆随消息发送）
    this.pinnedMemories = [];

    // 贴纸状态
    this.stickersLoaded = false;

    // 当前设置
    this.currentSettings = null;

    // 搜索/筛选状态
    this.showFavoritesOnly = false;
    this.showGroupFavoritesOnly = false;
    this.searchMode = 'chat'; // 'chat' 或 'group'

    // 图片上传
    this.pendingImages = [];
    this.imagePreviewContainer = null;
    this.imagePreviewList = null;
    this.imageUploadEnabled = false; // 默认禁用，等待服务器配置

    // DOM 元素
    this.elements = {};

    // 初始化
    this.init();
  }

  // ===== 初始化 =====
  async init() {
    // 缓存 DOM 元素
    this.cacheElements();

    // 加载服务器配置
    await this.loadServerConfig();

    // 初始化主题
    this.initTheme();

    // 绑定事件
    this.bindEvents();

    // 设置离线检测
    this.setupOfflineDetection();

    // 检查认证状态
    this.checkAuth();
  }

  cacheElements() {
    this.elements = {
      // 认证
      authOverlay: document.getElementById('authOverlay'),
      authForm: document.getElementById('authForm'),
      accessKeyInput: document.getElementById('accessKeyInput'),
      authError: document.getElementById('authError'),
      authSubmitBtn: document.getElementById('authSubmitBtn'),
      rememberKey: document.getElementById('rememberKey'),

      // 主应用
      appMain: document.getElementById('appMain'),
      loadingScreen: document.getElementById('loadingScreen'),

      // 侧边栏
      sidebar: document.getElementById('sidebar'),
      navBtns: document.querySelectorAll('.nav-btn'),
      logoutBtn: document.getElementById('logoutBtn'),

      // 移动端标签
      mobileTabs: document.getElementById('mobileTabs'),
      mobileTabBtns: document.querySelectorAll('.mobile-tab'),

      // 标签面板
      tabPanels: document.querySelectorAll('.tab-panel'),

      // 私聊
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      messagesContainer: document.getElementById('messagesContainer'),
      messagesWrapper: document.getElementById('messagesWrapper'),
      welcomeMessage: document.getElementById('welcomeMessage'),
      messageInput: document.getElementById('messageInput'),
      sendBtn: document.getElementById('sendBtn'),
      newChatBtn: document.getElementById('newChatBtn'),
      historyBtn: document.getElementById('historyBtn'),
      themeToggleBtn: document.getElementById('themeToggleBtn'),
      searchBtn: document.getElementById('searchBtn'),
      searchBar: document.getElementById('searchBar'),
      searchInput: document.getElementById('searchInput'),
      searchCount: document.getElementById('searchCount'),
      searchClose: document.getElementById('searchClose'),
      favoriteFilterBtn: document.getElementById('favoriteFilterBtn'),
      imageUploadBtn: document.getElementById('imageUploadBtn'),
      imageUploadInput: document.getElementById('imageUploadInput'),
      draftsArea: document.getElementById('draftsArea'),

      // 贴纸
      stickerToggleBtn: document.getElementById('stickerToggleBtn'),
      stickerPanel: document.getElementById('stickerPanel'),
      stickerGrid: document.getElementById('stickerGrid'),
      stickerUploadBtn: document.getElementById('stickerUploadBtn'),
      stickerUploadInput: document.getElementById('stickerUploadInput'),

      // 控制台
      consoleEvents: document.getElementById('consoleEvents'),
      consoleInput: document.getElementById('consoleInput'),
      consoleSendBtn: document.getElementById('consoleSendBtn'),

      // 群聊
      groupMessagesContainer: document.getElementById('groupMessagesContainer'),
      groupMessageInput: document.getElementById('groupMessageInput'),
      groupSendBtn: document.getElementById('groupSendBtn'),
      groupSearchBtn: document.getElementById('groupSearchBtn'),
      groupSearchBar: document.getElementById('groupSearchBar'),
      groupSearchInput: document.getElementById('groupSearchInput'),
      groupSearchCount: document.getElementById('groupSearchCount'),
      groupSearchClose: document.getElementById('groupSearchClose'),
      groupFavoriteFilterBtn: document.getElementById('groupFavoriteFilterBtn'),
      groupClearBtn: document.getElementById('groupClearBtn'),
      assistantSelector: document.getElementById('assistantSelector'),
      assistantSettingsBtn: document.getElementById('assistantSettingsBtn'),
      assistantSettingsModal: document.getElementById('assistantSettingsModal'),
      assistantSettingsClose: document.getElementById('assistantSettingsClose'),
      assistantSettingsList: document.getElementById('assistantSettingsList'),
      addAssistantBtn: document.getElementById('addAssistantBtn'),

      // 记忆
      memoryList: document.getElementById('memoryList'),
      memorySearchInput: document.getElementById('memorySearchInput'),
      addMemoryBtn: document.getElementById('addMemoryBtn'),
      uploadMemoryBtn: document.getElementById('uploadMemoryBtn'),
      memoryUploadInput: document.getElementById('memoryUploadInput'),

      // 设置
      userNameInput: document.getElementById('userNameInput'),
      assistantNameInput: document.getElementById('assistantNameInput'),
      themeSelect: document.getElementById('themeSelect'),
      notificationsToggle: document.getElementById('notificationsToggle'),
      saveSettingsBtn: document.getElementById('saveSettingsBtn'),

      // 文档
      documentList: document.getElementById('documentList'),
      addDocumentBtn: document.getElementById('addDocumentBtn'),

      // 模态框
      historyModal: document.getElementById('historyModal'),
      historyModalClose: document.getElementById('historyModalClose'),
      historySessionSelect: document.getElementById('historySessionSelect'),
      refreshHistoryBtn: document.getElementById('refreshHistoryBtn'),
      historyDownloadBtn: document.getElementById('historyDownloadBtn'),
      historyResumeBtn: document.getElementById('historyResumeBtn'),
      historyDeleteBtn: document.getElementById('historyDeleteBtn'),
      historyMeta: document.getElementById('historyMeta'),
      historyPreview: document.getElementById('historyPreview'),

      // 灯箱
      lightbox: document.getElementById('lightbox'),
      lightboxClose: document.getElementById('lightboxClose'),
      lightboxImage: document.getElementById('lightboxImage'),
      lightboxFilename: document.getElementById('lightboxFilename'),
      lightboxOriginal: document.getElementById('lightboxOriginal'),
    };
  }

  // ===== 配置 =====
  async loadServerConfig() {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();

      this.gatewayUrl = config.gatewayUrl;
      this.token = config.token || '';
      this.backend = config.backend || 'zeroclaw';
      this.imageUploadEnabled = config.imageUploadEnabled !== false;
      this.memoryEnabled = config.memoryEnabled === true;

      console.log('⚙️ 配置已加载:', this.backend, 'imageUpload:', this.imageUploadEnabled, 'memory:', this.memoryEnabled);

      // 根据配置显示/隐藏功能入口
      this.updateFeatureVisibility();
    } catch (error) {
      console.error('❌ 加载配置失败:', error);
      // 使用默认配置
      this.imageUploadEnabled = true;
      this.memoryEnabled = false;
    }
  }

  updateFeatureVisibility() {
    // 图片上传按钮
    if (this.imageUploadEnabled) {
      this.elements.imageUploadBtn.style.display = 'block';
    } else {
      this.elements.imageUploadBtn.style.display = 'none';
    }

    // 记忆标签页
    const memoryTabBtns = document.querySelectorAll('[data-tab="memory"]');
    memoryTabBtns.forEach(btn => {
      btn.style.display = this.memoryEnabled ? '' : 'none';
    });

    // 如果当前是记忆标签页但功能禁用，切换到私聊
    if (!this.memoryEnabled && this.currentTab === 'memory') {
      this.switchTab('chat');
    }
  }

  // ===== 设置 =====
  async loadSettings() {
    try {
      const response = await fetch('/api/settings', {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });

      // 检查 401错误
      if (response.status === 401) {
        console.warn('Session 已过期，重新登录');
        this.logout();
        return;
      }

      const data = await response.json();

      if (data.success) {
        const { settings } = data;
        this.elements.userNameInput.value = settings.userName || 'Wenyin';
        this.elements.assistantNameInput.value = settings.assistantName || 'Claw Agent';
        this.elements.themeSelect.value = settings.theme || 'light';
        this.elements.notificationsToggle.checked = settings.notifications || false;

        // 保存当前设置
        this.currentSettings = settings;

        // 应用主题
        this.setTheme(settings.theme || 'light');

        // 更新用户头像
        const initial = (settings.userName || 'W')[0].toUpperCase();
        document.querySelector('.user-avatar').textContent = initial;

        // 更新用户名显示
        const userNameEl = document.querySelector('.user-name');
        if (userNameEl) {
          userNameEl.textContent = settings.userName || 'Wenyin';
        }
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  async saveSettings() {
    const settings = {
      userName: this.elements.userNameInput.value.trim() || 'Wenyin',
      assistantName: this.elements.assistantNameInput.value.trim() || 'Claw Agent',
      theme: this.elements.themeSelect.value,
      notifications: this.elements.notificationsToggle.checked
    };

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify(settings)
      });

      const data = await response.json();
      if (data.success) {
        console.log('✅ 设置已保存');

        // 更新用户头像
        const initial = (settings.userName || 'W')[0].toUpperCase();
        document.querySelector('.user-avatar').textContent = initial;

        // 更新用户名显示
        const userNameEl = document.querySelector('.user-name');
        if (userNameEl) {
          userNameEl.textContent = settings.userName || 'Wenyin';
        }

        // 保存当前设置到实例变量
        this.currentSettings = settings;

        // 应用主题
        this.setTheme(settings.theme);
      }
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }

  // ===== 认证 =====
  checkAuth() {
    const savedKey = localStorage.getItem('access_key') || sessionStorage.getItem('access_key');
    if (savedKey) {
      // 总是重新验证，因为服务器重启后 session 会失效
      this.verifyAccessKey(savedKey, Boolean(localStorage.getItem('access_key')));
    } else {
      this.showAuth();
    }
  }

  showAuth() {
    this.elements.authOverlay.style.display = 'flex';
    this.elements.appMain.style.display = 'none';
    this.elements.loadingScreen.style.display = 'none';
    this.elements.accessKeyInput.focus();
  }

  showApp() {
    this.elements.authOverlay.style.display = 'none';
    this.elements.loadingScreen.style.display = 'none';
    this.elements.appMain.style.display = 'grid';

    // 加载设置和助手配置
    this.loadSettings();
    this.loadAssistants();

    // 预载置顶记忆，首条消息也能带上长期记忆
    this.refreshPinnedMemories();

    // 加载历史消息
    this.loadChatHistory();

    // 连接 SSE
    this.connectSSE();
  }

  async loadChatHistory() {
    try {
      // 加载私聊历史消息（使用 sessionId）
      const chatResponse = await fetch(`/api/chat/messages?limit=80&session_id=${this.sessionId}`, {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const chatData = await chatResponse.json();

      if (chatData.success && chatData.messages.length > 0) {
        this.messages = chatData.messages;
        this.renderMessages();
      }
    } catch (error) {
      console.error('加载私聊历史失败:', error);
    }
  }

  async verifyAccessKey(key, remember = false) {
    try {
      this.elements.authSubmitBtn.disabled = true;
      this.elements.authSubmitBtn.textContent = '验证中...';

      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });

      const data = await response.json();

      if (data.success) {
        this.accessKey = key;
        this.verifiedSessionId = data.sessionId;
        sessionStorage.setItem('claw_verified_session', data.sessionId);

        if (remember) {
          localStorage.setItem('access_key', key);
        } else {
          sessionStorage.setItem('access_key', key);
        }

        this.showApp();
        this.connectWebSocket();
      } else {
        this.showAuthError(data.message || '密钥错误');
      }
    } catch (error) {
      this.showAuthError('验证失败，请重试');
    } finally {
      this.elements.authSubmitBtn.disabled = false;
      this.elements.authSubmitBtn.textContent = '验证并进入';
    }
  }

  showAuthError(message) {
    this.elements.authError.textContent = message;
    this.elements.authError.classList.add('show');
    setTimeout(() => {
      this.elements.authError.classList.remove('show');
    }, 3000);
  }

  logout() {
    localStorage.removeItem('access_key');
    sessionStorage.removeItem('access_key');
    sessionStorage.removeItem('claw_verified_session');
    this.verifiedSessionId = null;
    this.disconnectWebSocket();
    this.showAuth();
  }

  // ===== 标签页切换 =====
  switchTab(tabName) {
    this.currentTab = tabName;

    // 更新侧边栏导航
    this.elements.navBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 更新移动端标签
    this.elements.mobileTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 切换面板
    this.elements.tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });

    // 标签特定初始化
    if (tabName === 'chat') {
      this.scrollToBottom();
    } else if (tabName === 'group') {
      this.loadGroupMessages();
      this.loadAssistants();
    } else if (tabName === 'console') {
      this.loadConsoleEvents();
    } else if (tabName === 'memory') {
      this.loadMemories();
      this.loadDocuments();
    } else if (tabName === 'settings') {
      this.loadSettings();
    }
  }

  // ===== 主题 =====
  initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    this.setTheme(savedTheme);
  }

  setTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);

    if (this.elements.themeSelect) {
      this.elements.themeSelect.value = theme;
    }

    if (this.elements.themeToggleBtn) {
      this.elements.themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  toggleTheme() {
    const current = document.body.dataset.theme || 'light';
    this.setTheme(current === 'light' ? 'dark' : 'light');
  }

  // ===== WebSocket =====
  connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.updateConnectionStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat?auth_session=${this.verifiedSessionId}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket 已连接');
        this.isConnected = true;
        this.reconnectDelay = 1000;
        this.updateConnectionStatus('connected');
        this.enableInput();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket 已断开:', event.code);
        this.isConnected = false;
        this.updateConnectionStatus('disconnected');

        if (!this.manualDisconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket 错误:', error);
        this.updateConnectionStatus('error');
      };
    } catch (error) {
      console.error('❌ WebSocket 连接失败:', error);
      this.scheduleReconnect();
    }
  }

  disconnectWebSocket() {
    this.manualDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
  }

  // ===== SSE 实时更新 =====
  connectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    // 通过 URL 参数传递 session ID
    const sseUrl = `/api/stream?session_id=${this.verifiedSessionId}`;
    this.eventSource = new EventSource(sseUrl);

    this.eventSource.addEventListener('snapshot', (e) => {
      const data = JSON.parse(e.data);
      console.log('📦 SSE 快照已接收');

      // 应用设置
      if (data.settings) {
        this.applySettings(data.settings);
      }

      // 加载控制台事件
      if (data.consoleEvents) {
        this.renderConsoleEvents(data.consoleEvents);
      }

      // 加载贴纸
      if (data.stickers) {
        this.renderStickerGrid(data.stickers);
      }
    });

    this.eventSource.addEventListener('message', (e) => {
      const message = JSON.parse(e.data);
      // 避免重复消息
      if (!this.messages.find(m => m.id === message.id)) {
        this.addMessage(message.role, message.content, message);
      }
    });

    this.eventSource.addEventListener('settings', (e) => {
      const settings = JSON.parse(e.data);
      this.applySettings(settings);
    });

    this.eventSource.addEventListener('console', (e) => {
      const event = JSON.parse(e.data);
      this.appendConsoleEvent(event);
    });

    this.eventSource.addEventListener('stickers', (e) => {
      const stickers = JSON.parse(e.data);
      this.renderStickerGrid(stickers);
    });

    this.eventSource.addEventListener('ping', () => {
      // 心跳，保持连接
    });

    this.eventSource.onerror = (event) => {
      console.warn('⚠️ SSE 连接错误');

      // SSE 连接错误时只重连，不影响登录状态
      this.eventSource.close();

      // 延迟重连，避免频繁请求
      console.warn('5秒后重连 SSE...');
      setTimeout(() => {
        // 重连前检查是否仍有有效的 session
        if (this.verifiedSessionId) {
          this.connectSSE();
        }
      }, 5000);
    };
  }

  disconnectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  applySettings(settings) {
    if (settings.userName) {
      this.elements.userNameInput.value = settings.userName;
      const initial = settings.userName[0].toUpperCase();
      document.querySelector('.user-avatar').textContent = initial;
    }
    if (settings.assistantName) {
      this.elements.assistantNameInput.value = settings.assistantName;
    }
    if (settings.theme) {
      this.setTheme(settings.theme);
      this.elements.themeSelect.value = settings.theme;
    }
    if (settings.notifications !== undefined) {
      this.elements.notificationsToggle.checked = settings.notifications;
    }
  }

  // ===== 系统通知 =====
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      console.warn('浏览器不支持通知');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      console.warn('通知权限被拒绝');
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  sendNotification(title, body) {
    // 检查通知开关
    if (!this.elements.notificationsToggle?.checked) return;

    // 检查权限
    if (Notification.permission !== 'granted') return;

    try {
      const notification = new Notification(title, {
        body,
        icon: '/favicon/apple-touch-icon.png',
        badge: '/favicon/favicon-32x32.png'
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // 5秒后自动关闭
      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.warn('发送通知失败:', error);
    }
  }

  appendConsoleEvent(event) {
    const { consoleEvents } = this.elements;
    const time = new Date(event.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const html = `
      <div class="console-event ${event.type}">
        <div class="event-header">
          <span class="event-type">${event.title}</span>
          <span class="event-time">${time}</span>
        </div>
        <div class="event-body">${this.escapeHtml(event.body)}</div>
      </div>
    `;

    consoleEvents.insertAdjacentHTML('beforeend', html);
    consoleEvents.scrollTop = consoleEvents.scrollHeight;
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      console.log('🔄 尝试重连...');
      this.connectWebSocket();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  // ===== Toast 通知 =====
  showToast(type, title, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-header">
        <strong>${title}</strong>
        <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="toast-body">${message}</div>
    `;

    document.body.appendChild(toast);

    // 3秒后自动消失
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 3000);
  }

  // ===== 离线状态处理 =====
  setupOfflineDetection() {
    window.addEventListener('online', () => {
      this.showToast('success', '已恢复网络', '网络连接已恢复');
      if (!this.isConnected) {
        this.connectWebSocket();
      }
    });

    window.addEventListener('offline', () => {
      this.showToast('error', '网络断开', '网络连接已断开，请检查网络设置');
    });
  }

  updateConnectionStatus(status) {
    const { statusDot, statusText } = this.elements;

    statusDot.className = 'status-dot';
    switch (status) {
      case 'connected':
        statusDot.classList.add('connected');
        statusText.textContent = '已连接';
        break;
      case 'connecting':
        statusDot.classList.add('connecting');
        statusText.textContent = '连接中...';
        break;
      case 'disconnected':
        statusText.textContent = '已断开';
        break;
      case 'error':
        statusText.textContent = '连接错误';
        break;
    }
  }

  enableInput() {
    this.elements.messageInput.disabled = false;
    this.elements.sendBtn.disabled = false;
    this.elements.messageInput.placeholder = '输入消息...';

    // 启用群聊输入
    if (this.elements.groupMessageInput) {
      this.elements.groupMessageInput.disabled = false;
      this.elements.groupSendBtn.disabled = false;
    }
  }

  // ===== 消息处理 =====
  handleMessage(data) {
    // 根据消息上下文决定路由
    const scope = this.messageContext || 'chat';

    switch (data.type) {
      case 'message':
        if (scope === 'group' && this.pendingGroupReplies.size > 0) {
          // 群聊回复 - 更新对应的助手消息
          this.updateGroupReply(data);
        } else {
          // 私聊消息
          this.hideTyping();
          this.setBusy(false);
          const message = this.addMessage('assistant', data.content, { typewriter: true });
          this.sendNotification('新消息', data.content.substring(0, 100));
          // 保存到后端
          this.saveChatMessage(message);
        }
        break;
      case 'thinking':
        if (scope === 'group') {
          // 群聊思考状态
          this.updateGroupThinking(data);
        } else {
          this.showThinking(data.content);
        }
        break;
      case 'typing.start':
        this.showTyping();
        break;
      case 'typing.stop':
        this.hideTyping();
        break;
      case 'error':
        this.hideTyping();
        this.setBusy(false);
        this.addSystemMessage(data.message || '发生错误', 'error');
        break;
    }
  }

  updateGroupReply(data) {
    // 从 pendingGroupReplies 中取出第一个待回复的助手
    const entries = Array.from(this.pendingGroupReplies.entries());
    if (entries.length === 0) return;

    const [thinkingMsgId, assistant] = entries[0];
    this.pendingGroupReplies.delete(thinkingMsgId);

    // 查找对应的"正在思考"消息并更新
    const messages = this.groupMessages;
    const thinkingMsg = messages.find(m => m.id === thinkingMsgId);

    if (thinkingMsg) {
      thinkingMsg.content = data.content;
      thinkingMsg.thinking = data.thinking || '';

      // 发送通知
      this.sendNotification(`${assistant.name} 回复`, data.content.substring(0, 100));

      // 更新 DOM
      const msgEl = document.querySelector(`[data-message-id="${thinkingMsgId}"]`);
      if (msgEl) {
        const bubble = msgEl.querySelector('.bubble');
        if (bubble) {
          bubble.innerHTML = this.renderContent(data.content);
          if (data.thinking) {
            const thinkingEl = document.createElement('div');
            thinkingEl.className = 'thinking-block';
            thinkingEl.textContent = data.thinking;
            bubble.parentNode.insertBefore(thinkingEl, bubble);
          }
        }
      }

      // 更新数据库
      this.updateGroupMessageInDb(thinkingMsgId, data.content, data.thinking);
    }

    // 如果所有助手都回复完了，重置上下文
    if (this.pendingGroupReplies.size === 0) {
      this.messageContext = 'chat';
    }
  }

  updateGroupThinking(data) {
    // 可以显示思考动画
    console.log('🤔 助手思考中:', data.content);
  }

  addMessage(role, content, options = {}) {
    const message = {
      id: options.id || `msg-${Date.now()}`,
      role,
      content,
      timestamp: new Date().toISOString(),
      thinking: options.thinking,
      images: options.images,
    };

    this.messages.push(message);
    this.renderMessage(message, Boolean(options.typewriter));
    this.scrollToBottom();

    if (options.typewriter) {
      this.typewriter(message.id, content);
    }

    return message;
  }

  addSystemMessage(content, type = 'system') {
    const message = {
      id: `sys-${Date.now()}`,
      role: 'system',
      content,
      type,
      timestamp: new Date().toISOString(),
    };

    this.messages.push(message);
    this.renderSystemMessage(message);
    this.scrollToBottom();
  }

  renderMessages() {
    const container = this.elements.messagesWrapper;
    if (!container) return;

    // 清空容器，保留欢迎消息
    const welcome = container.querySelector('.welcome-message');
    container.innerHTML = '';
    if (welcome && this.messages.length === 0) {
      container.appendChild(welcome);
      welcome.style.display = 'block';
    } else if (welcome) {
      welcome.style.display = 'none';
    }

    // 渲染消息（支持收藏筛选）
    const messagesToShow = this.showFavoritesOnly
      ? this.messages.filter(m => m.favorite)
      : this.messages;

    messagesToShow.forEach(msg => this.renderMessage(msg));
    this.scrollToBottom();
  }

  renderMessage(message, blank = false) {
    const { role, content, timestamp, thinking, images } = message;
    const isMe = role === 'user';

    // 隐藏欢迎消息
    if (this.elements.welcomeMessage) {
      this.elements.welcomeMessage.style.display = 'none';
    }

    const time = new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const initial = isMe ? (this.currentSettings?.userName || 'W')[0].toUpperCase() : 'C';
    const senderName = isMe ? (this.currentSettings?.userName || '你') : (this.currentSettings?.assistantName || 'Claw Agent');

    let html = `
      <div class="message-row ${isMe ? 'me' : ''}" data-message-id="${message.id}">
        <div class="avatar">${initial}</div>
        <div class="msg-col">
          <span class="msg-sender">${senderName}</span>
    `;

    if (thinking) {
      html += `<div class="thinking-block">${this.escapeHtml(thinking)}</div>`;
    }

    html += `<div class="bubble">`;
    html += `<div class="bubble-text">${blank ? '' : this.renderContent(content)}</div>`;

    if (images && images.length > 0) {
      images.forEach(img => {
        html += `<img src="${img}" class="msg-image" onclick="app.openLightbox('${img}')" loading="lazy">`;
      });
    }

    html += `
          <div class="bubble-actions">
            <button class="action-btn" onclick="app.copyMessage('${message.id}')" title="复制">📋</button>
            <button class="action-btn" onclick="app.replyMessage('${message.id}')" title="回复">↩️</button>
            ${isMe ? '' : `<button class="action-btn" onclick="app.regenerateMessage('${message.id}')" title="重新生成">🔄</button>`}
            <button class="action-btn" onclick="app.toggleFavorite('${message.id}')" title="收藏" data-favorite="${message.favorite ? 'true' : 'false'}">${message.favorite ? '⭐' : '☆'}</button>
            <button class="action-btn" onclick="app.deleteMessage('${message.id}')" title="删除">🗑️</button>
          </div>
        </div>
        <span class="msg-time">${time}</span>
      </div>
    </div>
    `;

    this.elements.messagesWrapper.insertAdjacentHTML('beforeend', html);
  }

  renderSystemMessage(message) {
    const html = `
      <div class="message-row" data-message-id="${message.id}">
        <div class="msg-col" style="max-width: 100%; align-items: center;">
          <div class="bubble" style="background: var(--panel-soft); font-size: .85rem; text-align: center;">
            ${this.escapeHtml(message.content)}
          </div>
        </div>
      </div>
    `;

    this.elements.messagesWrapper.insertAdjacentHTML('beforeend', html);
  }

  renderContent(content) {
    // 简单的 Markdown 渲染（粗体、斜体、代码、链接）
    let html = this.escapeHtml(content);

    // 代码块先抽出占位，避免后续换行/行内规则污染块内文本
    const codeBlocks = [];
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      codeBlocks.push(`<pre><code>${code}</code></pre>`);
      return `<!--CODE${codeBlocks.length - 1}-->`;
    });

    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 粗体
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 斜体
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 换行
    html = html.replace(/\n/g, '<br>');

    // 还原代码块（占位符在换行替换后仍然完整）
    html = html.replace(/<!--CODE(\d+)-->/g, (match, index) => codeBlocks[index]);

    return html;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showThinking(content) {
    this.pendingThinking = content;
    // 可以在这里添加思考动画
  }

  showTyping() {
    if (document.getElementById('typingIndicator')) return;
    if (this.elements.welcomeMessage) {
      this.elements.welcomeMessage.style.display = 'none';
    }
    this.elements.messagesWrapper.insertAdjacentHTML('beforeend', `
      <div class="message-row" id="typingIndicator">
        <div class="avatar">C</div>
        <div class="msg-col">
          <div class="bubble typing-bubble">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
        </div>
      </div>
    `);
    this.scrollToBottom();
  }

  hideTyping() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
  }

  // 逐字渲染已收到的完整回复，减少长文本的突兀感
  typewriter(messageId, text) {
    this.stopTypewriter();
    const target = document.querySelector(`[data-message-id="${messageId}"] .bubble-text`);
    if (!target) return;

    // 步长随文本长度放大，保证整体约 2 秒内完成
    const step = Math.max(1, Math.ceil(text.length / 80));
    let cursor = 0;

    const tick = () => {
      // 会话被切换/清空时目标已脱离文档，直接停止
      if (!target.isConnected) {
        this.typewriterTimer = null;
        return;
      }
      cursor = Math.min(cursor + step, text.length);
      target.innerHTML = this.renderContent(text.slice(0, cursor));
      this.scrollToBottom();

      if (cursor < text.length) {
        this.typewriterTimer = setTimeout(tick, 25);
      } else {
        this.typewriterTimer = null;
      }
    };

    tick();
  }

  stopTypewriter() {
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
  }

  // 等待回复/逐字渲染期间，发送按钮切换为停止
  setBusy(busy) {
    this.isBusy = busy;
    const btn = this.elements.sendBtn;
    if (!btn) return;
    btn.classList.toggle('stop', busy);
    btn.title = busy ? '停止' : '发送';
    btn.innerHTML = `<span class="send-icon">${busy ? '■' : '↑'}</span>`;
  }

  // 停止逐字动画并立即显示已收到的完整内容。
  // 注意：不会中断 Gateway 端已经开始的生成——picoclaw 未公开取消协议。
  stopGenerating() {
    this.stopTypewriter();

    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant') {
      const target = document.querySelector(`[data-message-id="${last.id}"] .bubble-text`);
      if (target) {
        target.innerHTML = this.renderContent(last.content || '');
      }
    }

    this.hideTyping();
    this.setBusy(false);
    this.scrollToBottom();
  }

  // 重新生成：丢弃这条回复，用它对应的上一条用户消息重新提问
  async regenerateMessage(messageId) {
    if (!this.isConnected) {
      this.showToast('error', '未连接', '请等待连接恢复后再试');
      return;
    }

    const index = this.messages.findIndex(m => m.id === messageId);
    if (index < 0) return;

    let userIndex = index - 1;
    while (userIndex >= 0 && this.messages[userIndex].role !== 'user') {
      userIndex -= 1;
    }
    if (userIndex < 0) {
      this.showToast('error', '无法重新生成', '找不到对应的用户消息');
      return;
    }

    const userMessage = this.messages[userIndex];

    // 丢弃这条回复及其之后的消息（本地与后端）
    const dropped = this.messages.splice(index);
    for (const message of dropped) {
      this.deleteChatMessageFromDb(message.id);
    }
    this.renderMessages();

    const memoryPrompt = this.buildMemoryPrompt();
    this.ws.send(JSON.stringify({
      type: 'message',
      content: this.withMemory(userMessage.content || '', memoryPrompt),
      images: userMessage.images || [],
      context: this.getContextMessages(20)
    }));

    this.showTyping();
    this.setBusy(true);
  }

  async deleteMessage(messageId) {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index < 0) return;
    if (!confirm('确定删除这条消息？')) return;

    this.messages.splice(index, 1);
    this.renderMessages();
    await this.deleteChatMessageFromDb(messageId);
  }

  async deleteChatMessageFromDb(messageId) {
    try {
      await fetch(`/api/chat/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
    } catch (error) {
      console.error('删除消息失败:', error);
    }
  }

  scrollToBottom(scope = 'chat') {
    let container;
    if (scope === 'group') {
      container = document.getElementById('groupMessagesContainer');
    } else {
      container = this.elements.messagesContainer;
    }
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }

  // ===== 发送消息 =====
  async sendMessage() {
    const input = this.elements.messageInput;
    const content = input.value.trim();

    if (!content && this.drafts.length === 0 && this.pendingImages.length === 0) return;

    // 检查连接状态
    if (!this.isConnected) {
      this.showToast('error', '未连接', '请等待连接恢复后再发送消息');
      return;
    }

    // 置顶记忆作为长期记忆，随本次发送一并带上
    const memoryPrompt = this.buildMemoryPrompt();

    // 如果有草稿，发送所有草稿
    if (this.drafts.length > 0) {
      for (const draft of this.drafts) {
        try {
          const message = this.addMessage('user', draft);
          // 发送完整上下文（最近 20条消息）
          const context = this.getContextMessages(20);
          this.ws.send(JSON.stringify({
            type: 'message',
            content: this.withMemory(draft, memoryPrompt),
            context: context
          }));
          // 保存到后端
          await this.saveChatMessage(message);
        } catch (error) {
          console.error('发送草稿失败:', error);
          this.showToast('error', '发送失败', '消息发送失败，请重试');
        }
      }
      this.drafts = [];
      this.saveDrafts();
      this.renderDrafts();
    }

    // 发送当前输入（可能包含图片）
    if (content || this.pendingImages.length > 0) {
      try {
        const images = this.pendingImages.map(img => img.dataUrl);
        const message = this.addMessage('user', content || '', { images });
        // 发送完整上下文（最近 20条消息）
        const context = this.getContextMessages(20);
        this.ws.send(JSON.stringify({
          type: 'message',
          content: this.withMemory(content || '', memoryPrompt),
          images: images,
          context: context
        }));
        // 保存到后端
        await this.saveChatMessage(message);
        this.clearImages();
      } catch (error) {
        console.error('发送消息失败:', error);
        this.showToast('error', '发送失败', '消息发送失败，请重试');
      }
    }

    input.value = '';
    input.style.height = 'auto';

    // 不依赖 Gateway 的 typing 事件，发送后立即给出等待反馈
    this.showTyping();
    this.setBusy(true);
  }

  getContextMessages(limit = 20) {
    // 获取最近的消息作为上下文
    const recentMessages = this.messages.slice(-limit);
    return recentMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  async saveChatMessage(message) {
    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({
          // 带上本地 id，否则后续删除/收藏会因前后端 id 不一致而静默失效
          id: message.id,
          sessionId: this.sessionId,
          content: message.content,
          role: message.role,
          thinking: message.thinking,
          images: message.images,
          parentMsgId: message.parentMsgId
        })
      });
    } catch (error) {
      console.error('保存消息失败:', error);
    }
  }

  async saveGroupMessage(message) {
    try {
      await fetch('/api/group/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({
          // 占位消息稍后要按这个 id 更新成真实回复，必须与库中一致
          id: message.id,
          content: message.content,
          assistantId: message.assistantId,
          parentMsgId: message.parentMsgId,
          thinking: message.thinking
        })
      });
    } catch (error) {
      console.error('保存群聊消息失败:', error);
    }
  }

  async updateGroupMessageInDb(messageId, content, thinking) {
    try {
      await fetch(`/api/group/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({ content, thinking })
      });
    } catch (error) {
      console.error('更新群聊消息失败:', error);
    }
  }

  // ===== 草稿系统 =====
  addDraft() {
    const input = this.elements.messageInput;
    const content = input.value.trim();

    if (!content) return;

    this.drafts.push(content);
    this.saveDrafts();
    input.value = '';
    input.style.height = 'auto';

    this.renderDrafts();
  }

  removeDraft(index) {
    this.drafts.splice(index, 1);
    this.saveDrafts();
    this.renderDrafts();
  }

  saveDrafts() {
    try {
      localStorage.setItem('chat_drafts', JSON.stringify(this.drafts));
    } catch (e) {
      console.warn('保存草稿失败:', e);
    }
  }

  loadDrafts() {
    try {
      const saved = localStorage.getItem('chat_drafts');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  renderDrafts() {
    const area = this.elements.draftsArea;

    if (this.drafts.length === 0) {
      area.style.display = 'none';
      area.innerHTML = '';
      return;
    }

    area.style.display = 'flex';
    area.innerHTML = this.drafts.map((draft, i) => `
      <div class="draft-bubble">
        <span class="draft-text">${this.escapeHtml(draft)}</span>
        <button class="draft-delete" onclick="app.removeDraft(${i})">×</button>
      </div>
    `).join('');
  }

  // ===== 消息操作 =====
  copyMessage(messageId) {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) return;

    navigator.clipboard.writeText(message.content).then(() => {
      // 显示复制成功提示
      const btn = document.querySelector(`[data-message-id="${messageId}"] .action-btn`);
      if (btn) {
        const original = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => btn.textContent = original, 1000);
      }
    }).catch(() => {
      // 降级方案
      const textarea = document.createElement('textarea');
      textarea.value = message.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }

  replyMessage(messageId) {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) return;

    // 简单实现：在输入框添加引用
    const quote = `> ${message.content.split('\n')[0]}\n\n`;
    this.elements.messageInput.value = quote + this.elements.messageInput.value;
    this.elements.messageInput.focus();
  }

  async toggleFavorite(messageId) {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) return;

    try {
      const response = await fetch(`/api/chat/messages/${messageId}/favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        }
      });

      const data = await response.json();
      if (data.success) {
        message.favorite = data.favorite;

        // 更新 UI
        const btn = document.querySelector(`[data-message-id="${messageId}"] [data-favorite]`);
        if (btn) {
          btn.dataset.favorite = data.favorite ? 'true' : 'false';
          btn.textContent = data.favorite ? '⭐' : '☆';
        }
      }
    } catch (error) {
      console.error('收藏失败:', error);
    }
  }

  // ===== 图片处理 =====
  async handleImageSelect(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) {
        alert('图片大小不能超过 10MB');
        continue;
      }

      try {
        const compressed = await this.compressImage(file);
        const dataUrl = await this.fileToDataUrl(compressed);
        this.pendingImages.push({
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          dataUrl,
          size: compressed.size
        });
      } catch (error) {
        console.error('图片处理失败:', error);
      }
    }

    this.renderImagePreviews();
    this.elements.imageUploadInput.value = '';
  }

  async compressImage(file) {
    // 小图片不压缩
    if (file.size < 280 * 1024) return file;

    // GIF 不压缩
    if (file.type === 'image/gif') return file;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // 计算新尺寸（最大 1440px）
          let { width, height } = img;
          const maxEdge = 1440;
          if (width > maxEdge || height > maxEdge) {
            if (width > height) {
              height = (height / width) * maxEdge;
              width = maxEdge;
            } else {
              width = (width / height) * maxEdge;
              height = maxEdge;
            }
          }

          canvas.width = width;
          canvas.height = height;

          // 白色背景（JPEG 不支持透明）
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => resolve(blob),
            'image/jpeg',
            0.8
          );
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  renderImagePreviews() {
    if (this.pendingImages.length === 0) {
      this.imagePreviewContainer.style.display = 'none';
      this.imagePreviewList.innerHTML = '';
      return;
    }

    this.imagePreviewContainer.style.display = 'block';
    this.imagePreviewList.innerHTML = this.pendingImages.map(img => `
      <div class="image-preview-item">
        <img src="${img.dataUrl}" alt="${img.name}">
        <button class="image-preview-remove" onclick="app.removeImage('${img.id}')">×</button>
      </div>
    `).join('');
  }

  removeImage(imageId) {
    this.pendingImages = this.pendingImages.filter(img => img.id !== imageId);
    this.renderImagePreviews();
  }

  clearImages() {
    this.pendingImages = [];
    this.renderImagePreviews();
  }

  // ===== 贴纸系统 =====
  getDefaultEmojis() {
    return [
      { id: 'emoji-smile', emoji: '😊', name: '微笑' },
      { id: 'emoji-laugh', emoji: '😂', name: '大笑' },
      { id: 'emoji-love', emoji: '❤️', name: '爱心' },
      { id: 'emoji-thumbsup', emoji: '👍', name: '点赞' },
      { id: 'emoji-think', emoji: '🤔', name: '思考' },
      { id: 'emoji-cry', emoji: '😢', name: '哭泣' },
      { id: 'emoji-angry', emoji: '😠', name: '生气' },
      { id: 'emoji-surprised', emoji: '😮', name: '惊讶' },
      { id: 'emoji-wink', emoji: '😉', name: '眨眼' },
      { id: 'emoji-cool', emoji: '😎', name: '酷' },
      { id: 'emoji-hug', emoji: '🤗', name: '拥抱' },
      { id: 'emoji-kiss', emoji: '😘', name: '飞吻' },
      { id: 'emoji-pray', emoji: '🙏', name: '祈祷' },
      { id: 'emoji-clap', emoji: '👏', name: '鼓掌' },
      { id: 'emoji-fire', emoji: '🔥', name: '火' },
      { id: 'emoji-star', emoji: '⭐', name: '星星' },
      { id: 'emoji-heart-eyes', emoji: '😍', name: '花痴' },
      { id: 'emoji-rofl', emoji: '🤣', name: '笑翻' },
      { id: 'emoji-thinking', emoji: '💭', name: '想法' },
      { id: 'emoji-party', emoji: '🎉', name: '庆祝' }
    ];
  }

  toggleStickerPanel() {
    const { stickerPanel } = this.elements;
    const isVisible = stickerPanel.style.display !== 'none';
    stickerPanel.style.display = isVisible ? 'none' : 'flex';

    // 如果是第一次打开，加载默认 emoji
    if (!isVisible && !this.stickersLoaded) {
      this.loadStickers();
      this.stickersLoaded = true;
    }
  }

  async loadStickers() {
    try {
      const response = await fetch('/api/stickers', {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();

      if (data.success) {
        // 合并默认 emoji 和自定义贴纸
        const defaultEmojis = this.getDefaultEmojis();
        const allStickers = [...defaultEmojis, ...data.stickers];
        this.renderStickerGrid(allStickers);
      }
    } catch (error) {
      console.error('加载贴纸失败:', error);
      // 加载失败时只显示默认 emoji
      this.renderStickerGrid(this.getDefaultEmojis());
    }
  }

  renderStickerGrid(stickers) {
    const { stickerGrid } = this.elements;

    if (stickers.length === 0) {
      stickerGrid.innerHTML = '<div class="sticker-empty">暂无贴纸</div>';
      return;
    }

    stickerGrid.innerHTML = stickers.map(sticker => {
      // 如果是 emoji，直接显示字符
      if (sticker.emoji) {
        return `
          <div class="sticker-item emoji-item" onclick="app.insertEmoji('${sticker.emoji}')" title="${sticker.name}">
            <span class="emoji-char">${sticker.emoji}</span>
          </div>
        `;
      }
      // 如果是图片贴纸
      return `
        <div class="sticker-item" onclick="app.sendSticker('${sticker.url}')" title="${sticker.name}">
          <img src="${sticker.url}" alt="${sticker.name}" loading="lazy">
        </div>
      `;
    }).join('');
  }

  insertEmoji(emoji) {
    const input = this.currentTab === 'group'
      ? this.elements.groupMessageInput
      : this.elements.messageInput;

    if (!input) return;

    // 在光标位置插入 emoji
    const cursorPos = input.selectionStart;
    const textBefore = input.value.substring(0, cursorPos);
    const textAfter = input.value.substring(cursorPos);

    input.value = textBefore + emoji + textAfter;
    input.focus();

    // 设置光标位置到 emoji 之后
    const newPos = cursorPos + emoji.length;
    input.setSelectionRange(newPos, newPos);

    // 关闭贴纸面板
    this.elements.stickerPanel.style.display = 'none';
  }

  sendSticker(url) {
    if (!this.isConnected) return;

    // 发送贴纸作为图片消息
    this.addMessage('user', '', { images: [url] });
    this.ws.send(JSON.stringify({
      type: 'message',
      content: '',
      images: [url]
    }));

    // 关闭贴纸面板
    this.elements.stickerPanel.style.display = 'none';
  }

  async handleStickerUpload(files) {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('贴纸大小不能超过 2MB');
      return;
    }

    try {
      const dataUrl = await this.fileToDataUrl(file);

      const response = await fetch('/api/stickers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({
          dataUrl,
          name: file.name
        })
      });

      const data = await response.json();
      if (data.success) {
        console.log('✅ 贴纸已上传');
        this.loadStickers();
      } else {
        alert(data.error || '上传失败');
      }
    } catch (error) {
      console.error('贴纸上传失败:', error);
      alert('上传失败');
    }

    this.elements.stickerUploadInput.value = '';
  }

  // ===== 搜索 =====
  toggleSearch(mode = 'chat') {
    const { searchBar, searchInput } = this.elements;
    const isVisible = searchBar.style.display !== 'none';

    // 切换搜索模式
    this.searchMode = mode;

    searchBar.style.display = isVisible ? 'none' : 'flex';

    if (!isVisible) {
      searchInput.focus();
      searchInput.placeholder = mode === 'group' ? '搜索群聊消息...' : '搜索消息...';
    } else {
      searchInput.value = '';
      this.showFavoritesOnly = false;
      this.elements.favoriteFilterBtn.classList.remove('active');
      this.clearSearchHighlights();
      // 重新渲染原始列表
      if (this.searchMode === 'group') {
        this.renderGroupMessages();
      } else {
        this.renderMessages();
      }
    }
  }

  toggleFavoritesFilter() {
    this.showFavoritesOnly = !this.showFavoritesOnly;
    this.elements.favoriteFilterBtn.classList.toggle('active', this.showFavoritesOnly);

    // 应用筛选
    if (this.searchMode === 'group') {
      this.renderGroupMessages();
    } else {
      this.renderMessages();
    }

    // 更新计数
    const filtered = this.getFilteredMessages();
    this.elements.searchCount.textContent = this.showFavoritesOnly
      ? `${filtered.length} 条收藏`
      : '';
  }

  getFilteredMessages() {
    const messages = this.searchMode === 'group' ? this.groupMessages : this.messages;
    if (this.showFavoritesOnly) {
      return messages.filter(m => m.favorite);
    }
    return messages;
  }

  searchMessages(keyword) {
    if (!keyword) {
      this.elements.searchCount.textContent = '';
      this.clearSearchHighlights();
      // 重新渲染
      if (this.searchMode === 'group') {
        this.renderGroupMessages();
      } else {
        this.renderMessages();
      }
      return;
    }

    const messages = this.getFilteredMessages();
    const results = messages.filter(m =>
      m.content && m.content.toLowerCase().includes(keyword.toLowerCase())
    );

    this.elements.searchCount.textContent = `${results.length} 条结果`;
    this.highlightSearchResults(keyword);
  }

  highlightSearchResults(keyword) {
    this.clearSearchHighlights();

    document.querySelectorAll('.message-row').forEach(row => {
      const bubble = row.querySelector('.bubble');
      if (bubble && bubble.textContent.toLowerCase().includes(keyword.toLowerCase())) {
        row.classList.add('search-match');
      }
    });
  }

  clearSearchHighlights() {
    document.querySelectorAll('.search-match').forEach(el => {
      el.classList.remove('search-match');
    });
  }

  // ===== 灯箱 =====
  openLightbox(src) {
    this.elements.lightboxImage.src = src;
    this.elements.lightboxOriginal.href = src;
    this.elements.lightboxFilename.textContent = src.split('/').pop();
    this.elements.lightbox.style.display = 'flex';
  }

  closeLightbox() {
    this.elements.lightbox.style.display = 'none';
  }

  // ===== 会话管理 =====
  getOrCreateSessionId() {
    // 优先从 URL 参数获取（用于分享链接）
    const urlParams = new URLSearchParams(window.location.search);
    let sessionId = urlParams.get('session');

    if (sessionId) {
      // 从 URL 获取的 sessionId，保存到当前会话
      this.sessionIdFromUrl = true;
      return sessionId;
    }

    // 生成新的 sessionId
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sessionIdFromUrl = false;

    // 更新 URL（不刷新页面）
    const newUrl = `${window.location.pathname}?session=${sessionId}`;
    window.history.replaceState({}, '', newUrl);

    return sessionId;
  }

  newChat() {
    this.messages = [];
    this.drafts = [];
    this.elements.messagesWrapper.innerHTML = '';

    if (this.elements.welcomeMessage) {
      this.elements.messagesWrapper.appendChild(this.elements.welcomeMessage);
      this.elements.welcomeMessage.style.display = 'block';
    }

    // 生成新的 sessionId 并更新 URL
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sessionIdFromUrl = false;

    const newUrl = `${window.location.pathname}?session=${this.sessionId}`;
    window.history.replaceState({}, '', newUrl);
  }

  async loadHistory() {
    try {
      const response = await fetch('/api/sessions', {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();

      if (data.success) {
        this.renderHistoryList(data.sessions);
        this.elements.historyModal.style.display = 'flex';
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
  }

  renderHistoryList(sessions) {
    const select = this.elements.historySessionSelect;
    select.innerHTML = '<option value="">请选择会话</option>';

    sessions.forEach(session => {
      const option = document.createElement('option');
      option.value = session.sessionId;
      const date = new Date(session.updatedAt).toLocaleString('zh-CN');
      const count = session.messageCount || 0;
      option.textContent = `${session.sessionId} (${date}, ${count}条消息)`;
      select.appendChild(option);
    });
  }

  async loadSession(sessionId) {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();

      if (data.success) {
        // 生成预览内容
        const preview = data.messages.map(msg => {
          const role = msg.role === 'user' ? '用户' : '助手';
          return `${role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`;
        }).join('\n');

        this.elements.historyPreview.textContent = preview || '暂无消息';
        this.elements.historyMeta.textContent = `消息数: ${data.messages.length} | 更新时间: ${new Date(data.updatedAt).toLocaleString('zh-CN')}`;
        // 预览是截断的，下载要用后端生成的完整 Markdown
        this.currentSessionMarkdown = data.content || '';
      }
    } catch (error) {
      console.error('加载会话失败:', error);
    }
  }

  downloadSession() {
    const sessionId = this.elements.historySessionSelect.value;
    if (!sessionId) {
      this.showToast('error', '无法下载', '请先选择一个会话');
      return;
    }
    if (!this.currentSessionMarkdown) {
      this.showToast('error', '无法下载', '该会话没有可导出的对话内容');
      return;
    }

    const blob = new Blob([this.currentSessionMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sessionId}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  searchMemories(keyword) {
    const kw = keyword.trim().toLowerCase();
    document.querySelectorAll('.memory-item').forEach(item => {
      item.style.display = !kw || item.textContent.toLowerCase().includes(kw) ? '' : 'none';
    });
  }

  // 转发到后端白名单命令（仅受限的系统信息查询）
  async executeShellCommand(command) {
    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({ command })
      });

      const data = await response.json();
      if (data.success) {
        this.addConsoleEvent('command', `$ ${command}`, data.output || '(无输出)');
      } else {
        this.addConsoleEvent('error', '执行失败', data.error || '未知错误');
      }
    } catch (error) {
      this.addConsoleEvent('error', '执行失败', error.message);
    }
  }

  resumeSession() {
    const sessionId = this.elements.historySessionSelect.value;
    if (!sessionId) return;

    // 跳转到对应会话的 URL
    const url = `${window.location.pathname}?session=${sessionId}`;
    window.location.href = url;
  }

  async deleteSession() {
    const sessionId = this.elements.historySessionSelect.value;
    if (!sessionId) return;

    if (!confirm('确定要删除这个会话吗？')) return;

    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });

      const data = await response.json();
      if (data.success) {
        this.elements.historyPreview.textContent = '已删除';
        this.loadHistory();
      }
    } catch (error) {
      console.error('删除会话失败:', error);
    }
  }

  // ===== 控制台 =====
  addConsoleEvent(type, title, body) {
    const event = {
      id: `evt-${Date.now()}`,
      type,
      title,
      body,
      timestamp: new Date().toISOString(),
    };

    const time = new Date(event.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const html = `
      <div class="console-event ${type}">
        <div class="event-header">
          <span class="event-type">${title}</span>
          <span class="event-time">${time}</span>
        </div>
        <div class="event-body">${this.escapeHtml(body)}</div>
      </div>
    `;

    this.elements.consoleEvents.insertAdjacentHTML('beforeend', html);

    // 自动滚动到底部
    this.elements.consoleEvents.scrollTop = this.elements.consoleEvents.scrollHeight;
  }

  executeCommand(command) {
    this.addConsoleEvent('command', '命令', command);

    switch (command) {
      case '/help':
        this.addConsoleEvent('system', '帮助', '可用命令: /help, /clear, /status, /forge');
        break;
      case '/clear':
        this.elements.consoleEvents.innerHTML = '';
        break;
      case '/status':
        this.addConsoleEvent('system', '状态', `后端: ${this.backend}, 连接: ${this.isConnected ? '已连接' : '未连接'}`);
        break;
      case '/forge':
        this.executeForge();
        break;
      default:
        // 非内置命令交给后端白名单执行
        this.executeShellCommand(command);
    }
  }

  async loadConsoleEvents() {
    try {
      const response = await fetch('/api/console/events?limit=100', {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();

      if (data.success) {
        this.renderConsoleEvents(data.events);
      }
    } catch (error) {
      console.error('加载控制台事件失败:', error);
    }
  }

  renderConsoleEvents(events) {
    const { consoleEvents } = this.elements;
    consoleEvents.innerHTML = events.map(event => {
      const time = new Date(event.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      return `
        <div class="console-event ${event.type}">
          <div class="event-header">
            <span class="event-type">${event.title}</span>
            <span class="event-time">${time}</span>
          </div>
          <div class="event-body">${this.escapeHtml(event.body)}</div>
        </div>
      `;
    }).join('');

    // 滚动到底部
    consoleEvents.scrollTop = consoleEvents.scrollHeight;
  }

  async executeForge() {
    if (!this.sessionId) {
      this.addConsoleEvent('error', '错误', '没有活跃的会话');
      return;
    }

    this.addConsoleEvent('forge', '执行清理', '正在清理会话...');

    try {
      const response = await fetch('/api/sessions/forge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      const data = await response.json();
      if (data.success) {
        this.addConsoleEvent('forge', '清理完成', `原消息数: ${data.originalCount}, 清理后: ${data.cleanedCount}`);

        // 重新加载当前会话
        this.messages = [];
        this.elements.messagesWrapper.innerHTML = '';
        if (this.elements.welcomeMessage) {
          this.elements.messagesWrapper.appendChild(this.elements.welcomeMessage);
          this.elements.welcomeMessage.style.display = 'block';
        }
      } else {
        this.addConsoleEvent('error', '清理失败', data.error || '未知错误');
      }
    } catch (error) {
      this.addConsoleEvent('error', '清理失败', error.message);
    }
  }

  // ===== 记忆系统 =====
  // 上传 Markdown 文件作为记忆：文件名做标题，正文做内容
  async handleMemoryUpload(files) {
    const list = Array.from(files).filter(f => /\.(md|markdown)$/i.test(f.name));
    if (list.length === 0) {
      this.showToast('error', '格式不支持', '请选择 .md 或 .markdown 文件');
      return;
    }

    let succeeded = 0;
    for (const file of list) {
      try {
        const content = await file.text();
        if (!content.trim()) {
          this.showToast('error', '内容为空', file.name);
          continue;
        }

        const response = await fetch('/api/memories', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': this.verifiedSessionId
          },
          body: JSON.stringify({
            title: file.name.replace(/\.(md|markdown)$/i, ''),
            content,
            tags: ['markdown']
          })
        });

        const data = await response.json();
        if (data.success) {
          succeeded += 1;
        } else {
          this.showToast('error', '导入失败', `${file.name}: ${data.error || '未知错误'}`);
        }
      } catch (error) {
        console.error('上传记忆失败:', error);
        this.showToast('error', '导入失败', file.name);
      }
    }

    if (succeeded > 0) {
      this.showToast('success', '导入完成', `已导入 ${succeeded} 个文件，📌 置顶后才会发送给 AI`);
      this.loadMemories();
      this.refreshPinnedMemories();
    }
  }

  // 缓存置顶记忆，避免每次发消息都请求接口
  async refreshPinnedMemories() {
    if (!this.memoryEnabled) {
      this.pinnedMemories = [];
      return;
    }
    const memories = await this.fetchMemories();
    this.pinnedMemories = memories.filter(m => m.pinned);
  }

  // 把置顶记忆拼成前缀注入消息正文。
  // 不能走 payload.systemPrompt：picoclaw 的 system prompt 取自它自己的 config.json，
  // 不接受 channel 消息覆盖，content 是唯一确定会送达模型的字段。
  buildMemoryPrompt() {
    if (!this.memoryEnabled || this.pinnedMemories.length === 0) return '';
    const blocks = this.pinnedMemories
      .map(m => `## ${m.title}\n${m.content}`)
      .join('\n\n');
    return `[长期记忆·用户置顶的背景信息，供你参考，无需复述]\n\n${blocks}`;
  }

  // 记忆只拼进发给 Gateway 的正文，界面上仍显示用户原话
  withMemory(content, memoryPrompt) {
    return memoryPrompt ? `${memoryPrompt}\n\n---\n\n${content}` : content;
  }

  async loadMemories() {
    try {
      const response = await fetch('/api/memories', {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();

      if (data.success) {
        this.renderMemoryList(data.memories);
        // 复用同一次请求刷新置顶缓存，置顶/删除等操作后自动同步
        this.pinnedMemories = data.memories.filter(m => m.pinned);
      }
    } catch (error) {
      console.error('加载记忆失败:', error);
    }
  }

  renderMemoryList(memories) {
    const { memoryList } = this.elements;

    if (memories.length === 0) {
      memoryList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🧠</div>
          <p>暂无记忆</p>
        </div>
      `;
      return;
    }

    // 按置顶和时间排序
    const sorted = [...memories].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    memoryList.innerHTML = sorted.map(memory => `
      <div class="memory-item ${memory.pinned ? 'pinned' : ''}" data-memory-id="${memory.id}">
        <div class="memory-header">
          <div class="memory-title">${this.escapeHtml(memory.title)}</div>
          <div class="memory-actions">
            <button class="btn-icon" onclick="app.togglePinMemory('${memory.id}')" title="${memory.pinned ? '取消置顶' : '置顶'}">
              ${memory.pinned ? '📌' : '📍'}
            </button>
            <button class="btn-icon" onclick="app.editMemory('${memory.id}')" title="编辑">✏️</button>
            <button class="btn-icon" onclick="app.deleteMemory('${memory.id}')" title="删除">🗑️</button>
          </div>
        </div>
        <div class="memory-content">${this.escapeHtml(memory.content).substring(0, 100)}${memory.content.length > 100 ? '...' : ''}</div>
        <div class="memory-tags">
          ${memory.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  async createMemory() {
    const title = prompt('记忆标题:');
    if (!title) return;

    const content = prompt('记忆内容:');
    if (!content) return;

    const tagsInput = prompt('标签（用逗号分隔）:');
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

    try {
      const response = await fetch('/api/memories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({ title, content, tags })
      });

      const data = await response.json();
      if (data.success) {
        this.loadMemories();
      }
    } catch (error) {
      console.error('创建记忆失败:', error);
    }
  }

  async editMemory(id) {
    const memories = await this.fetchMemories();
    const memory = memories.find(m => m.id === id);
    if (!memory) return;

    const title = prompt('记忆标题:', memory.title);
    if (title === null) return;

    const content = prompt('记忆内容:', memory.content);
    if (content === null) return;

    const tagsInput = prompt('标签（用逗号分隔）:', memory.tags.join(', '));
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

    try {
      const response = await fetch(`/api/memories/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({ title, content, tags })
      });

      const data = await response.json();
      if (data.success) {
        this.loadMemories();
      }
    } catch (error) {
      console.error('更新记忆失败:', error);
    }
  }

  async deleteMemory(id) {
    if (!confirm('确定要删除这条记忆吗？')) return;

    try {
      const response = await fetch(`/api/memories/${id}`, {
        method: 'DELETE',
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });

      const data = await response.json();
      if (data.success) {
        this.loadMemories();
      }
    } catch (error) {
      console.error('删除记忆失败:', error);
    }
  }

  async togglePinMemory(id) {
    try {
      const response = await fetch(`/api/memories/${id}/pin`, {
        method: 'POST',
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });

      const data = await response.json();
      if (data.success) {
        this.loadMemories();
      }
    } catch (error) {
      console.error('切换置顶失败:', error);
    }
  }

  async fetchMemories() {
    try {
      const response = await fetch('/api/memories', {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();
      return data.success ? data.memories : [];
    } catch (error) {
      return [];
    }
  }

  // ===== 助手系统 =====
  async loadAssistants() {
    try {
      const response = await fetch('/api/assistants', {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();

      if (data.success) {
        this.assistants = data.assistants;
        this.currentAssistant = this.assistants.find(a => a.isDefault) || this.assistants[0];
        this.renderAssistantSelector();
      }
    } catch (error) {
      console.error('加载助手配置失败:', error);
    }
  }

  renderAssistantSelector() {
    const selector = this.elements.assistantSelector;
    if (!selector) return;

    const list = selector.querySelector('.assistant-list');
    if (!list) return;

    list.innerHTML = this.assistants.map(assistant => `
      <div class="assistant-chip ${assistant.id === this.currentAssistant?.id ? 'active' : ''}"
           data-assistant-id="${assistant.id}"
           onclick="app.selectAssistant('${assistant.id}')">
        <span class="assistant-avatar">${assistant.avatar}</span>
        <span class="assistant-name">${this.escapeHtml(assistant.name)}</span>
      </div>
    `).join('');
  }

  selectAssistant(id) {
    this.currentAssistant = this.getAssistantById(id);
    this.renderAssistantSelector();
    this.elements.groupMessageInput?.focus();
  }

  showAssistantSettings() {
    this.renderAssistantSettingsList();
    this.elements.assistantSettingsModal.style.display = 'flex';
  }

  hideAssistantSettings() {
    this.elements.assistantSettingsModal.style.display = 'none';
  }

  renderAssistantSettingsList() {
    const list = this.elements.assistantSettingsList;
    if (!list) return;

    list.innerHTML = this.assistants.map(assistant => `
      <div class="assistant-settings-item" data-assistant-id="${assistant.id}">
        <div class="assistant-settings-header">
          <div class="assistant-settings-avatar">${assistant.avatar}</div>
          <div class="assistant-settings-info">
            <div class="assistant-settings-name">${this.escapeHtml(assistant.name)}</div>
            <div class="assistant-settings-triggers">${(assistant.triggers || []).join(', ')}</div>
          </div>
          <div class="assistant-settings-actions">
            <button class="btn-icon" onclick="app.editAssistant('${assistant.id}')" title="编辑">✏️</button>
            ${!assistant.isDefault ? `<button class="btn-icon" onclick="app.deleteAssistant('${assistant.id}')" title="删除">🗑️</button>` : ''}
          </div>
        </div>
        <div class="assistant-settings-prompt">${this.escapeHtml(assistant.systemPrompt).substring(0, 80)}...</div>
      </div>
    `).join('');
  }

  editAssistant(id) {
    const assistant = this.getAssistantById(id);
    if (!assistant) return;

    const name = prompt('助手名称:', assistant.name);
    if (name === null) return;

    const avatar = prompt('头像 (emoji):', assistant.avatar);
    if (avatar === null) return;

    const systemPrompt = prompt('提示词:', assistant.systemPrompt);
    if (systemPrompt === null) return;

    const triggersStr = prompt('触发词 (逗号分隔):', (assistant.triggers || []).join(', '));
    const triggers = triggersStr ? triggersStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    this.updateAssistant(id, { name, avatar, systemPrompt, triggers });
  }

  async updateAssistant(id, updates) {
    try {
      const response = await fetch(`/api/assistants/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify(updates)
      });

      const data = await response.json();
      if (data.success) {
        // 更新本地数据
        const index = this.assistants.findIndex(a => a.id === id);
        if (index !== -1) {
          this.assistants[index] = data.assistant;
        }
        this.renderAssistantSelector();
        this.renderAssistantSettingsList();
        this.showToast('success', '已保存', '助手配置已更新');
      }
    } catch (error) {
      console.error('更新助手失败:', error);
      this.showToast('error', '保存失败', '更新助手配置失败');
    }
  }

  async deleteAssistant(id) {
    if (!confirm('确定要删除这个助手吗？')) return;

    try {
      const response = await fetch(`/api/assistants/${id}`, {
        method: 'DELETE',
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });

      const data = await response.json();
      if (data.success) {
        this.assistants = this.assistants.filter(a => a.id !== id);
        this.renderAssistantSelector();
        this.renderAssistantSettingsList();
        this.showToast('success', '已删除', '助手已删除');
      }
    } catch (error) {
      console.error('删除助手失败:', error);
      this.showToast('error', '删除失败', '删除助手失败');
    }
  }

  async addAssistant() {
    const name = prompt('助手名称:');
    if (!name) return;

    const avatar = prompt('头像 (emoji):', '🤖');
    if (!avatar) return;

    const systemPrompt = prompt('提示词:');
    if (!systemPrompt) return;

    const triggersStr = prompt('触发词 (逗号分隔):');
    const triggers = triggersStr ? triggersStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    try {
      const response = await fetch('/api/assistants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({ name, avatar, systemPrompt, triggers })
      });

      const data = await response.json();
      if (data.success) {
        this.assistants.push(data.assistant);
        this.renderAssistantSelector();
        this.renderAssistantSettingsList();
        this.showToast('success', '已添加', '新助手已创建');
      }
    } catch (error) {
      console.error('添加助手失败:', error);
      this.showToast('error', '添加失败', '创建助手失败');
    }
  }

  getAssistantById(id) {
    return this.assistants.find(a => a.id === id);
  }

  getAssistantByTrigger(content) {
    const text = content.toLowerCase();
    for (const assistant of this.assistants) {
      if (assistant.triggers && assistant.triggers.some(t => text.includes(t.toLowerCase()))) {
        return assistant;
      }
    }
    return null;
  }

  selectAssistantForReply(content) {
    // 1. 检查 @提及
    const mentioned = this.getAssistantByTrigger(content);
    if (mentioned) return mentioned;

    // 2. 检查是否 @所有人 或 @默认助手
    if (content.includes('@all') || content.includes('@所有人')) {
      return this.currentAssistant;
    }

    // 3. 随机选择一个助手
    const randomIndex = Math.floor(Math.random() * this.assistants.length);
    return this.assistants[randomIndex];
  }

  async sendGroupMessage(content, images = []) {
    if (!content && images.length === 0) return;

    try {
      const response = await fetch('/api/group/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({
          content,
          sender: this.currentSettings?.userName || '用户',
          images
        })
      });

      const data = await response.json();
      if (data.success) {
        this.groupMessages.push(data.message);
        this.renderGroupMessage(data.message);
        this.scrollToBottom('group');

        // 解析 @提及的助手
        const mentionedAssistants = this.parseMentionedAssistants(content);

        if (mentionedAssistants.length > 0) {
          // 有 @提及，只有被@的助手回复
          for (const assistant of mentionedAssistants) {
            await this.generateGroupReply(content, assistant, data.message.id);
          }
        } else {
          // 没有 @提及，所有助手同时回复（并行执行）
          const promises = this.assistants.map(assistant =>
            this.generateGroupReply(content, assistant, data.message.id)
          );
          await Promise.all(promises);
        }
      }
    } catch (error) {
      console.error('发送群聊消息失败:', error);
      this.showToast('error', '发送失败', '消息发送失败，请重试');
    }
  }

  parseMentionedAssistants(content) {
    const mentioned = [];
    const text = content.toLowerCase();

    for (const assistant of this.assistants) {
      // 检查 @助手名 或 触发词
      const nameMatch = text.includes(`@${assistant.name.toLowerCase()}`);
      const triggerMatch = assistant.triggers && assistant.triggers.some(t => text.includes(t.toLowerCase()));

      if (nameMatch || triggerMatch) {
        mentioned.push(assistant);
      }
    }

    return mentioned;
  }

  showMentionMenu() {
    const input = this.elements.groupMessageInput;
    if (!input) return;

    // 创建或显示菜单
    let menu = document.getElementById('mentionMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'mentionMenu';
      menu.className = 'mention-menu';
      input.parentNode.appendChild(menu);
    }

    // 渲染助手列表
    menu.innerHTML = this.assistants.map(assistant => `
      <div class="mention-item" onclick="app.insertMention('${assistant.name}')">
        <span class="mention-avatar">${assistant.avatar}</span>
        <span class="mention-name">${this.escapeHtml(assistant.name)}</span>
      </div>
    `).join('');

    menu.style.display = 'block';
  }

  hideMentionMenu() {
    const menu = document.getElementById('mentionMenu');
    if (menu) {
      menu.style.display = 'none';
    }
  }

  insertMention(name) {
    const input = this.elements.groupMessageInput;
    if (!input) return;

    // 在光标位置插入 @助手名
    const cursorPos = input.selectionStart;
    const textBefore = input.value.substring(0, cursorPos);
    const textAfter = input.value.substring(cursorPos);

    // 移除光标前的 @符号
    const lastAt = textBefore.lastIndexOf('@');
    const newTextBefore = lastAt >= 0 ? textBefore.substring(0, lastAt) : textBefore;

    input.value = newTextBefore + `@${name} ` + textAfter;
    input.focus();

    // 隐藏菜单
    this.hideMentionMenu();
  }

  async generateGroupReply(userContent, assistant, parentMsgId) {
    try {
      // 设置消息上下文为群聊
      this.messageContext = 'group';

      // 创建一个"正在思考"的占位消息
      const thinkingMsgId = `grp-thinking-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const thinkingMsg = {
        id: thinkingMsgId,
        scope: 'group',
        sender: assistant.name,
        assistantId: assistant.id,
        avatar: assistant.avatar,
        color: assistant.color,
        role: 'assistant',
        content: '正在思考...',
        thinking: '',
        images: [],
        parentMsgId: parentMsgId,
        favorite: false,
        timestamp: new Date().toISOString()
      };

      // 添加到待回复 Map
      this.pendingGroupReplies.set(thinkingMsgId, assistant);

      this.groupMessages.push(thinkingMsg);
      this.renderGroupMessage(thinkingMsg);
      this.scrollToBottom('group');

      // 保存到数据库
      await this.saveGroupMessage(thinkingMsg);

      // 获取群聊上下文（最近 20条消息）
      const groupContext = this.groupMessages.slice(-20).map(msg => ({
        role: msg.role,
        content: `${msg.sender}: ${msg.content}`
      }));

      // 人设必须拼进 content：picoclaw 不采纳 payload.systemPrompt，
      // 走那个字段的话所有助手都会共用 Gateway 自身的同一套人设
      const persona = assistant.systemPrompt
        ? `[你现在扮演「${assistant.name}」，请严格按此设定回复]\n${assistant.systemPrompt}\n\n---\n\n`
        : '';

      const wsMessage = {
        type: 'message',
        content: `${persona}${userContent}`,
        scope: 'group',
        assistantId: assistant.id,
        context: groupContext
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(wsMessage));
      } else {
        // WebSocket 未连接，更新消息为错误状态
        thinkingMsg.content = '连接断开，无法获取回复';
        this.updateGroupMessage(thinkingMsg);
        this.pendingGroupReplies.delete(thinkingMsgId);
      }
    } catch (error) {
      console.error('生成群聊回复失败:', error);
    }
  }

  updateGroupMessage(message) {
    const msgEl = document.querySelector(`[data-message-id="${message.id}"]`);
    if (msgEl) {
      const bubble = msgEl.querySelector('.bubble');
      if (bubble) {
        bubble.innerHTML = this.renderContent(message.content);
      }
    }
  }

  renderGroupMessage(message) {
    const isAssistant = message.role === 'assistant';
    const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const avatar = isAssistant ? (message.avatar || '🤖') : '👤';
    const senderName = message.sender || '用户';
    const color = isAssistant ? (message.color || '#c97b5a') : 'var(--text)';

    let html = `
      <div class="message-row ${isAssistant ? '' : 'me'}" data-message-id="${message.id}" style="--assistant-color: ${color}">
        <div class="avatar" style="background: ${isAssistant ? color + '20' : 'var(--panel-soft)'}; color: ${color}">${avatar}</div>
        <div class="msg-col">
          <span class="msg-sender" style="color: ${color}">${this.escapeHtml(senderName)}</span>
    `;

    if (message.thinking) {
      html += `<div class="thinking-block">${this.escapeHtml(message.thinking)}</div>`;
    }

    html += `<div class="bubble" style="${isAssistant ? 'border-left: 3px solid ' + color : ''}">`;
    html += this.renderContent(message.content);

    if (message.images && message.images.length > 0) {
      message.images.forEach(img => {
        html += `<img src="${img}" class="msg-image" onclick="app.openLightbox('${img}')" loading="lazy">`;
      });
    }

    html += `
          <div class="bubble-actions">
            <button class="action-btn" onclick="app.copyGroupMessage('${message.id}')" title="复制">📋</button>
            <button class="action-btn" onclick="app.toggleGroupFavorite('${message.id}')" title="收藏" data-favorite="${message.favorite ? 'true' : 'false'}">${message.favorite ? '⭐' : '☆'}</button>
          </div>
        </div>
        <span class="msg-time">${time}</span>
      </div>
    </div>
    `;

    const container = document.querySelector('#tab-group .messages-wrapper');
    if (container) {
      container.insertAdjacentHTML('beforeend', html);
    }
  }

  async loadGroupMessages() {
    try {
      const response = await fetch('/api/group/messages?limit=80', {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();

      if (data.success) {
        this.groupMessages = data.messages;
        this.renderGroupMessages();
      }
    } catch (error) {
      console.error('加载群聊消息失败:', error);
    }
  }

  renderGroupMessages() {
    const container = document.querySelector('#tab-group .messages-wrapper');
    if (!container) return;

    // 保留欢迎消息，清空其他
    const welcome = container.querySelector('.welcome-message');
    container.innerHTML = '';
    if (welcome) container.appendChild(welcome);

    // 渲染消息（支持收藏筛选）
    const messagesToShow = this.showFavoritesOnly
      ? this.groupMessages.filter(m => m.favorite)
      : this.groupMessages;

    messagesToShow.forEach(msg => this.renderGroupMessage(msg));
  }

  toggleGroupSearch() {
    const { groupSearchBar, groupSearchInput } = this.elements;
    const isVisible = groupSearchBar.style.display !== 'none';

    groupSearchBar.style.display = isVisible ? 'none' : 'flex';

    if (!isVisible) {
      groupSearchInput.focus();
    } else {
      groupSearchInput.value = '';
      this.showGroupFavoritesOnly = false;
      this.elements.groupFavoriteFilterBtn.classList.remove('active');
      this.elements.groupSearchCount.textContent = '';
      this.renderGroupMessages();
    }
  }

  toggleGroupFavoritesFilter() {
    this.showGroupFavoritesOnly = !this.showGroupFavoritesOnly;
    this.elements.groupFavoriteFilterBtn.classList.toggle('active', this.showGroupFavoritesOnly);
    this.renderGroupMessages();

    const filtered = this.showGroupFavoritesOnly
      ? this.groupMessages.filter(m => m.favorite)
      : this.groupMessages;
    this.elements.groupSearchCount.textContent = this.showGroupFavoritesOnly
      ? `${filtered.length} 条收藏`
      : '';
  }

  searchGroupMessages(keyword) {
    if (!keyword) {
      this.elements.groupSearchCount.textContent = '';
      this.renderGroupMessages();
      return;
    }

    const messages = this.showGroupFavoritesOnly
      ? this.groupMessages.filter(m => m.favorite)
      : this.groupMessages;

    const results = messages.filter(m =>
      m.content && m.content.toLowerCase().includes(keyword.toLowerCase())
    );

    this.elements.groupSearchCount.textContent = `${results.length} 条结果`;

    // 渲染搜索结果
    const container = document.querySelector('#tab-group .messages-wrapper');
    if (!container) return;

    const welcome = container.querySelector('.welcome-message');
    container.innerHTML = '';
    if (welcome) container.appendChild(welcome);

    results.forEach(msg => this.renderGroupMessage(msg));
  }

  async clearGroupMessages() {
    if (!confirm('确定要清空群聊消息吗？')) return;

    try {
      const response = await fetch('/api/group/messages', {
        method: 'DELETE',
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });

      const data = await response.json();
      if (data.success) {
        this.groupMessages = [];
        this.renderGroupMessages();
        this.showToast('success', '已清空', '群聊消息已清空');
      }
    } catch (error) {
      console.error('清空群聊失败:', error);
    }
  }

  copyGroupMessage(messageId) {
    const message = this.groupMessages.find(m => m.id === messageId);
    if (!message) return;

    navigator.clipboard.writeText(message.content).then(() => {
      this.showToast('success', '已复制', '消息已复制到剪贴板');
    });
  }

  async toggleGroupFavorite(messageId) {
    try {
      const response = await fetch(`/api/group/messages/${messageId}/favorite`, {
        method: 'POST',
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });

      const data = await response.json();
      if (data.success) {
        const message = this.groupMessages.find(m => m.id === messageId);
        if (message) {
          message.favorite = data.message.favorite;
          // 更新 UI
          const btn = document.querySelector(`[data-message-id="${messageId}"] [data-favorite]`);
          if (btn) {
            btn.dataset.favorite = data.message.favorite ? 'true' : 'false';
            btn.textContent = data.message.favorite ? '⭐' : '☆';
          }
        }
      }
    } catch (error) {
      console.error('收藏失败:', error);
    }
  }

  // ===== 文档系统 =====
  async loadDocuments() {
    try {
      const response = await fetch('/api/documents', {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();

      if (data.success) {
        this.renderDocumentList(data.documents);
      }
    } catch (error) {
      console.error('加载文档失败:', error);
    }
  }

  renderDocumentList(documents) {
    const { documentList } = this.elements;

    if (documents.length === 0) {
      documentList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <p>暂无文档</p>
        </div>
      `;
      return;
    }

    documentList.innerHTML = documents.map(doc => `
      <div class="document-item" data-document-id="${doc.id}">
        <div class="document-header">
          <div class="document-title">${this.escapeHtml(doc.title)}</div>
          <div class="document-actions">
            <button class="btn-icon" onclick="app.viewDocument('${doc.id}')" title="查看">👁️</button>
            <button class="btn-icon" onclick="app.deleteDocument('${doc.id}')" title="删除">🗑️</button>
          </div>
        </div>
        <div class="document-meta">
          <span>大小: ${this.formatSize(doc.size)}</span>
          <span>创建: ${new Date(doc.createdAt).toLocaleDateString('zh-CN')}</span>
        </div>
      </div>
    `).join('');
  }

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async createDocument() {
    const title = prompt('文档标题:');
    if (!title) return;

    const content = prompt('文档内容:');
    if (!content) return;

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.verifiedSessionId
        },
        body: JSON.stringify({ title, content })
      });

      const data = await response.json();
      if (data.success) {
        this.loadDocuments();
      } else {
        alert(data.error || '上传失败');
      }
    } catch (error) {
      console.error('创建文档失败:', error);
      alert('上传失败');
    }
  }

  async viewDocument(id) {
    try {
      const response = await fetch(`/api/documents/${id}`, {
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });
      const data = await response.json();

      if (data.success) {
        alert(`文档内容:\n\n${data.content}`);
      }
    } catch (error) {
      console.error('查看文档失败:', error);
    }
  }

  async deleteDocument(id) {
    if (!confirm('确定要删除这个文档吗？')) return;

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        headers: { 'X-Session-Id': this.verifiedSessionId }
      });

      const data = await response.json();
      if (data.success) {
        this.loadDocuments();
      }
    } catch (error) {
      console.error('删除文档失败:', error);
    }
  }

  // ===== 事件绑定 =====
  bindEvents() {
    const { elements } = this;

    // 认证
    elements.authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const key = elements.accessKeyInput.value.trim();
      if (key) {
        this.verifyAccessKey(key, elements.rememberKey.checked);
      }
    });

    // 侧边栏导航
    elements.navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });

    // 移动端标签
    elements.mobileTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });

    // 退出登录
    elements.logoutBtn.addEventListener('click', () => this.logout());

    // 消息输入
    elements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          this.sendMessage();
        } else {
          this.addDraft();
        }
      }
    });

    // 自动调整输入框高度
    elements.messageInput.addEventListener('input', () => {
      elements.messageInput.style.height = 'auto';
      elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 200) + 'px';
    });

    // 发送按钮
    elements.sendBtn.addEventListener('click', () => {
      if (this.isBusy) {
        this.stopGenerating();
      } else {
        this.sendMessage();
      }
    });

    // 群聊输入
    if (elements.groupMessageInput) {
      elements.groupMessageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const content = elements.groupMessageInput.value.trim();
          if (content) {
            this.sendGroupMessage(content);
            elements.groupMessageInput.value = '';
            elements.groupMessageInput.style.height = 'auto';
            this.hideMentionMenu();
          }
        }
        // Escape 关闭菜单
        if (e.key === 'Escape') {
          this.hideMentionMenu();
        }
      });

      elements.groupMessageInput.addEventListener('input', (e) => {
        elements.groupMessageInput.style.height = 'auto';
        elements.groupMessageInput.style.height = Math.min(elements.groupMessageInput.scrollHeight, 200) + 'px';

        // 检测 @输入
        const value = e.target.value;
        const cursorPos = e.target.selectionStart;
        const textBeforeCursor = value.substring(0, cursorPos);
        const lastAt = textBeforeCursor.lastIndexOf('@');

        if (lastAt >= 0) {
          // 检查 @后面是否还有空格（表示已经选择了助手）
          const textAfterAt = textBeforeCursor.substring(lastAt + 1);
          if (!textAfterAt.includes(' ')) {
            // 正在输入 @助手名，显示菜单
            this.showMentionMenu();
            return;
          }
        }

        // 隐藏菜单
        this.hideMentionMenu();
      });

      // 点击其他地方关闭菜单
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#mentionMenu') && !e.target.closest('#groupMessageInput')) {
          this.hideMentionMenu();
        }
      });
    }

    if (elements.groupSendBtn) {
      elements.groupSendBtn.addEventListener('click', () => {
        const content = elements.groupMessageInput.value.trim();
        if (content) {
          this.sendGroupMessage(content);
          elements.groupMessageInput.value = '';
          elements.groupMessageInput.style.height = 'auto';
        }
      });
    }

    // 助手设置
    if (elements.assistantSettingsBtn) {
      elements.assistantSettingsBtn.addEventListener('click', () => this.showAssistantSettings());
    }
    if (elements.assistantSettingsClose) {
      elements.assistantSettingsClose.addEventListener('click', () => this.hideAssistantSettings());
    }
    if (elements.addAssistantBtn) {
      elements.addAssistantBtn.addEventListener('click', () => this.addAssistant());
    }

    // 新建会话
    elements.newChatBtn.addEventListener('click', () => this.newChat());

    // 历史记录
    elements.historyBtn.addEventListener('click', () => this.loadHistory());
    elements.historyModalClose.addEventListener('click', () => {
      elements.historyModal.style.display = 'none';
    });
    elements.historySessionSelect.addEventListener('change', (e) => {
      this.loadSession(e.target.value);
    });
    elements.historyDownloadBtn.addEventListener('click', () => this.downloadSession());
    elements.historyResumeBtn.addEventListener('click', () => this.resumeSession());
    elements.historyDeleteBtn.addEventListener('click', () => this.deleteSession());
    elements.refreshHistoryBtn.addEventListener('click', () => this.loadHistory());

    // 主题切换
    elements.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    elements.themeSelect.addEventListener('change', (e) => {
      this.setTheme(e.target.value);
    });

    // 搜索
    elements.searchBtn.addEventListener('click', () => this.toggleSearch('chat'));
    elements.searchClose.addEventListener('click', () => this.toggleSearch());
    if (elements.favoriteFilterBtn) {
      elements.favoriteFilterBtn.addEventListener('click', () => this.toggleFavoritesFilter());
    }
    elements.searchInput.addEventListener('input', (e) => {
      this.searchMessages(e.target.value);
    });

    // 群聊搜索和清空
    if (elements.groupSearchBtn) {
      elements.groupSearchBtn.addEventListener('click', () => this.toggleGroupSearch());
    }
    if (elements.groupSearchClose) {
      elements.groupSearchClose.addEventListener('click', () => this.toggleGroupSearch());
    }
    if (elements.groupFavoriteFilterBtn) {
      elements.groupFavoriteFilterBtn.addEventListener('click', () => this.toggleGroupFavoritesFilter());
    }
    if (elements.groupSearchInput) {
      elements.groupSearchInput.addEventListener('input', (e) => {
        this.searchGroupMessages(e.target.value);
      });
    }
    if (elements.groupClearBtn) {
      elements.groupClearBtn.addEventListener('click', () => this.clearGroupMessages());
    }

    // 图片上传
    elements.imageUploadBtn.addEventListener('click', () => {
      elements.imageUploadInput.click();
    });
    elements.imageUploadInput.addEventListener('change', async (e) => {
      await this.handleImageSelect(e.target.files);
    });

    // 图片预览容器
    this.imagePreviewContainer = document.getElementById('imagePreviewContainer');
    this.imagePreviewList = document.getElementById('imagePreviewList');

    // 贴纸
    elements.stickerToggleBtn.addEventListener('click', () => this.toggleStickerPanel());
    elements.stickerUploadBtn.addEventListener('click', () => {
      elements.stickerUploadInput.click();
    });
    elements.stickerUploadInput.addEventListener('change', (e) => {
      this.handleStickerUpload(e.target.files);
    });

    // 加载贴纸列表
    this.loadStickers();

    // 控制台
    elements.consoleSendBtn.addEventListener('click', () => {
      const command = elements.consoleInput.value.trim();
      if (command) {
        this.executeCommand(command);
        elements.consoleInput.value = '';
      }
    });

    elements.consoleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        elements.consoleSendBtn.click();
      }
    });

    // 控制台快捷按钮
    document.querySelectorAll('.shortcut-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        elements.consoleInput.value = btn.dataset.cmd;
        elements.consoleInput.focus();
      });
    });

    // 记忆
    elements.addMemoryBtn.addEventListener('click', () => {
      this.createMemory();
    });
    elements.uploadMemoryBtn.addEventListener('click', () => {
      elements.memoryUploadInput.click();
    });
    elements.memorySearchInput.addEventListener('input', (e) => {
      this.searchMemories(e.target.value);
    });
    elements.memoryUploadInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleMemoryUpload(e.target.files);
      }
      e.target.value = '';
    });

    // 文档
    elements.addDocumentBtn.addEventListener('click', () => {
      this.createDocument();
    });

    // 设置
    elements.themeSelect.addEventListener('change', (e) => {
      this.setTheme(e.target.value);
    });
    elements.notificationsToggle.addEventListener('change', async (e) => {
      if (e.target.checked) {
        const granted = await this.requestNotificationPermission();
        if (!granted) {
          e.target.checked = false;
          alert('请在浏览器设置中允许通知权限');
          return;
        }
      }
    });
    if (elements.saveSettingsBtn) {
      elements.saveSettingsBtn.addEventListener('click', () => {
        this.saveSettings();
        this.showToast('success', '已保存', '设置已保存成功');
      });
    }

    // 灯箱
    elements.lightboxClose.addEventListener('click', () => this.closeLightbox());
    elements.lightbox.addEventListener('click', (e) => {
      if (e.target === elements.lightbox || e.target.classList.contains('lightbox-overlay')) {
        this.closeLightbox();
      }
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeLightbox();
        if (this.elements.historyModal.style.display === 'flex') {
          this.elements.historyModal.style.display = 'none';
        }
        if (this.elements.searchBar.style.display !== 'none') {
          this.toggleSearch();
        }
      }
    });
  }
}

// 初始化应用
const app = new ClawAgent();

// 导出供全局使用
window.app = app;

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('✅ Service Worker 注册成功:', registration.scope);
      })
      .catch(error => {
        console.warn('⚠️ Service Worker 注册失败:', error);
      });
  });
}
