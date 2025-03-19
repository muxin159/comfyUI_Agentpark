import { MessageComponent } from './messageComponent.js';
import { InputComponent } from './inputComponent.js';

export class MXChatSidebar {
    constructor() {
        this.visible = false;
        this.currentMode = 'agent';
        this.lastWidth = null;
        this.modeMessages = {
            agent: [],
            chat: [],
            build: []
        };
        this.setupWebSocket();
        this.renderToggleButton();
        this.renderSidebar();
        this.initDragAndResize();
    }

    setupWebSocket() {
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
            this.ws.close();
        }
    
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8188/ws`;
        // 确保 clientId 只在首次生成时创建，之后复用
        let clientId = localStorage.getItem('mxChatClientId');
        if (!clientId) {
            clientId = this.generateClientId();
            localStorage.setItem('mxChatClientId', clientId);
        }
        this.ws = new WebSocket(`${wsUrl}?clientId=${clientId}`);
        this.wsReady = false;
        this.ws.binaryType = 'arraybuffer';
    
        const connectionTimeout = setTimeout(() => {
            if (!this.wsReady) {
                console.error(`[ERROR] ${new Date().toISOString()} - WebSocket 连接超时`);
                this.ws.close();
            }
        }, 10000);
    
        this.ws.addEventListener('open', () => {
            clearTimeout(connectionTimeout);
            console.log(`[INFO] ${new Date().toISOString()} - WebSocket 连接已建立，客户端 ID: ${clientId}`);
            this.wsReady = true;
            // 移除重复的 localStorage.setItem，因为已经在上面设置
        });
    
        this.ws.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log(`[INFO] ${new Date().toISOString()} - 收到消息:`, data);
    
                const messageHandlers = {
                    'status': (d) => console.log(`[INFO] 队列状态:`, d.data.status),
                    'executing': (d) => console.log(`[INFO] 当前执行节点:`, d.data.node),
                    'mx-chat-message': (d) => {
                        if (this.currentMode === 'agent' && d.data?.text && typeof this.addMessage === 'function') {
                            this.addMessage(d.data.text, d.data.isUser || false, d.data.imageData || null);
                        }
                    },
                    'imageData_ack': (d) => {
                        if (d.success) {
                            console.log(`[INFO] 图像数据发送成功`);
                            const imageSendNode = app?.graph?._nodes?.find(n => n.type === 'MXChatImageSendNode');
                            if (imageSendNode) {
                                app.graph.runStep(imageSendNode);
                                app.queuePrompt();
                            }
                        }
                    },
                    'config_updated': (d) => {
                        const event = { data: JSON.stringify({ event: 'config_updated', data: d }) };
                        if (this.inputComponent && typeof this.inputComponent.handleWebSocketMessage === 'function') {
                            this.inputComponent.handleWebSocketMessage(event);
                        } else {
                            console.warn('[WARN] InputComponent 未定义或缺少 handleWebSocketMessage 方法');
                        }
                    }
                };
    
                const handler = messageHandlers[data.type || data.event];
                if (handler) handler(data);
                else console.log(`[WARN] 未识别的消息类型: ${data.type || data.event}`);
            } catch (error) {
                console.error(`[ERROR] 解析 WebSocket 消息失败:`, error);
            }
        });
    
        this.ws.addEventListener('close', () => {
            console.log(`[WARN] ${new Date().toISOString()} - WebSocket 连接已关闭`);
            this.wsReady = false;
            this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
            setTimeout(() => this.setupWebSocket(), delay);
        });
    
        this.ws.addEventListener('error', (error) => {
            console.error(`[ERROR] WebSocket 错误:`, error);
            this.wsReady = false;
        });
    }
    
    generateClientId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    sendMessage(text, imageData = null, tableData = null) {
        if (!text && !imageData && !tableData) return;

        // 处理用户发送的消息
        if (tableData) {
            const messageText = `文件名: ${tableData.fileName}\n\n表格已上传`;
            this.addMessage(messageText, true);
        } else {
            this.addMessage(text || (imageData ? '发送了一张图片' : ''), true, imageData);
        }

        const sendData = async () => {
            try {
                if (this.currentMode === 'agent') {
                    if (!app || !app.graph || !app.graph._nodes) {
                        throw new Error('当前环境未初始化，无法处理消息。请确保工作流已加载。');
                    }

                    if (text || imageData || tableData) {
                        // 处理普通文本消息
                        const sendNode = app.graph._nodes.find(n => n.type === 'MXChatSend');
                        if (!sendNode) throw new Error('MXChatSend 节点未找到，请在工作流中添加该节点。');
                        const widget = sendNode.widgets.find(w => w.name === 'text');
                        if (!widget) throw new Error('MXChatSend 节点缺少 text 小部件');
                        widget.value = text || '';

                        // 处理图片数据
                        if (imageData) {
                            const imageSendNode = app.graph._nodes.find(n => n.type === 'MXChatImageSend');
                            if (!imageSendNode) throw new Error('MXChatImageSendNode 节点未找到，请在工作流中添加该节点。');
                            const imageWidget = imageSendNode.widgets.find(w => w.name === 'image_data');
                            const textWidget = imageSendNode.widgets.find(w => w.name === 'text');
                            if (!imageWidget) throw new Error('MXChatImageSendNode 缺少 image_data 小部件');
                            imageWidget.value = imageData;
                            if (textWidget) textWidget.value = "";
                        }

                        // 处理表格数据
                        if (tableData) {
                            const tableSendNode = app.graph._nodes.find(n => n.type === 'MXChatTableSend');
                            if (!tableSendNode) throw new Error('MXChatTableSendNode 节点未找到，请在工作流中添加该节点。');
                            const tableWidget = tableSendNode.widgets.find(w => w.name === 'table_data');
                            const typeWidget = tableSendNode.widgets.find(w => w.name === 'file_type');
                            const nameWidget = tableSendNode.widgets.find(w => w.name === 'file_name');
                            if (!tableWidget || !typeWidget || !nameWidget) throw new Error('MXChatTableSendNode 缺少必要小部件');
                            tableWidget.value = tableData.tableData;
                            typeWidget.value = tableData.fileType;
                            nameWidget.value = tableData.fileName;
                        }

                        await app.queuePrompt();
                       
                    }
                } else if (this.currentMode === 'chat') {
                    const streamMessage = new MessageComponent({ text: '', reasoning_content: '' }, false);
                    streamMessage.appendTo(this.messagesContainer);
                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

                    const response = await fetch('http://localhost:8166/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: text || (imageData ? '用户上传了一张图片' : (tableData ? `用户上传了表格文件: ${tableData.fileName}` : '')),
                            mode: 'chat',
                            imageData,
                            tableData: tableData ? { table_data: tableData.tableData, file_type: tableData.fileType, file_name: tableData.fileName } : null,
                            clientId: localStorage.getItem('mxChatClientId')
                        })
                    });

                    if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let accumulatedText = { text: '', reasoning_content: '' };
                    let buffer = '';

                    const readStream = async () => {
                        const { done, value } = await reader.read();
                        if (done) {
                            console.log('流式响应结束');
                            if (buffer.trim()) {
                                try {
                                    const data = JSON.parse(buffer);
                                    accumulatedText.text += data.text || '';
                                    accumulatedText.reasoning_content += data.reasoning_content || '';
                                    streamMessage.updateText(accumulatedText);
                                } catch (e) {
                                    console.error('解析剩余缓冲区失败:', e, '数据:', buffer);
                                }
                            }
                            return;
                        }
                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;
                        const lines = buffer.split('\n');
                        buffer = lines.pop();

                        for (const line of lines) {
                            if (line.trim()) {
                                try {
                                    const data = JSON.parse(line);
                                    console.log('收到数据块:', data);
                                    if (data.error) {
                                        accumulatedText.text = `错误: ${data.error}`;
                                        streamMessage.updateText(accumulatedText);
                                        return;
                                    }
                                    if (data.reasoning_content) {
                                        accumulatedText.reasoning_content += data.reasoning_content;
                                    }
                                    if (data.text) {
                                        accumulatedText.text += data.text;
                                    }
                                    streamMessage.updateText(accumulatedText);
                                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                                } catch (e) {
                                    console.error('解析流数据失败:', e, '原始数据:', line);
                                }
                            }
                        }
                        await readStream();
                    };
                    await readStream();
                } else {
                    throw new Error('当前模式不支持或环境未正确初始化');
                }
            } catch (error) {
                console.error(`[ERROR] ${new Date().toISOString()} - 发送消息失败:`, error);
                this.addMessage(`错误：${error.message}`, false);
            }
        };

        sendData();
    }

    renderToggleButton() {
        this.toggleButton = document.createElement('div');
        this.toggleButton.className = 'mx-chat-toggle';
        this.hoverMenu = document.createElement('div');
        this.hoverMenu.className = 'mx-chat-hover-menu';

        const settingsItem = document.createElement('div');
        settingsItem.className = 'mx-chat-hover-item mx-chat-settings-btn';
        settingsItem.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.65.07-.97 0-.32-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.30-.61-.22l-2.39 0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12,0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>`;
        settingsItem.addEventListener('click', () => this.showSettings());
        this.hoverMenu.appendChild(settingsItem);

        const mainButton = document.createElement('div');
        mainButton.className = 'mx-chat-drag-handle';
        mainButton.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M6,9H18V11H6M14,14H6V12H14M18,8H6V6H18"/>
            </svg>
        `;
        let lastClickTime = 0;
        mainButton.onclick = (e) => {
            const currentTime = new Date().getTime();
            if (currentTime - lastClickTime < 300) this.toggleVisibility();
            lastClickTime = currentTime;
        };

        this.toggleButton.appendChild(mainButton);
        this.toggleButton.appendChild(this.hoverMenu);
        document.body.appendChild(this.toggleButton);
    }

    renderSidebar() {
        this.sidebar = document.createElement('div');
        this.sidebar.className = 'mx-chat-sidebar';

        const header = document.createElement('div');
        header.className = 'mx-chat-header';
        header.textContent = 'MX Chat';
        header.addEventListener('click', () => this.showSettings());

        const modeSelector = document.createElement('div');
        modeSelector.className = 'mx-chat-mode-selector';
        ['agent', 'chat', 'build'].forEach(mode => {
            const modeOption = document.createElement('div');
            modeOption.className = `mx-chat-mode-option ${mode === 'agent' ? 'active' : ''}`;
            modeOption.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
            modeOption.onclick = () => this.switchMode(mode, modeOption);
            if (mode === 'chat') modeOption.ondblclick = () => this.showSettings();
            modeSelector.appendChild(modeOption);
        });

        this.messagesContainer = document.createElement('div');
        this.messagesContainer.className = 'mx-chat-messages';

        const inputContainer = document.createElement('div');
        inputContainer.className = 'mx-chat-input-container';
        this.inputComponent = new InputComponent(
            '输入指令让AI助手帮你完成任务...',
            (text, imageData, tableData) => this.sendMessage(text, imageData, tableData),
            this.ws,
            this.hoverMenu
        );
        this.inputComponent.appendTo(inputContainer);

        this.sidebar.appendChild(header);
        this.sidebar.appendChild(modeSelector);
        this.sidebar.appendChild(this.messagesContainer);
        this.sidebar.appendChild(inputContainer);
        document.body.appendChild(this.sidebar);
    }

    initDragAndResize() {
        this.initDrag();
        this.initResize();
        const rightX = window.innerWidth - this.toggleButton.offsetWidth - 180;
        const bottomY = window.innerHeight - this.toggleButton.offsetHeight - 40;
        this.toggleButton.style.left = `${rightX}px`;
        this.toggleButton.style.top = `${bottomY}px`;
    }

    initDrag() {
        let isDragging = false;
        let offsetX, offsetY;
        const dragStart = (e) => {
            if (e.target === this.toggleButton || this.toggleButton.contains(e.target)) {
                e.preventDefault();
                isDragging = true;
                const rect = this.toggleButton.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                this.toggleButton.style.transition = 'none';
            }
        };
        const drag = (e) => {
            if (isDragging) {
                e.preventDefault();
                const x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - this.toggleButton.offsetWidth));
                const y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - this.toggleButton.offsetHeight));
                this.toggleButton.style.left = `${x}px`;
                this.toggleButton.style.top = `${y}px`;
            }
        };
        const dragEnd = () => {
            if (isDragging) {
                isDragging = false;
                this.toggleButton.style.transition = 'transform 0.2s';
            }
        };
        this.toggleButton.addEventListener('mousedown', dragStart, { passive: false });
        document.addEventListener('mousemove', drag, { passive: false });
        document.addEventListener('mouseup', dragEnd);
    }

    initResize() {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'mx-chat-resize-handle';
        this.sidebar.appendChild(resizeHandle);

        let isResizing = false;
        let startX, startWidth;
        const startResize = (e) => {
            e.stopPropagation();
            isResizing = true;
            startX = e.clientX;
            startWidth = parseInt(getComputedStyle(this.sidebar).width, 10);
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
        };
        const resize = (e) => {
            if (isResizing) {
                e.stopPropagation();
                const width = startWidth + (startX - e.clientX);
                if (width > 200 && width) this.sidebar.style.width = `${width}px`;
            }
        };
        const stopResize = () => {
            isResizing = false;
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
        };
        resizeHandle.addEventListener('mousedown', startResize);
    }

    toggleVisibility() {
        this.visible = !this.visible;
        this.sidebar.style.right = this.visible ? '0' : '-100%';
        if (this.visible && this.lastWidth) this.sidebar.style.width = this.lastWidth;
        else if (!this.visible) this.lastWidth = this.sidebar.style.width;
        this.sidebar.classList.toggle('visible');
    }

    switchMode(mode, element) {
        document.querySelectorAll('.mx-chat-mode-option').forEach(m => m.classList.remove('active'));
        element.classList.add('active');
        this.currentMode = mode;

        const placeholders = {
            agent: '请输入你的提示词',
            chat: '和牧小新对话吧...',
            build: '构建中...敬请期待'
        };
        this.inputComponent.setPlaceholder(placeholders[mode]);

        this.messagesContainer.innerHTML = '';
        this.modeMessages[mode].forEach(messageComponent => {
            messageComponent.appendTo(this.messagesContainer);
        });
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'mode_change', mode }));
        }
    }

    addMessage(message, isUser = false, imageData = null) {
        const messageComponent = new MessageComponent(message, isUser, imageData);
        this.modeMessages[this.currentMode].push(messageComponent);
        messageComponent.appendTo(this.messagesContainer);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    receiveWorkflowMessage(message) {
        if (this.currentMode === 'agent') {
            this.addMessage(message, false);
        }
    }

    showSettings() {
        this.inputComponent.showSettings();
    }
}

// 内联样式（无变化）
const styleElement = document.createElement('style');
styleElement.textContent = `
    .mx-chat-toggle {
        position: fixed;
        width: 50px;
        height: 50px;
        background: var(--comfy-input-bg);
        border: 1px solid var(--border-color);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        transition: opacity 0.6s ease, transform 0.6s ease;
        user-select: none;
        touch-action: none;
        cursor: pointer;
    }
    .mx-chat-toggle:hover {
        background: var(--comfy-input-bg-hover);
        height: auto;
        border-radius: 25px;
        padding: 10px 0;
    }
    .mx-chat-toggle svg {
        width: 24px;
        height: 24px;
        fill: var(--input-text);
    }
    .mx-chat-hover-menu {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%) scale(0.95);
        background: var(--comfy-input-bg);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 1001;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        transform-origin: bottom center;
    }
    .mx-chat-toggle:hover .mx-chat-hover-menu, .mx-chat-hover-menu:hover {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) scale(1);
        transition-delay: 0s;
    }
    .mx-chat-hover-item {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        cursor: pointer;
        color: var(--input-text);
        transition: background-color 0.2s;
        border-radius: 50%;
    }
    .mx-chat-hover-item:hover {
        background: var(--comfy-input-bg-hover);
    }
    .mx-chat-hover-item svg {
        width: 20px;
        height: 20px;
        fill: var(--input-text);
    }
    .mx-chat-sidebar {
        position: fixed;
        right: -300px;
        top: 0;
        min-width: 300px;
        height: 100%;
        background: var(--comfy-input-bg);
        border-left: 4px solid rgba(128, 128, 128, 0.5);
        display: flex;
        flex-direction: column;
        z-index: 999;
        transition: right 0.5s;
    }
    .mx-chat-sidebar.visible {
        right: 0;
    }
    .mx-chat-resize-handle {
        position: absolute;
        left: 0;
        top: 0;
        width: 4px;
        height: 100%;
        cursor: ew-resize;
        background: transparent;
        transition: background-color 0.2s;
        user-select: none;
    }
    .mx-chat-resize-handle:hover {
        background: var(--border-color);
        opacity: 0.8;
    }
    .mx-chat-sidebar.resizing {
        user-select: none;
    }
    .mx-chat-header {
        padding: 10px;
        border-bottom: 1px solid var(--border-color);
        background: var(--comfy-menu-bg);
        color: var(--input-text);
    }
    .mx-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        padding-bottom: 160px;
    }
    .mx-chat-mode-selector {
        display: flex;
        justify-content: space-around;
        padding: 10px;
        border-bottom: 1px solid var(--border-color);
        background: var(--comfy-menu-bg);
    }
    .mx-chat-mode-option {
        position: relative;
        padding: 8px 16px;
        cursor: pointer;
        color: var(--input-text);
        font-weight: 500;
        transition: all 0.3s ease;
    }
    .mx-chat-mode-option::after {
        content: '';
        position: absolute;
        bottom: -2px;
        left: 0;
        width: 100%;
        height: 4px;
        background: var(--input-text);
        border-radius: 2px;
        opacity: 0.25;
        transition: opacity 0.3s ease;
    }
    .mx-chat-mode-option.active::after {
        opacity: 0.75;
    }
    .mx-chat-mode-option:hover::after {
        opacity: 0.5;
    }
`;
document.head.appendChild(styleElement);