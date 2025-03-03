import { app } from "../../scripts/app.js";

// 基础 UI 组件类
class MXChatComponent {
    constructor() {
        this.element = null;
    }

    createElement(tagName, className = '') {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        return element;
    }

    appendTo(parent) {
        if (parent && this.element) parent.appendChild(this.element);
    }

    remove() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

// 工具函数：动态调整输入框高度
function adjustTextareaHeight(textarea) {
    const scrollPos = textarea.scrollTop;
    const tempDiv = document.createElement('div');
    Object.assign(tempDiv.style, {
        visibility: 'hidden',
        position: 'absolute',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        width: `${textarea.clientWidth}px`,
        font: window.getComputedStyle(textarea).font,
        padding: window.getComputedStyle(textarea).padding,
        boxSizing: 'border-box'
    });
    tempDiv.textContent = textarea.value || ' ';
    document.body.appendChild(tempDiv);
    const contentHeight = tempDiv.offsetHeight;
    document.body.removeChild(tempDiv);

    const lineHeight = 24;
    const minHeight = lineHeight * 2;
    const maxHeight = lineHeight * 10;
    const actualLines = Math.ceil(contentHeight / lineHeight);
    const newHeight = Math.min(Math.max(lineHeight * actualLines, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = actualLines > 10 ? 'auto' : 'hidden';
    textarea.scrollTop = scrollPos;
}

// 消息显示组件
class MessageComponent extends MXChatComponent {
    constructor(message, isUser = false, imageData = null) {
        super();
        this.message = message;
        this.isUser = isUser;
        this.imageData = imageData;
        this.render();
    }

    render() {
        this.element = this.createElement('div', `mx-chat-message ${this.isUser ? 'user' : 'assistant'}`);
        
        const header = this.createElement('div', 'mx-chat-message-header');
        const avatar = this.createElement('div', 'mx-chat-avatar');
        avatar.textContent = this.isUser ? '魔' : '牧';
        const sender = this.createElement('div', 'mx-chat-sender');
        sender.textContent = this.isUser ? 'comfy大魔导师' : '牧小新';
        header.appendChild(avatar);
        header.appendChild(sender);

        const content = this.createElement('div', 'mx-chat-message-content');
        const text = this.createElement('div', 'mx-chat-text');
        text.textContent = typeof this.message === 'string' ? this.message : this.message.text;
        content.appendChild(text);

        if (this.imageData) {
            const imageContainer = this.createElement('div', 'mx-chat-image');
            const image = this.createElement('img');
            image.src = `data:image/png;base64,${this.imageData}`;
            image.addEventListener('click', this.showImageModal.bind(this));
            imageContainer.appendChild(image);
            content.appendChild(imageContainer);
        }

        this.element.appendChild(header);
        this.element.appendChild(content);
    }

    showImageModal() {
        const modal = this.createElement('div', 'mx-chat-image-modal');
        const modalContent = this.createElement('div', 'mx-chat-image-modal-content');
        const modalImg = this.createElement('img');
        modalImg.src = `data:image/png;base64,${this.imageData}`;
        modalContent.appendChild(modalImg);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        setTimeout(() => modal.classList.add('visible'), 0);
        modal.addEventListener('click', () => {
            modal.classList.remove('visible');
            setTimeout(() => modal.remove(), 300);
        });
    }
}

// 输入组件
class InputComponent extends MXChatComponent {
    constructor(placeholder = '', onSend = null, ws = null, hoverMenu = null) {
        super();
        this.placeholder = placeholder;
        this.onSend = onSend;
        this.ws = ws;
        this.hoverMenu = hoverMenu;
        this.config = {
            modelName: localStorage.getItem('mxChatModelName') || '',
            url: localStorage.getItem('mxChatUrl') || '',
            apiKey: localStorage.getItem('mxChatApiKey') || ''
        };
        this.render();
        this.dragUploadHandler = new DragUploadHandler(this.input, this.imagePreview, this.createElement.bind(this));
    }

    render() {
        this.element = this.createElement('div', 'mx-chat-input-container');
        
        this.input = this.createElement('textarea', 'mx-chat-input');
        this.input.placeholder = this.placeholder;
        Object.assign(this.input.style, {
            width: '100%',
            resize: 'none',
            height: '48px',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '4px'
        });
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });
        this.input.addEventListener('input', () => adjustTextareaHeight(this.input));
        const resizeObserver = new ResizeObserver(() => adjustTextareaHeight(this.input));
        resizeObserver.observe(this.input);
        resizeObserver.observe(this.element);

        this.imagePreview = this.createElement('div', 'mx-chat-image-preview');
        this.element.appendChild(this.imagePreview);

        this.setupControls();

        this.element.appendChild(this.input);
        this.element.appendChild(this.controls);
    }

    setupControls() {
        this.controls = this.createElement('div', 'mx-chat-controls');

        const micButton = this.createElement('button', 'mx-chat-mic-btn');
        const micIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        micIcon.setAttribute('viewBox', '0 0 24 24');
        micIcon.innerHTML = '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>';
        micButton.appendChild(micIcon);
        micButton.addEventListener('click', this.toggleRecording.bind(this));

        const sendButton = this.createElement('button', 'mx-chat-send');
        sendButton.textContent = '发送';
        sendButton.addEventListener('click', this.handleSend.bind(this));

        const imageButton = this.createElement('button', 'mx-chat-image-btn');
        const imageIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        imageIcon.setAttribute('viewBox', '0 0 24 24');
        imageIcon.innerHTML = '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>';
        imageButton.appendChild(imageIcon);
        const fileInput = this.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        imageButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', this.handleImageUpload.bind(this));

        this.controls.appendChild(micButton);
        this.controls.appendChild(imageButton);
        this.controls.appendChild(fileInput);
        this.controls.appendChild(sendButton);
    }

    async toggleRecording() {
        if (!this.isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                this.audioChunks = [];
                this.mediaRecorder.ondataavailable = (e) => this.audioChunks.push(e.data);
                this.mediaRecorder.onstop = this.processAudio.bind(this);
                this.mediaRecorder.start();
                this.isRecording = true;
                this.controls.querySelector('.mx-chat-mic-btn').style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
            } catch (error) {
                console.error('获取麦克风权限失败:', error);
            }
        } else {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.controls.querySelector('.mx-chat-mic-btn').style.backgroundColor = '';
        }
    }

    async processAudio() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const audioContext = new AudioContext();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const offlineContext = new OfflineAudioContext({
            numberOfChannels: audioBuffer.numberOfChannels,
            length: audioBuffer.length,
            sampleRate: audioBuffer.sampleRate
        });
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();
        const renderedBuffer = await offlineContext.startRendering();
        const wavBlob = this.convertToWav(renderedBuffer);

        const formData = new FormData();
        formData.append('audio', wavBlob, 'recording.wav');
        try {
            const response = await fetch('http://localhost:8000/whisper', {
                method: 'POST',
                headers: { 'Accept': 'application/json' },
                body: formData
            });
            if (response.ok) {
                const data = await response.json();
                if (data.text) this.input.value = data.text;
            } else {
                throw new Error('语音识别失败');
            }
        } catch (error) {
            console.error('语音识别失败:', error);
            app?.ui?.notifications?.create('error', `语音识别失败: ${error.message}`, { timeout: 5000 });
        }
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    convertToWav(audioBuffer) {
        const length = audioBuffer.length * audioBuffer.numberOfChannels * 2;
        const buffer = new ArrayBuffer(44 + length);
        const view = new DataView(buffer);
        const writeString = (offset, str) => str.split('').forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, audioBuffer.numberOfChannels, true);
        view.setUint32(24, audioBuffer.sampleRate, true);
        view.setUint32(28, audioBuffer.sampleRate * 2, true);
        view.setUint16(32, audioBuffer.numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length, true);
        const samples = audioBuffer.getChannelData(0);
        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            const sample = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
        return new Blob([buffer], { type: 'audio/wav' });
    }

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64Data = e.target.result;
                this.imagePreview.style.display = 'block';
                const previewContainer = this.createElement('div', 'mx-chat-preview-container');
                const previewImage = this.createElement('img', 'mx-chat-preview-image');
                previewImage.src = base64Data;
                Object.assign(previewImage.style, {
                    maxWidth: '50px',
                    maxHeight: '50px',
                    objectFit: 'contain'
                });
                const deleteButton = this.createElement('button', 'mx-chat-preview-delete');
                deleteButton.innerHTML = '×';
                deleteButton.onclick = () => {
                    previewContainer.remove();
                    e.target.value = '';
                    if (this.imagePreview.children.length === 0) {
                        this.imagePreview.style.display = 'none';
                    }
                };
                previewContainer.appendChild(previewImage);
                previewContainer.appendChild(deleteButton);
                this.imagePreview.appendChild(previewContainer);
            };
            reader.readAsDataURL(file);
        }
    }

    handleSend() {
        const text = this.input.value.trim();
        const imagePreview = this.imagePreview.querySelector('img');
        
        if ((text || imagePreview) && this.onSend) {
            if (imagePreview) {
                const imageData = imagePreview.src.split(',')[1];
                this.onSend(text || '发送了一张图片', imageData);
                this.imagePreview.innerHTML = '';
                this.imagePreview.style.display = 'none';
            } else {
                this.onSend(text);
            }
            this.input.value = '';
            this.input.style.height = '48px';
            this.input.style.overflowY = 'hidden';
        }
    }

    setPlaceholder(placeholder) {
        this.input.placeholder = placeholder;
    }

    showSettings() {
        const dialog = this.createElement('div', 'mx-chat-settings-dialog');
        const content = this.createElement('div', 'mx-chat-settings-content');
        const title = this.createElement('div', 'mx-chat-settings-title');
        title.textContent = '设置';
        content.appendChild(title);

        const section = this.createElement('div', 'mx-chat-settings-section');
        const fields = [
            { label: 'Model Name:', id: 'modelName', value: this.config.modelName },
            { label: 'URL:', id: 'url', value: this.config.url },
            { label: 'API Key:', id: 'apiKey', value: this.config.apiKey }
        ];
        const inputs = fields.map(field => {
            const label = this.createElement('label');
            label.textContent = field.label;
            label.setAttribute('for', field.id);
            const input = this.createElement('input');
            input.type = field.id === 'apiKey' ? 'password' : 'text';
            input.id = field.id;
            input.value = field.value;
            if (field.id === 'apiKey') {
                const inputWrapper = this.createElement('div', 'mx-chat-input-wrapper');
                const toggleButton = this.createElement('button', 'mx-chat-toggle-visibility');
                toggleButton.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
                toggleButton.onclick = () => {
                    const isPassword = input.type === 'password';
                    input.type = isPassword ? 'text' : 'password';
                    toggleButton.innerHTML = isPassword ? 
                        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>' :
                        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
                };
                inputWrapper.appendChild(input);
                inputWrapper.appendChild(toggleButton);
                section.appendChild(label);
                section.appendChild(inputWrapper);
                return input;
            }
            section.appendChild(label);
            section.appendChild(input);
            return input;
        });

        const saveButton = this.createElement('button');
        saveButton.textContent = '保存';
        saveButton.onclick = () => {
            const [modelName, url, apiKey] = inputs.map(input => input.value.trim());
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                alert('无法保存：WebSocket 未连接');
                return;
            }
            if (modelName || url || apiKey) {
                const newConfig = { model_name: modelName, url, api_key: apiKey };
                this.ws.send(JSON.stringify({ type: 'update_config', config: newConfig }));
                this.config = newConfig;

                const successMessage = this.createElement('div');
                successMessage.textContent = '保存成功';
                successMessage.style.cssText = 'position: fixed; top: 50px; right: 20px; background-color: #4CAF50; color: white; padding: 10px 20px; border-radius: 4px; z-index: 1000;';
                document.body.appendChild(successMessage);

                setTimeout(() => {
                    document.body.removeChild(successMessage);
                }, 3000);
                localStorage.setItem('mxChatModelName', modelName);
                localStorage.setItem('mxChatUrl', url);
                localStorage.setItem('mxChatApiKey', apiKey);
                document.body.removeChild(dialog);
                if (this.hoverMenu) {
                    this.hoverMenu.style.opacity = '1';
                    this.hoverMenu.style.visibility = 'visible';
                }
            }
        };

        const cancelButton = this.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.onclick = () => document.body.removeChild(dialog);

        const buttonGroup = this.createElement('div', 'mx-chat-settings-buttons');
        buttonGroup.appendChild(saveButton);
        buttonGroup.appendChild(cancelButton);

        content.appendChild(section);
        content.appendChild(buttonGroup);
        dialog.appendChild(content);
        document.body.appendChild(dialog);
    }
}

// 拖拽上传处理器
class DragUploadHandler {
    constructor(dropZone, imagePreview, createElement) {
        this.dropZone = dropZone;
        this.imagePreview = imagePreview;
        this.createElement = createElement;
        this.setupDragEvents();
    }

    setupDragEvents() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => this.dropZone.classList.add('drag-active'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => this.dropZone.classList.remove('drag-active'));
        });

        this.dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64Data = e.target.result;
                    this.imagePreview.style.display = 'block';
                    const previewContainer = this.createElement('div', 'mx-chat-preview-container');
                    const previewImage = this.createElement('img', 'mx-chat-preview-image');
                    previewImage.src = base64Data;
                    Object.assign(previewImage.style, {
                        maxWidth: '200px',
                        maxHeight: '200px',
                        objectFit: 'contain'
                    });
                    const deleteButton = this.createElement('button', 'mx-chat-preview-delete');
                    deleteButton.innerHTML = '×';
                    deleteButton.onclick = () => {
                        previewContainer.remove();
                        if (this.imagePreview.children.length === 0) this.imagePreview.style.display = 'none';
                    };
                    previewContainer.appendChild(previewImage);
                    previewContainer.appendChild(deleteButton);
                    this.imagePreview.appendChild(previewContainer);
                };
                reader.readAsDataURL(files[0]);
            }
        });
    }
}

// 聊天侧边栏
class MXChatSidebar {
    constructor() {
        this.visible = false;
        this.currentMode = 'agent';
        this.lastWidth = null;
        this.setupWebSocket();
        this.renderToggleButton();
        this.renderSidebar();
        this.initDragAndResize();
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8188/ws`;
        const clientId = localStorage.getItem('mxChatClientId') || this.generateClientId();
        this.ws = new WebSocket(`${wsUrl}?clientId=${clientId}`);

        this.wsReady = false;

        this.ws.addEventListener('open', () => {
            console.log(`[INFO] ${new Date().toISOString()} - WebSocket 连接已建立，客户端 ID: ${clientId}`);
            this.wsReady = true;
            localStorage.setItem('mxChatClientId', clientId);
        });

        this.ws.addEventListener('message', (event) => {
            if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
                this.handleBinaryMessage(event.data);
            } else {
                try {
                    const data = JSON.parse(event.data);
                    console.log(`[INFO] ${new Date().toISOString()} - 收到消息:`, data);
                    switch (data.type) {
                        case 'status':
                            console.log(`[INFO] 队列状态:`, data.data.status);
                            console.log(`[INFO] 分配的客户端 ID:`, data.data.sid);
                            break;
                        case 'executing':
                            console.log(`[INFO] 当前执行节点:`, data.data.node);
                            break;
                        case 'mx-chat-message':
                            if (data.data?.text) {
                                this.addMessage(data.data.text, data.data.isUser || false, data.data.imageData || null);
                            }
                            break;
                        case 'imageData_ack':
                            if (data.success) {
                                console.log(`[INFO] 图像数据发送成功`);
                                const imageSendNode = app.graph._nodes.find(n => n.type === 'MXChatImageSendNode');
                                if (imageSendNode) {
                                    app.graph.runStep(imageSendNode);
                                    app.queuePrompt();
                                }
                            }
                            break;
                        default:
                            console.log(`[WARN] 未识别的消息类型: ${data.type}`);
                    }
                } catch (error) {
                    console.error(`[ERROR] 解析 WebSocket 消息失败:`, error);
                }
            }
        });

        this.ws.addEventListener('close', () => {
            console.log(`[WARN] ${new Date().toISOString()} - WebSocket 连接已关闭`);
            this.wsReady = false;
            setTimeout(() => this.setupWebSocket(), 2000);
        });

        this.ws.addEventListener('error', (error) => {
            console.error(`[ERROR] WebSocket 错误:`, error);
            this.wsReady = false;
        });

        this.ws.binaryType = 'arraybuffer';
    }

    generateClientId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    handleBinaryMessage(data) {
        const arrayBuffer = data instanceof Blob ? data.arrayBuffer() : Promise.resolve(data);
        arrayBuffer.then((buffer) => {
            const view = new DataView(buffer);
            const eventType = view.getUint32(0, false);
            const binaryData = buffer.slice(4);

            console.log(`[INFO] 收到二进制消息，事件类型: ${eventType}`);
            if (eventType === 1 || eventType === 2) {
                const blob = new Blob([binaryData], { type: eventType === 1 ? 'image/jpeg' : 'image/png' });
                const reader = new FileReader();
                reader.onload = () => {
                    const base64Data = reader.result.split(',')[1];
                    this.addMessage('收到一张图片', false, base64Data);
                };
                reader.readAsDataURL(blob);
            }
        }).catch((error) => {
            console.error(`[ERROR] 处理二进制数据失败:`, error);
        });
    }

    sendMessage(text, imageData = null) {
        if (!text && !imageData) return;
        this.addMessage(text || '发送了一张图片', true, imageData);

        const sendData = () => {
            if (this.wsReady && this.ws.readyState === WebSocket.OPEN) {
                if (this.currentMode === 'agent' && app?.graph) {
                    const sendNode = app.graph._nodes.find(n => n.type === 'MXChatSend');
                    if (sendNode && text) {
                        const widget = sendNode.widgets.find(w => w.name === 'text');
                        if (widget) {
                            widget.value = text;
                            app.graph.runStep(sendNode);
                            app.queuePrompt().then(() => {
                                const receiveNode = app.graph._nodes.find(n => n.type === 'MXChatReceive');
                                if (receiveNode) {
                                    const widget = receiveNode.widgets.find(w => w.name === 'text');
                                    if (widget?.value) this.addMessage(widget.value, false);
                                }
                            });
                        }
                    }

                    if (imageData) {
                        const base64Data = imageData.startsWith('data:image/png;base64,') ? imageData.split(',')[1] : imageData;
                        const message = {
                            type: 'imageData',
                            text: text || '用户上传了一张图片',
                            mode: 'agent',
                            imageData: base64Data
                        };
                        const messageString = JSON.stringify(message);
                        console.log(`[INFO] ${new Date().toISOString()} - Sending imageData:`, messageString);
                        this.ws.send(messageString);

                        const logMessage = {
                            type: 'log',
                            level: 'INFO',
                            message: `发送成功: ${messageString.substring(0, 100)}...`
                        };
                        this.ws.send(JSON.stringify(logMessage));
                    }
                } else if (this.currentMode === 'chat') {
                    fetch('http://localhost:8001/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: text || '用户上传了一张图片', mode: 'chat', imageData })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.text) this.addMessage(data.text, false, data.imageData || null);
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        this.addMessage('抱歉，发生了一些错误，请稍后再试。', false);
                    });
                }
            } else {
                console.log(`[WARN] ${new Date().toISOString()} - WebSocket 未连接或未就绪 (state: ${this.ws.readyState})`);
                this.addMessage('WebSocket 未连接或未就绪，无法发送消息', false);
            }
        };

        if (this.wsReady) {
            sendData();
        } else {
            console.log(`[INFO] ${new Date().toISOString()} - 等待 WebSocket 连接...`);
            this.ws.addEventListener('open', () => {
                console.log(`[INFO] ${new Date().toISOString()} - WebSocket 已连接，开始发送`);
                sendData();
            }, { once: true });
        }
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
                <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.65.07-.97 0-.32-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.39 0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
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
            (text, imageData) => this.sendMessage(text, imageData),
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
                if (width > 200 && width < 600) this.sidebar.style.width = `${width}px`;
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
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'mode_change', mode }));
        }
    }

    receiveWorkflowMessage(message) {
        if (this.currentMode === 'agent') this.addMessage(message, false);
    }

    addMessage(message, isUser = false, imageData = null) {
        const messageComponent = new MessageComponent(message, isUser, imageData);
        messageComponent.appendTo(this.messagesContainer);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    showSettings() {
        this.inputComponent.showSettings();
    }
}

// CSS 样式
const styles = `
    /* 设置面板 */
    .mx-chat-settings-dialog {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1002;
    }
    .mx-chat-settings-content {
        width: 400px;
        height: 300px;
        background: var(--comfy-menu-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 20px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
    }
    .mx-chat-settings-title {
        margin: 0 0 15px 0;
        color: var(--input-text);
        font-size: 18px;
        font-weight: 500;
    }
    .mx-chat-settings-section {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .mx-chat-settings-section label {
        display: block;
        margin-bottom: 4px;
        color: var(--input-text);
        font-size: 14px;
    }
    .mx-chat-settings-section input {
        width: 100%;
        padding: 8px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--comfy-input-bg);
        color: var(--input-text);
        font-size: 14px;
        box-sizing: border-box;
    }
    .mx-chat-input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
    }
    .mx-chat-toggle-visibility {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: var(--input-text);
        opacity: 0.7;
        transition: opacity 0.2s;
    }
    .mx-chat-toggle-visibility:hover {
        opacity: 1;
    }
    .mx-chat-settings-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
    }
    .mx-chat-settings-buttons button {
        padding: 6px 12px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        background-color: rgba(255, 255, 255, 0.1);
        color: #fff;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 14px;
        font-weight: 500;
    }
    .mx-chat-settings-buttons button:hover {
        background-color: rgba(255, 255, 255, 0.2);
    }

    /* 悬浮按钮 */
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

    /* 侧边栏 */
    .mx-chat-sidebar {
        position: fixed;
        right: -300px;
        top: 0;
        width: 300px;
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
    }
    .mx-chat-resize-handle:hover {
        background: var(--border-color);
        opacity: 0.8;
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
    .mx-chat-input-container {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 10px;
        border-top: 1px solid var(--border-color);
        background: var(--comfy-menu-bg);
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .mx-chat-input {
        margin: 0;
        background: var(--comfy-menu-bg);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 4px;
        color: var(--input-text);
        font-size: 16px;
        min-height: 64px;
        max-height: 192px;
        overflow-y: auto;
    }
    .mx-chat-input.drag-active {
        border: 2px dashed #4a9eff;
        background-color: rgba(0, 0, 0, 0.1);
        box-shadow: 0 0 10px rgba(74, 158, 255, 0.3);
        transition: all 0.3s ease;
    }
    .mx-chat-controls {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
    }
    .mx-chat-mic-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: 50%;
        transition: background-color 0.3s ease;
    }
    .mx-chat-mic-btn:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }
    .mx-chat-mic-btn svg {
        width: 20px;
        height: 20px;
        fill: var(--input-text);
    }
    .mx-chat-mic-btn.recording {
        background-color: rgba(255, 0, 0, 0.2);
        animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); }
        100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
    }
    .mx-chat-image-btn {
        background: transparent;
        border: none;
        padding: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background-color 0.2s;
    }
    .mx-chat-image-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    .mx-chat-image-btn svg {
        width: 20px;
        height: 20px;
        fill: var(--input-text);
    }
    .mx-chat-send {
        flex: 1;
        background: var(--comfy-input-bg);
        border: 1px solid var(--border-color);
        color: var(--input-text);
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 14px;
        font-weight: 500;
        min-height: 36px;
    }
    .mx-chat-send:hover {
        background: var(--comfy-input-bg-hover);
        transform: translateY(-1px);
    }
    .mx-chat-image-preview {
        display: none;
        margin: 8px 0;
        padding: 8px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.1);
    }
    .mx-chat-preview-container {
        position: relative;
        display: inline-block;
        margin: 4px;
    }
    .mx-chat-preview-image {
        border-radius: 4px;
        display: block;
    }
    .mx-chat-preview-delete {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255, 0, 0, 0.8);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
    }
    .mx-chat-preview-delete:hover {
        background: rgba(255, 0, 0, 1);
    }

    /* 消息样式 */
    .mx-chat-message {
        margin-bottom: 12px;
        padding: 0;
        color: var(--input-text);
        max-width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 13px;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }
    .mx-chat-message-header {
        display: flex;
        align-items: center;
        gap: 2px;
    }
    .mx-chat-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--comfy-input-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        color: var(--input-text);
        border: 2px solid var(--border-color);
    }
    .mx-chat-sender {
        font-size: 13px;
        opacity: 0.9;
        font-weight: 500;
        margin-left: 8px;
    }
    .mx-chat-message.user {
        margin-left: auto;
        align-items: flex-end;
    }
    .mx-chat-message.user .mx-chat-message-header {
        flex-direction: row-reverse;
        justify-content: flex-start;
    }
    .mx-chat-message.user .mx-chat-message-content {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
    }
    .mx-chat-message.user .mx-chat-text {
        background: #4a90e2;
        border-radius: 4px;
        padding: 8px 10px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--border-color);
        color: #ffffff;
        width: fit-content;
        max-width: 100%;
        line-height: 1.4;
        white-space: pre-wrap;
    }
    .mx-chat-message.assistant .mx-chat-text {
        padding: 8px 10px;
        width: fit-content;
        max-width: 100%;
        background: var(--comfy-input-bg-hover);
        border-radius: 4px;
        border: 1px solid var(--border-color);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        line-height: 1.4;
        white-space: pre-wrap;
    }
    .mx-chat-message .mx-chat-image img {
        max-width: 300px;
        height: auto;
        border-radius: 8px;
        cursor: pointer;
        transition: transform 0.2s ease;
        margin-top: 8px;
    }
    .mx-chat-image-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 1003;
    }
    .mx-chat-image-modal.visible {
        display: flex;
    }
    .mx-chat-image-modal img {
        max-width: 90%;
        max-height: 90vh;
        object-fit: contain;
    }

    /* 模式选择 */
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

const styleElement = document.createElement('style');
styleElement.textContent = styles;
document.head.appendChild(styleElement);

// ComfyUI 扩展注册
app.registerExtension({
    name: 'mx.chat',
    async setup() {
        if (!app) {
            console.error('app 未定义，无法注册 MXChat 扩展');
            return;
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initMXChat);
        } else {
            initMXChat();
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                window.mxChatInstance?.toggleVisibility();
            }
        });

        app.addEventListener('nodeExecuted', (node) => {
            if (node.type === 'MXChatReceive' && window.mxChatInstance) {
                const widget = node.widgets.find(w => w.name === 'text');
                if (widget?.value) window.mxChatInstance.receiveWorkflowMessage(widget.value);
            }
        });
    }
});

// 初始化函数
function initMXChat() {
    window.mxChatInstance = new MXChatSidebar();
}