export class DragUploadHandler {
    constructor(dropZone, imagePreview, createElement, config = {}) {
        this.dropZone = dropZone;
        this.imagePreview = imagePreview;
        this.createElement = createElement;
        this.config = config;
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

        this.dropZone.addEventListener('drop', (e) => this.handleFileDrop(e));
    }

    handleFileDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // 处理所有拖拽上传的文件
            Array.from(files).forEach(file => this.processFile(file));
        }
    }

    handleFileInput(e) {  // 修改参数为事件对象
        const input = e.target;
        const files = input.files;
        if (files?.length) {
            // 处理文件并清空输入框值（允许重复选择相同文件）
            Array.from(files).forEach(file => this.processFile(file));
            input.value = null;  // 新增关键代码
        }
    }

    // 根据文件类型获取对应的 location_name
    getLocationNames(fileType) {
        if (!app || !app.graph || !app.graph._nodes) {
            console.warn('无法访问工作流节点，app.graph 未定义');
            return [];
        }

        let nodeTypeFilter;
        const isImage = fileType.startsWith('image/');
        const isAudio = fileType.startsWith('audio/');
        const isVideo = fileType.startsWith('video/');
        const isTable = fileType === 'text/csv' ||
                        fileType === 'application/vnd.ms-excel' ||
                        fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        if (isImage) {
            nodeTypeFilter = 'MXChatImageSend';
        } else if (isAudio) {
            nodeTypeFilter = 'MXChatAudioSend';
        } else if (isVideo) {
            nodeTypeFilter = 'MXChatVideoSend';
        } else if (isTable) {
            return [];
        } else {
            return [];
        }

        const sendNodes = app.graph._nodes.filter(node => node.type === nodeTypeFilter);
        const locationNames = sendNodes
            .map(node => {
                const widget = node.widgets?.find(w => w.name === 'location_name');
                return widget?.value || '未知位置';
            })
            .filter(name => name !== null && name !== undefined);

        return [...new Set(locationNames)]; // 去重
    }

    // 更新下拉框选项
    updateSelectBox(selectBox, previewContainer, locationNames) {
        selectBox.innerHTML = ''; // 清空现有选项

        const defaultOption = this.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '请选择目标节点';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        selectBox.appendChild(defaultOption);

        if (locationNames.length === 0) {
            const option = this.createElement('option');
            option.value = '';
            option.textContent = '未找到匹配的发送节点';
            selectBox.appendChild(option);
            selectBox.disabled = true;
            previewContainer.dataset.locationName = '';
        } else {
            locationNames.forEach(name => {
                const option = this.createElement('option');
                option.value = name;
                option.textContent = name;
                selectBox.appendChild(option);
            });
            selectBox.disabled = false;
            previewContainer.dataset.locationName = ''; // 默认不选择任何节点
        }
    }

    processFile(file) {
        const fileType = file.type;
        const isImage = fileType.startsWith('image/');
        const isTable = fileType === 'text/csv' ||
                        fileType === 'application/vnd.ms-excel' ||
                        fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const isAudio = fileType.startsWith('audio/');
        const isVideo = fileType.startsWith('video/');

        if (isImage || isTable || isAudio || isVideo) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64Data = e.target.result.split(',')[1];
                this.imagePreview.style.display = 'block';
                const previewContainer = this.createElement('div', 'mx-chat-preview-container');

                // 根据文件类型获取 location_names
                let locationNames = this.getLocationNames(fileType);
                const selectBox = this.createElement('select', 'mx-chat-preview-select');
                this.updateSelectBox(selectBox, previewContainer, locationNames);

                selectBox.addEventListener('change', () => {
                    previewContainer.dataset.locationName = selectBox.value;
                });
                previewContainer.appendChild(selectBox);

                // 监听节点变化，根据文件类型动态更新
                if (typeof app !== 'undefined' && app.eventBus) {
                    app.eventBus.addEventListener('nodeAdded', (event) => {
                        const node = event.detail || event;
                        const nodeMatchesType = 
                            (isImage && node.type === 'MXChatImageSend') ||
                            (isAudio && node.type === 'MXChatAudioSend') ||
                            (isVideo && node.type === 'MXChatVideoSend');
                        if (nodeMatchesType) {
                            const widget = node.widgets?.find(w => w.name === 'location_name');
                            const newLocationName = widget?.value || '未知位置';
                            locationNames = this.getLocationNames(fileType);
                            if (!locationNames.includes(newLocationName)) {
                                locationNames.push(newLocationName);
                            }
                            this.updateSelectBox(selectBox, previewContainer, locationNames);
                        }
                    });

                    app.eventBus.addEventListener('nodeRemoved', (event) => {
                        const node = event.detail || event;
                        const nodeMatchesType = 
                            (isImage && node.type === 'MXChatImageSend') ||
                            (isAudio && node.type === 'MXChatAudioSend') ||
                            (isVideo && node.type === 'MXChatVideoSend');
                        if (nodeMatchesType) {
                            locationNames = this.getLocationNames(fileType);
                            this.updateSelectBox(selectBox, previewContainer, locationNames);
                        }
                    });

                    app.eventBus.addEventListener('nodePropertyChanged', (event) => {
                        const { node, property, widget } = event.detail || event;
                        const nodeMatchesType = 
                            (isImage && node.type === 'MXChatImageSend') ||
                            (isAudio && node.type === 'MXChatAudioSend') ||
                            (isVideo && node.type === 'MXChatVideoSend');
                        if (nodeMatchesType) {
                            if ((property === '') || 
                                (property === 'widgets' && widget && widget.name === 'location_name')) {
                                locationNames = this.getLocationNames(fileType);
                                this.updateSelectBox(selectBox, previewContainer, locationNames);
                            }
                        }
                    });
                }

                // 文件预览
                if (isImage) {
                    const previewImage = this.createElement('img', 'mx-chat-preview-image');
                    previewImage.src = `data:${fileType};base64,${base64Data}`;
                    Object.assign(previewImage.style, {
                        maxWidth: '92px',
                        maxHeight: '92px',
                        objectFit: 'cover',
                        cursor: 'pointer'
                    });
                    previewImage.addEventListener('click', () => {
                        const modal = this.createElement('div', 'mx-chat-image-modal');
                        const modalContent = this.createElement('div', 'mx-chat-image-modal-content');
                        const modalImg = this.createElement('img');
                        modalImg.src = `data:${fileType};base64,${base64Data}`;
                        modalContent.appendChild(modalImg);
                        modal.appendChild(modalContent);
                        document.body.appendChild(modal);

                        setTimeout(() => modal.classList.add('visible'), 0);
                        modal.addEventListener('click', () => {
                            modal.classList.remove('visible');
                            setTimeout(() => modal.remove(), 300);
                        });
                    });
                    previewContainer.appendChild(previewImage);
                } else if (isTable) {
                    const fileNameSpan = this.createElement('span', 'mx-chat-preview-filename');
                    fileNameSpan.textContent = `文件: ${file.name}`;
                    previewContainer.appendChild(fileNameSpan);
                } else if (isAudio) {
                    const audioPreview = this.createElement('audio', 'mx-chat-preview-audio');
                    audioPreview.controls = true;
                    audioPreview.src = `data:${fileType};base64,${base64Data}`;
                    audioPreview.style.width = '92px';
                    previewContainer.appendChild(audioPreview);
                } else if (isVideo) {
                    const videoPreview = this.createElement('video', 'mx-chat-preview-video');
                    videoPreview.controls = true;
                    videoPreview.src = `data:${fileType};base64,${base64Data}`;
                    Object.assign(videoPreview.style, {
                        maxWidth: '92px',
                        maxHeight: '92px',
                        objectFit: 'cover'
                    });
                    previewContainer.appendChild(videoPreview);
                }

                // 删除按钮
                const deleteButton = this.createElement('button', 'mx-chat-preview-delete');
                deleteButton.innerHTML = '×';
                deleteButton.onclick = () => {
                    previewContainer.remove();
                    if (this.imagePreview.children.length === 0) {
                        this.imagePreview.style.display = 'none';
                    }
                };
                previewContainer.dataset.fileType = fileType;
                previewContainer.dataset.fileName = file.name;
                previewContainer.dataset.base64Data = base64Data;
                previewContainer.appendChild(deleteButton);
                this.imagePreview.appendChild(previewContainer);
            };
            reader.readAsDataURL(file);
        }
    }
}

// 内联样式
const styleElement = document.createElement('style');
styleElement.textContent = `
    .mx-chat-preview-audio {
        width: 92px;
        height: 30px;
        margin-top: 4px;
    }
    .mx-chat-preview-video {
        width: 92px;
        height: 92px;
        object-fit: cover;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.03);
        margin-top: 4px;
    }
    .mx-chat-input.drag-active {
        border: 2px dashed #4a9eff;
        background-color: rgba(0, 0, 0, 0.1);
        box-shadow: 0 0 10px rgba(74, 158, 255, 0.3);
        transition: all 0.3s ease;
    }
    .mx-chat-preview-container {
        position: relative;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        margin: 4px;
        padding: 4px;
        background: var(--comfy-input-bg);
        border-radius: 8px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
        transition: all 0.3s ease;
        width: 100px;
        height: 120px;
    }
    .mx-chat-preview-container:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .mx-chat-preview-image {
        width: 92px;
        height: 92px;
        object-fit: cover;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.03);
    }
    .mx-chat-preview-filename {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        color: var(--input-text);
        font-size: 12px;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.6);
        border-radius: 0 0 8px 8px;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .mx-chat-preview-delete {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(255, 0, 0, 0.8);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.2s ease;
    }
    .mx-chat-preview-container:hover .mx-chat-preview-delete {
        opacity: 1;
        transform: scale(1);
    }
    .mx-chat-preview-delete:hover {
        background: rgba(255, 0, 0, 1);
        transform: scale(1.1);
    }
    .mx-chat-preview-select {
        width: 90%;
        margin-bottom: 4px;
        padding: 2px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: var(--comfy-input-bg);
        color: var(--input-text);
        font-size: 12px;
        cursor: pointer;
    }
    .mx-chat-preview-select:focus {
        outline: none;
        border-color: #4a9eff;
    }
    .mx-chat-image-preview {
        display: none;
        margin: 8px 0;
        padding: 8px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.1);
    }
`;
document.head.appendChild(styleElement);