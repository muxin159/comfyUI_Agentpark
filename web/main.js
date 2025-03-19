// main.js
import { app } from "../../scripts/app.js"; // 假设这是 ComfyUI 的外部依赖
import { MXChatSidebar } from './chatSidebar.js';

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