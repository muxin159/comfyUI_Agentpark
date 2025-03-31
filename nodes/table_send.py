import base64
import pandas as pd
from io import BytesIO
import logging
from server import PromptServer

logger = logging.getLogger(__name__)

class MXChatTableSendNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "table_data": ("STRING", {
                    "multiline": False,
                    "default": "",
                    "hidden": True,
                    "dynamicPrompts": False
                }),
                "file_type": ("STRING", {
                    "multiline": False,
                    "default": "",
                    "hidden": True,
                    "dynamicPrompts": False
                }),
                "file_name": ("STRING", {
                    "multiline": False,
                    "default": "未命名",
                    "hidden": True,
                    "dynamicPrompts": False
                }),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("message",)
    FUNCTION = "execute"
    CATEGORY = "Agentpark"
    OUTPUT_NODE = True  # 标记为输出节点，以便触发前端消息

    def execute(self, table_data=None, file_type=None, file_name=None):
        try:
            # 验证表格数据
            if not table_data:
                logger.error("[MXChatTableSendNode] 表格数据为空")
                self.send_error("表格数据为空")
                return ("表格数据为空",)

            # 解码 Base64 数据
            table_bytes = base64.b64decode(table_data)
            table_io = BytesIO(table_bytes)

            # 根据文件类型读取表格
            if file_type == 'text/csv':
                df = pd.read_csv(table_io)
            elif file_type in ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']:
                df = pd.read_excel(table_io)
            else:
                error_msg = f"不支持的文件类型: {file_type}"
                logger.error(f"[MXChatTableSendNode] {error_msg}")
                self.send_error(error_msg)
                return (error_msg,)

            # 检查表格是否为空
            if df.empty:
                logger.warning("[MXChatTableSendNode] 表格内容为空")
                self.send_error("表格内容为空")
                return ("表格内容为空",)

            # 将表格转换为 Markdown 格式
            table_md = df.to_markdown(index=False)
            message = f"文件名: {file_name or '未命名'}\n\n{table_md}"
     
            return (message,)
        except Exception as e:
            error_msg = f"[MXChatTableSendNode] 处理表格文件失败: {str(e)}"
            logger.error(error_msg)
            self.send_error(error_msg)
            return (error_msg,)

    def send_error(self, error_msg):
        """发送错误消息到前端"""
        PromptServer.instance.send_sync("mx-chat-message", {
            "text": f"错误: {error_msg}",
            "isUser": False,
            "sender": "牧小新",
            "mode": "agent",
            "format": "markdown"
        })

    @classmethod
    def IS_CHANGED(cls, table_data, file_type, file_name):
        return True  # 每次执行都重新计算，确保数据最新