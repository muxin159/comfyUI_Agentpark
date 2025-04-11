// main.js
import { app } from "../../scripts/app.js";
import { MXChatSidebar } from './chatSidebar.js';

// 全局视频模态框管理器
export const VideoModalManager = {
    currentModal: null,
    currentVideo: null,

    createModal(createElementFn, videoData, fileType) {
        // 如果已有模态框，立即移除并暂停视频
        this.closeModal();

        const modal = createElementFn('div', 'mx-chat-video-modal');
        const modalContent = createElementFn('div', 'mx-chat-video-modal-content');
        const modalVideo = createElementFn('video');
        modalVideo.controls = true;
        modalVideo.className = 'mx-chat-video-modal-player';

        // 设置视频源
        if (typeof videoData === 'string') {
            modalVideo.src = `data:video/mp4;base64,${videoData}`;
        } else if (videoData && videoData.fileType && (videoData.base64Data || videoData.videoData)) {
            modalVideo.src = `data:${videoData.fileType || fileType};base64,${videoData.base64Data || videoData.videoData}`;
        } else if (videoData && videoData.videoUrl) {
            modalVideo.src = videoData.videoUrl;
        } else {
            console.warn('videoData 格式不正确，无法设置视频源:', videoData);
            return;
        }

        modalContent.appendChild(modalVideo);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 立即显示并播放
        modal.classList.add('visible');
        modalVideo.play().catch(err => console.error('视频播放失败:', err));

        // 点击关闭模态框
        modal.addEventListener('click', (e) => {
            if (e.target === modalVideo || modalVideo.contains(e.target)) return;
            this.closeModal();
        });

        this.currentModal = modal;
        this.currentVideo = modalVideo;
        console.log('创建新模态框:', this.currentModal);
    },

    closeModal() {
        if (this.currentModal) {
            console.log('关闭现有模态框:', this.currentModal);
            if (this.currentVideo) {
                this.currentVideo.pause(); // 暂停视频
                this.currentVideo.currentTime = 0; // 重置播放位置
            }
            this.currentModal.classList.remove('visible');
            this.currentModal.remove(); // 立即移除，不使用 setTimeout
            this.currentModal = null;
            this.currentVideo = null;
        }
    }
};

function initMXChat() {
    window.mxChatInstance = new MXChatSidebar();
}

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