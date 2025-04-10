import re
from server import PromptServer
from ..logger import MXLogger

# 获取日志实例
logger = MXLogger.get_instance()

class MXChatSendNode:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"hidden": True})
            }
        }
    
    RETURN_TYPES = ("STRING",)
    FUNCTION = "execute"
    CATEGORY = "Agentpark/SendNode"
    
    def execute(self, text):
        # 将用户输入的文本向下传递
        return (text,)

class MXChatReceiveNode:
    """
    接收消息节点，用于接收和显示聊天消息
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
            }
        }
    
    RETURN_TYPES = ("STRING",)
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "Agentpark/ReceiveNode"

    def execute(self, text):
        logger.info("开始处理接收到的消息")
        # 处理输入的消息文本
        # 如果输入是元组或列表类型，取第一个元素作为消息内容
        if isinstance(text, (tuple, list)):
            message = text[0] if text else ""
          
        else:
            # 如果输入不是None，转换为字符串；否则设为空字符串
            message = str(text) if text is not None else ""
            
        
        # 使用strip()方法去除消息前后的空格、换行等空白字符
        message = message.strip()
        
        try:
            # 检查消息是否包含markdown元素
            has_markdown = any([
                bool(re.search(r'```[\s\S]*?```', message)),  # 代码块
                bool(re.search(r'\|[^|]+\|[^|]+\|', message)),  # 表格（至少两列）
                bool(re.search(r'^[-*_]{3,}$', message, re.MULTILINE)),  # 分隔线
                bool(re.search(r'^#{1,6}\s+\S+', message, re.MULTILINE)),  # 标题
                bool(re.search(r'\*\*[^*]+\*\*|__[^_]+__', message)),  # 加粗
                bool(re.search(r'\*[^*]+\*|_[^_]+_', message)),  # 斜体
                bool(re.search(r'\[([^\]]+)\]\(([^)]+)\)', message))  # 链接
            ]) if message else False

            # 准备消息数据
            message_data = {
                "text": message,  # 直接使用处理后的消息
                "isUser": False,
                "sender": "牧小新",
                "mode": "agent",
                "format": "markdown" if has_markdown else "text"  # 始终设置format字段
            }

          
            
            # 使用PromptServer的send_sync方法同步发送消息到前端
            PromptServer.instance.send_sync("mx-chat-message", message_data)
        
        except Exception as e:
            error_msg = f"处理消息失败: {str(e)}"
            logger.error(error_msg)
            print(error_msg)
        
        # 返回处理后的消息内容，作为节点的输出
        return (message,)