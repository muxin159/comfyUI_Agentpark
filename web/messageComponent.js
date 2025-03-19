import { MXChatComponent } from './baseComponent.js';

export class MessageComponent extends MXChatComponent {
    constructor(message, isUser = false, imageData = null) {
        super();
        this.message = typeof message === 'string' ? { text: message } : message;
        this.isUser = isUser;
        this.imageData = imageData;
        this.isReasoningVisible = true;
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

        this.content = this.createElement('div', 'mx-chat-message-content');

        if (this.message.reasoning_content) {
            this.reasoningContainer = this.createElement('div', 'mx-chat-reasoning-container');
            const toggleButton = this.createElement('button', 'mx-chat-reasoning-toggle');
            toggleButton.textContent = this.isReasoningVisible ? '▼ 隐藏推理' : '▶ 展开推理';
            toggleButton.onclick = () => this.toggleReasoning();

            this.reasoningText = this.createElement('div', 'mx-chat-reasoning-text');
            this.reasoningText.textContent = this.message.reasoning_content;
            this.reasoningText.style.display = this.isReasoningVisible ? 'block' : 'none';

            this.reasoningContainer.appendChild(toggleButton);
            this.reasoningContainer.appendChild(this.reasoningText);
            this.content.appendChild(this.reasoningContainer);
        }

        this.textElement = this.createElement('div', 'mx-chat-text');
        const messageText = this.message.text || '';
        const format = this.message.format || null;

        if (format === 'markdown') {
            if (!window.marked) {
                const markedScript = document.createElement('script');
                markedScript.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
                markedScript.onload = () => {
                    this.textElement.innerHTML = window.marked.parse(messageText);
                    if (window.Prism) Prism.highlightAll();
                };
                document.head.appendChild(markedScript);
            } else {
                this.textElement.innerHTML = window.marked.parse(messageText);
                if (window.Prism) Prism.highlightAll();
            }
            
            if (!window.Prism) {
                const prismScript = document.createElement('script');
                prismScript.src = 'https://cdn.jsdelivr.net/npm/prismjs/prism.min.js';
                document.head.appendChild(prismScript);
                
                if (!document.querySelector('link[href*="prism.css"]')) {
                    const prismCss = document.createElement('link');
                    prismCss.rel = 'stylesheet';
                    prismCss.href = 'https://cdn.jsdelivr.net/npm/prismjs/themes/prism.css';
                    document.head.appendChild(prismCss);
                }
            }
        } else {
            this.textElement.textContent = messageText;
        }
        this.content.appendChild(this.textElement);

        if (this.imageData) {
            const imageContainer = this.createElement('div', 'mx-chat-image');
            const image = this.createElement('img');
            image.src = `data:image/png;base64,${this.imageData}`;
            image.addEventListener('click', this.showImageModal.bind(this));
            imageContainer.appendChild(image);
            this.content.appendChild(imageContainer);
        }

        this.element.appendChild(header);
        this.element.appendChild(this.content);
    }

    toggleReasoning() {
        this.isReasoningVisible = !this.isReasoningVisible;
        this.reasoningText.style.display = this.isReasoningVisible ? 'block' : 'none';
        this.reasoningContainer.querySelector('.mx-chat-reasoning-toggle').textContent = 
            this.isReasoningVisible ? '▼ 隐藏推理' : '▶ 展开推理';
    }

    updateText(newData) {
        if (typeof newData === 'object') {
            const reasoningContent = newData.reasoning_content || '';
            const content = newData.text || '';
            const format = this.message.format || null;

            if (reasoningContent) {
                if (!this.reasoningContainer) {
                    this.reasoningContainer = this.createElement('div', 'mx-chat-reasoning-container');
                    const toggleButton = this.createElement('button', 'mx-chat-reasoning-toggle');
                    toggleButton.textContent = this.isReasoningVisible ? '▼ 隐藏推理' : '▶ 展开推理';
                    toggleButton.onclick = () => this.toggleReasoning();

                    this.reasoningText = this.createElement('div', 'mx-chat-reasoning-text');
                    this.reasoningText.textContent = reasoningContent;
                    this.reasoningText.style.display = this.isReasoningVisible ? 'block' : 'none';

                    this.reasoningContainer.appendChild(toggleButton);
                    this.reasoningContainer.appendChild(this.reasoningText);
                    this.content.insertBefore(this.reasoningContainer, this.textElement);
                } else {
                    this.reasoningText.textContent = reasoningContent;
                }
            }

            if (this.textElement) {
                this.message.text = content;
                if (format === 'markdown' && window.marked) {
                    this.textElement.innerHTML = window.marked.parse(content);
                    if (window.Prism) Prism.highlightAll();
                } else {
                    this.textElement.textContent = content;
                }
            }
        }
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

    toJSON() {
        return {
            message: this.message,
            isUser: this.isUser,
            imageData: this.imageData,
            isReasoningVisible: this.isReasoningVisible
        };
    }

    static fromJSON(data) {
        const instance = new MessageComponent(data.message, data.isUser, data.imageData);
        instance.isReasoningVisible = data.isReasoningVisible;
        if (!instance.message.reasoning_content && data.message.reasoning_content) {
            instance.toggleReasoning();
        }
        return instance;
    }
}

// 内联样式（无变化）
const styleElement = document.createElement('style');
styleElement.textContent = `
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
        width: 100%;
        max-width: 100%;
        background: transparent;
        border-radius: 0;
        border: none;
        box-shadow: none;
        line-height: 1.4;
        white-space: pre-wrap;
    }
    .mx-chat-message.assistant .mx-chat-text table {
        border-collapse: collapse;
        width: 100%;
        margin: 10px 0;
        background: var(--comfy-menu-bg);
    }
    .mx-chat-message.assistant .mx-chat-text th,
    .mx-chat-message.assistant .mx-chat-text td {
        border: 1px solid var(--border-color);
        padding: 8px;
        text-align: left;
    }
    .mx-chat-message.assistant .mx-chat-text th {
        background: rgba(74, 144, 226, 0.1);
        font-weight: bold;
    }
    .mx-chat-message.assistant .mx-chat-text tr:nth-child(even) {
        background: rgba(255, 255, 255, 0.05);
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
    .mx-chat-reasoning-container {
        margin-bottom: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.05);
    }
    .mx-chat-reasoning-toggle {
        width: 100%;
        text-align: left;
        padding: 4px 8px;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 12px;
    }
    .mx-chat-reasoning-toggle:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    .mx-chat-reasoning-text {
        padding: 8px;
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        white-space: pre-wrap;
        line-height: 1.4;
    }
`;
document.head.appendChild(styleElement);