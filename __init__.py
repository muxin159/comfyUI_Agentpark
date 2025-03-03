import os
import subprocess
import threading
import time
from .nodes.chat import MXChatSendNode, MXChatReceiveNode
from .nodes.image import MXChatImageReceiveNode
from .nodes.websocket_handler import websocket_handler
from .nodes.logger import MXLogger

# 获取日志实例
logger = MXLogger.get_instance()

# 设置Web目录，用于加载前端扩展
WEB_DIRECTORY = os.path.join(os.path.dirname(os.path.realpath(__file__)), "web")

# 服务器进程
server_process = None
chat_server_process = None

def start_server(script_name, port):
    try:
        script_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), script_name)
        process = subprocess.Popen(["python", script_path], cwd=os.path.dirname(script_path))
        logger.info(f"成功启动服务器 {script_name} 在端口 {port}")
        return process
    except Exception as e:
        logger.error(f"启动服务器 {script_name} 失败: {str(e)}")
        return None

def monitor_servers():
    global server_process, chat_server_process
    while True:
        if server_process and server_process.poll() is not None:
            logger.warning("语音识别服务器已停止，正在重新启动...")
            server_process = start_server("server.py", 8000)
        
        if chat_server_process and chat_server_process.poll() is not None:
            logger.warning("聊天服务器已停止，正在重新启动...")
            chat_server_process = start_server("nodes/chat_server.py", 8001)
        
        time.sleep(5)

# 启动服务器
server_process = start_server("server.py", 8000)
chat_server_process = start_server("nodes/chat_server.py", 8001)

# 启动监控线程
monitor_thread = threading.Thread(target=monitor_servers, daemon=True)
monitor_thread.start()

# 导出节点
NODE_CLASS_MAPPINGS = {
    "MXChatSend": MXChatSendNode,
    "MXChatReceive": MXChatReceiveNode,
    "MXChatImageReceive": MXChatImageReceiveNode,
}

# 节点显示名称映射
NODE_DISPLAY_NAME_MAPPINGS = {
    "MXChatSend": "发送消息",
    "MXChatReceive": "接收消息",
    "MXChatImageReceive": "接收图片",
}