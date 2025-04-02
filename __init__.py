import os
import subprocess
import threading
import time
from server import PromptServer  # 导入 PromptServer 以确保注册时机
from .nodes.chat import MXChatSendNode, MXChatReceiveNode
from .nodes.image import MXChatImageReceiveNode
from .nodes.image_send import MXChatImageSendNode
from .nodes.table_send import MXChatTableSendNode
from .nodes.audio_send import MXChatAudioSendNode
from .nodes.video_send import MXChatVideoSendNode
from .nodes.video import MXChatVideoReceiveNode
from .websocket_handler import websocket_handler  # 确保导入 WebSocket 处理器
from .chat_server import config_manager  # 导入配置管理器
from .logger import MXLogger
from .folder_sync import FolderSync

# 获取日志实例
logger = MXLogger.get_instance()

# 设置 Web 目录，用于加载前端扩展
WEB_DIRECTORY = os.path.join(os.path.dirname(os.path.realpath(__file__)), "web")

# 服务器进程
server_process = None
chat_server_process = None

def start_server(script_name, port):
    """启动服务器并检查是否成功"""
    try:
        script_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), script_name)
        if not os.path.exists(script_path):
            logger.error(f"服务器脚本 {script_path} 不存在")
            return None
        process = subprocess.Popen(["python", script_path], cwd=os.path.dirname(script_path))
        # 等待短暂时间检查进程是否存活
        time.sleep(2)
        if process.poll() is None:
            logger.info(f"成功启动服务器 {script_name} 在端口 {port}")
            return process
        else:
            logger.error(f"服务器 {script_name} 启动后立即退出，返回码: {process.returncode}")
            return None
    except Exception as e:
        logger.error(f"启动服务器 {script_name} 失败: {str(e)}")
        return None

def monitor_servers():
    """监控服务器进程并在停止时重启"""
    global server_process, chat_server_process
    while True:
        if server_process and server_process.poll() is not None:
            logger.warning("语音识别服务器已停止，正在重新启动...")
            server_process = start_server("server.py", 8165)
        
        if chat_server_process and chat_server_process.poll() is not None:
            logger.warning("聊天服务器已停止，正在重新启动...")
            chat_server_process = start_server("chat_server.py", 8166)
        
        time.sleep(5)

def ensure_websocket_handler_registered():
    """确保 WebSocket 处理器在 PromptServer 可用时注册"""
    if PromptServer.instance is not None:
        # 确保 websocket_handler 单例已初始化并注册
        websocket_handler.register_handlers()
        # 将 config_manager 的更新函数注册为监听器
        websocket_handler.register_config_listener(config_manager.update_config)
        logger.info("WebSocket 处理器和配置监听器已注册")
    else:
        logger.warning("PromptServer.instance 尚未初始化，延迟注册 WebSocket 处理器")
        # 如果 PromptServer 未就绪，延迟重试
        threading.Timer(1.0, ensure_websocket_handler_registered).start()

# 启动服务器
server_process = start_server("server.py", 8165)
chat_server_process = start_server("chat_server.py", 8166)

# 启动监控线程
monitor_thread = threading.Thread(target=monitor_servers, daemon=True)
monitor_thread.start()

# 初始化文件夹同步
source_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), "agentpark_workflow")
target_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__)))), "user", "default", "workflows", "agentpark_workflow")
folder_sync = FolderSync(source_dir, target_dir)
folder_sync.start_sync()

# 在模块加载时尝试注册 WebSocket 处理器
ensure_websocket_handler_registered()

# 导出节点
NODE_CLASS_MAPPINGS = {
    "MXChatSend": MXChatSendNode,
    "MXChatReceive": MXChatReceiveNode,
    "MXChatImageReceive": MXChatImageReceiveNode,
    "MXChatImageSend": MXChatImageSendNode,
    "MXChatTableSend": MXChatTableSendNode,
    "MXChatAudioSend": MXChatAudioSendNode,
    "MXChatVideoSend": MXChatVideoSendNode,
    "MXChatVideoReceive": MXChatVideoReceiveNode,
}

# 节点显示名称映射
NODE_DISPLAY_NAME_MAPPINGS = {
    "MXChatSend": "发送消息",
    "MXChatReceive": "接收消息",
    "MXChatImageReceive": "接收图片",
    "MXChatImageSend": "发送图片",
    "MXChatTableSend": "发送表格",
    "MXChatAudioSend": "发送音频",
    "MXChatVideoSend": "发送视频",
    "MXChatVideoReceive": "接收视频",
}