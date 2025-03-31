import { MXChatComponent } from './baseComponent.js';
import { DragUploadHandler } from './dragUploadHandler.js';

export function adjustTextareaHeight(textarea) {
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

export class InputComponent extends MXChatComponent {
    constructor(placeholder = '', onSend = null, ws, hoverMenu = null) {
        super();
        this.placeholder = placeholder;
        this.onSend = onSend;
        this.ws = ws;
        this.hoverMenu = hoverMenu;
        this.isConfigLoaded = false;
        this.config = {
            datasets: JSON.parse(localStorage.getItem('mxChatDatasets')) || [],
            selectedModel: localStorage.getItem('mxChatSelectedModel') || ''
        };
        
        if (this.ws) {
            this.ws.addEventListener('message', this.handleWebSocketMessage.bind(this));
            this.ws.addEventListener('open', () => {
                this.ws.send(JSON.stringify({ type: 'get_initial_config' }));
            });
        }

        this.render();
        this.dragUploadHandler = new DragUploadHandler(this.input, this.imagePreview, this.createElement.bind(this));
    }

    handleWebSocketMessage(event) {
        try {
            let message;
            if (typeof event.data === 'string') {
                message = JSON.parse(event.data);
            } else if (event.data && typeof event.data === 'object') {
                message = event.data;
            } else {
                throw new Error('无法解析WebSocket消息');
            }
            
            console.log('收到WebSocket消息:', message);
            
            if (message.event === 'config_updated' || (message.data && message.data.event === 'config_updated')) {
                let data;
                if (message.data && message.data.data) {
                    data = message.data.data;
                } else if (message.data) {
                    data = message.data;
                } else {
                    data = message;
                }
                
                const success = data.success === undefined ? true : data.success;
                console.log('处理配置更新响应:', data);
                
                if (success) {
                    if (data.config) {
                        this.config.datasets = data.config.datasets || this.config.datasets;
                        this.config.selectedModel = data.config.selected_model || this.config.selectedModel;
                        localStorage.setItem('mxChatDatasets', JSON.stringify(this.config.datasets));
                        localStorage.setItem('mxChatSelectedModel', this.config.selectedModel);
                        console.log('已更新配置:', this.config);
                        this.isConfigLoaded = true;
                    } else if (data.selected_model) {
                        this.config.selectedModel = data.selected_model;
                        localStorage.setItem('mxChatSelectedModel', this.config.selectedModel);
                        console.log('已更新选中模型:', this.config.selectedModel);
                        this.isConfigLoaded = true;
                    }
                    
                    if (this.lastAction === 'add') {
                        console.log('显示添加成功通知');
                        this.showNotification('添加成功', true);
                        if (this.saveCallback) this.saveCallback();
                    } else if (this.lastAction === 'apply') {
                        console.log('显示应用成功通知');
                        this.showNotification('应用成功', true);
                        if (this.applyCallback) this.applyCallback();
                    } else if (data.selected_model) {
                        console.log('显示应用成功通知(来自selected_model响应)');
                        this.showNotification('应用成功', true);
                    } else {
                        console.log('接收到初始配置');
                    }
                    this.lastAction = null;
                    
                    if (document.querySelector('.mx-chat-settings-dialog')) {
                        const existingDialog = document.querySelector('.mx-chat-settings-dialog');
                        if (existingDialog) {
                            document.body.removeChild(existingDialog);
                            setTimeout(() => this.showSettings(), 100);
                        }
                    }
                } else {
                    this.showNotification(`配置更新失败: ${data.error || '未知错误'}`, false);
                }
            }
        } catch (error) {
            console.error('处理 WebSocket 消息失败:', error, '原始数据:', event.data);
            this.showNotification('处理消息失败: ' + error.message, false);
        }
    }

    showNotification(message, success) {
        console.log(`显示通知: ${message}, 成功: ${success}`);
        const notification = this.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed; 
            top: 50px; 
            right: 20px; 
            background-color: ${success ? '#4CAF50' : '#F44336'}; 
            color: white; 
            padding: 12px 24px; 
            border-radius: 4px; 
            z-index: 1000; 
            font-size: 16px; 
            font-weight: bold; 
            box-shadow: 0 4px 8px rgba(0,0,0,0.2); 
            opacity: 0; 
            transform: translateY(-20px); 
            transition: opacity 0.3s, transform 0.3s;
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 5000);
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
        fileInput.accept = 'image/*,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,audio/*,video/*';
        fileInput.multiple = true; // 添加 multiple 属性，允许选择多个文件
        fileInput.style.display = 'none';
        imageButton.addEventListener('click', () => fileInput.click());
        // 在文件输入元素的事件绑定处修改：
        fileInput.onchange = (e) => {
            this.dragUploadHandler.handleFileInput(e);  // 传递完整事件对象
        };
    
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
            const response = await fetch('http://localhost:8165/whisper', {
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

    handleSend() {
        const text = this.input.value.trim();
        const previewContainers = this.imagePreview.querySelectorAll('.mx-chat-preview-container');
    
        if ((text || previewContainers.length > 0) && this.onSend) {
            let imageData = [];
            let tableData = [];
            let audioData = [];
            let videoData = [];
    
            if (previewContainers.length > 0) {
                for (const previewContainer of previewContainers) {
                    let fileType = previewContainer.dataset.fileType;
                    const fileName = previewContainer.dataset.fileName;
                    const base64Data = previewContainer.dataset.base64Data;
                    const locationName = previewContainer.dataset.locationName || '默认位置';
    
                    // 如果 fileType 不可靠，从文件名推断
                    if (!fileType || (!fileType.startsWith('image/') && !fileType.startsWith('video/') && 
                                      !fileType.startsWith('audio/') && fileType !== 'text/csv' &&
                                      fileType !== 'application/vnd.ms-excel' && 
                                      fileType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
                        const extension = fileName.split('.').pop().toLowerCase();
                        const mimeTypes = {
                            'jpg': 'image/jpeg',
                            'jpeg': 'image/jpeg',
                            'png': 'image/png',
                            'gif': 'image/gif',
                            'mp4': 'video/mp4',
                            'webm': 'video/webm',
                            'mov': 'video/quicktime',
                            'avi': 'video/x-msvideo',
                            'mkv': 'video/x-matroska',
                            'mp3': 'audio/mpeg',
                            'wav': 'audio/wav',
                            'csv': 'text/csv',
                            'xls': 'application/vnd.ms-excel',
                            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        };
                        fileType = mimeTypes[extension] || 'application/octet-stream';
                    }
    
                    const isImage = fileType.startsWith('image/');
                    const isTable = fileType === 'text/csv' ||
                                    fileType === 'application/vnd.ms-excel' ||
                                    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    const isAudio = fileType.startsWith('audio/');
                    const isVideo = fileType.startsWith('video/');
    
                    if (isImage) {
                        imageData.push({ base64Data, fileType, fileName, locationName });
                    } else if (isTable) {
                        tableData.push({ tableData: base64Data, fileType, fileName });
                    } else if (isAudio) {
                        audioData.push({ audioData: base64Data, fileType, fileName, locationName });
                    } else if (isVideo) {
                        videoData.push({ videoData: base64Data, fileType, fileName, locationName });
                    }
                }
    
                if (imageData.length > 0) this.onSend(text || null, imageData);
                if (tableData.length > 0) this.onSend(text || null, null, tableData);
                if (audioData.length > 0) this.onSend(text || null, null, null, audioData);
                if (videoData.length > 0) this.onSend(text || null, null, null, null, videoData);
    
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
        const existingDialog = document.querySelector('.mx-chat-settings-dialog');
        if (existingDialog) {
            document.body.removeChild(existingDialog);
        }
        
        if (!this.isConfigLoaded) {
            this.showNotification('正在加载配置，请稍候...', true);
            if (this.config && this.config.datasets && this.config.datasets.length > 0) {
                this.isConfigLoaded = true;
                this._renderSettings();
                return;
            }
            
            let attempts = 0;
            const maxAttempts = 10;
            const checkInterval = setInterval(() => {
                attempts++;
                if (this.isConfigLoaded || (this.config && this.config.datasets && this.config.datasets.length > 0)) {
                    this.isConfigLoaded = true;
                    clearInterval(checkInterval);
                    this._renderSettings();
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    this.showNotification('配置加载超时，请刷新页面重试', false);
                }
            }, 500);
            return;
        }
        
        this._renderSettings();
    }
    
    _renderSettings() {
        console.log('渲染设置面板，当前配置:', this.config);
        const dialog = this.createElement('div', 'mx-chat-settings-dialog');
        const content = this.createElement('div', 'mx-chat-settings-content');
        const title = this.createElement('div', 'mx-chat-settings-title');
        title.textContent = '设置';
        content.appendChild(title);
    
        const selectSection = this.createElement('div', 'mx-chat-settings-section');
        const selectLabel = this.createElement('label');
        selectLabel.textContent = '选择模型:';
        const select = this.createElement('select', 'mx-chat-model-select');
        const defaultOption = this.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- 请选择 --';
        select.appendChild(defaultOption);
        
        if (Array.isArray(this.config.datasets)) {
            this.config.datasets.forEach(dataset => {
                const option = this.createElement('option');
                option.value = dataset.model;
                option.textContent = dataset.model;
                if (dataset.model === this.config.selectedModel) option.selected = true;
                select.appendChild(option);
            });
        } else {
            console.warn('配置中的datasets不是数组:', this.config.datasets);
        }
        
        selectSection.appendChild(selectLabel);
        selectSection.appendChild(select);
        content.appendChild(selectSection);
    
        const inputSection = this.createElement('div', 'mx-chat-settings-section');
        const fields = [
            { label: 'Model Name:', id: 'modelName', value: '' },
            { label: 'URL:', id: 'url', value: '' },
            { label: 'API Key:', id: 'apiKey', value: '' }
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
                        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.20-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>' :
                        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
                };
                inputWrapper.appendChild(input);
                inputWrapper.appendChild(toggleButton);
                inputSection.appendChild(label);
                inputSection.appendChild(inputWrapper);
                return input;
            }
            inputSection.appendChild(label);
            inputSection.appendChild(input);
            return input;
        });
    
        select.onchange = () => {
            const selectedModel = select.value;
            const dataset = this.config.datasets.find(d => d.model === selectedModel);
            if (dataset) {
                inputs[0].value = dataset.model;
                inputs[1].value = dataset.url || '';
                inputs[2].value = dataset.api_key || '';
            } else {
                inputs[0].value = '';
                inputs[1].value = '';
                inputs[2].value = '';
            }
        };
        
        if (this.config.selectedModel) {
            const dataset = this.config.datasets.find(d => d.model === this.config.selectedModel);
            if (dataset) {
                inputs[0].value = dataset.model;
                inputs[1].value = dataset.url || '';
                inputs[2].value = dataset.api_key || '';
                Array.from(select.options).forEach(option => {
                    if (option.value === this.config.selectedModel) {
                        option.selected = true;
                    }
                });
            }
        }

        const buttonGroup = this.createElement('div', 'mx-chat-settings-buttons');
        const addButton = this.createElement('button', 'mx-chat-button mx-chat-add');
        addButton.textContent = '添加';
        addButton.onclick = () => {
            const [modelName, url, apiKey] = inputs.map(input => input.value.trim());
            if (!modelName || !url || !apiKey) {
                alert('请填写所有字段');
                return;
            }
            const newDataset = { model: modelName, url, api_key: apiKey };
            this.config.datasets = this.config.datasets.filter(d => d.model !== modelName);
            this.config.datasets.push(newDataset);
            this.lastAction = 'add';
            this.saveConfigToBackend(() => {
                document.body.removeChild(dialog);
                if (this.hoverMenu) {
                    this.hoverMenu.style.opacity = '1';
                    this.hoverMenu.style.visibility = 'visible';
                }
                setTimeout(() => this.showSettings(), 500);
            });
        };

        const applyButton = this.createElement('button', 'mx-chat-button mx-chat-apply');
        applyButton.textContent = '应用';
        applyButton.onclick = () => {
            const selectedModel = select.value;
            if (!selectedModel) {
                alert('请选择一个模型');
                return;
            }
            this.config.selectedModel = selectedModel;
            this.applyConfig({ selected_model: selectedModel }, dialog);
        };

        const cancelButton = this.createElement('button', 'mx-chat-button mx-chat-cancel');
        cancelButton.textContent = '取消';
        cancelButton.onclick = () => {
            document.body.removeChild(dialog);
            if (this.hoverMenu) {
                this.hoverMenu.style.opacity = '1';
                this.hoverMenu.style.visibility = 'visible';
            }
        };

        buttonGroup.appendChild(addButton);
        buttonGroup.appendChild(applyButton);
        buttonGroup.appendChild(cancelButton);
        
        content.appendChild(inputSection);
        content.appendChild(buttonGroup);

        dialog.appendChild(content);
        document.body.appendChild(dialog);
    }

    async saveConfigToBackend(callback) {
        try {
            const response = await fetch('http://localhost:8166/update_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    datasets: this.config.datasets,
                    selected_model: this.config.selectedModel
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            if (result.status === 'success') {
                this.lastAction = 'add';
                if (callback) callback();
            } else {
                throw new Error(result.message || '保存失败');
            }
        } catch (error) {
            console.error('保存配置失败:', error);
            this.showNotification(`保存失败: ${error.message}`, false);
        }
    }

    async applyConfig(config, dialog) {
        try {
            const response = await fetch('http://localhost:8166/update_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    datasets: this.config.datasets,
                    selected_model: config.selected_model
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            if (result.status === 'success') {
                this.lastAction = 'apply';
                if (dialog) {
                    document.body.removeChild(dialog);
                    if (this.hoverMenu) {
                        this.hoverMenu.style.opacity = '1';
                        this.hoverMenu.style.visibility = 'visible';
                    }
                }
            } else {
                throw new Error(result.message || '应用失败');
            }
        } catch (error) {
            console.error('应用配置失败:', error);
            this.showNotification(`应用失败: ${error.message}`, false);
        }
    }
}

// 内联样式
const styleElement = document.createElement('style');
styleElement.textContent = `
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
    .mx-chat-settings-section input,
    .mx-chat-settings-section select {
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
        justify-content: space-between;
        gap: 10px;
        margin-top: 20px;
    }
    .mx-chat-button {
        flex: 1;
        padding: 8px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
    }
    .mx-chat-add {
        background-color: #4CAF50;
        color: white;
    }
    .mx-chat-add:hover {
        background-color: #45a049;
    }
    .mx-chat-apply {
        background-color: #2196F3;
        color: white;
    }
    .mx-chat-apply:hover {
        background-color: #1e88e5;
    }
    .mx-chat-cancel {
        background-color: #f44336;
        color: white;
    }
    .mx-chat-cancel:hover {
        background-color: #da190b;
    }
`;
document.head.appendChild(styleElement);