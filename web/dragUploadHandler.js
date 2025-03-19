export class DragUploadHandler {
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
            if (files.length > 0) {
                const file = files[0];
                const fileType = file.type;
                const isImage = fileType.startsWith('image/');
                const isTable = fileType === 'text/csv' || 
                                fileType === 'application/vnd.ms-excel' || 
                                fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

                if (isImage || isTable) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const base64Data = e.target.result.split(',')[1]; // 移除 data URL 前缀
                        this.imagePreview.style.display = 'block';
                        const previewContainer = this.createElement('div', 'mx-chat-preview-container');
                        
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
                            // 这里可以添加简单的表格预览逻辑（可选），但通常交给发送后处理
                        }

                        const deleteButton = this.createElement('button', 'mx-chat-preview-delete');
                        deleteButton.innerHTML = '×';
                        deleteButton.onclick = () => {
                            previewContainer.remove();
                            if (this.imagePreview.children.length === 0) this.imagePreview.style.display = 'none';
                        };
                        previewContainer.dataset.fileType = fileType; // 存储文件类型
                        previewContainer.dataset.fileName = file.name; // 存储文件名
                        previewContainer.dataset.base64Data = base64Data; // 存储 Base64 数据
                        previewContainer.appendChild(deleteButton);
                        this.imagePreview.appendChild(previewContainer);
                    };
                    reader.readAsDataURL(file);
                }
            }
        });
    }
}

// 内联样式（添加文件名样式）
const styleElement = document.createElement('style');
styleElement.textContent = `
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
        height: 100px;
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
`;
document.head.appendChild(styleElement);