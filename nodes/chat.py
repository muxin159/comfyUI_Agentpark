from server import PromptServer
from .logger import MXLogger

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
    CATEGORY = "MX Chat"
    
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
    CATEGORY = "MX Chat"

    def execute(self, text):
        logger.info("开始处理接收到的消息")
        # 处理输入的消息文本
        # 如果输入是元组或列表类型，取第一个元素作为消息内容
        if isinstance(text, (tuple, list)):
            message = text[0] if text else ""
            logger.debug(f"处理元组/列表类型的输入: {message}")
        else:
            # 如果输入不是None，转换为字符串；否则设为空字符串
            message = str(text) if text is not None else ""
            logger.debug(f"处理字符串类型的输入: {message}")
        
        # 使用strip()方法去除消息前后的空格、换行等空白字符
        message = message.strip()
        
        # 检查消息是否为空，只有非空消息才会被发送
        if message:
            try:
                # 使用PromptServer的send_sync方法发送消息到前端
                PromptServer.instance.send_sync("mx-chat-message", {
                    "text": message,
                    "isUser": False,
                    "sender": "牧小新",
                    "mode": "agent",
                    "format": "markdown"
                })
                logger.debug(f"消息已发送到前端: {message}")
            except Exception as e:
                error_msg = f"发送消息到前端失败: {str(e)}"
                logger.error(error_msg)
                print(error_msg)
        else:
            logger.debug("消息为空，跳过发送")
        
        # 返回处理后的消息内容，作为节点的输出
        return (message,)