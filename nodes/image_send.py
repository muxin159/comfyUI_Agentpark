import base64
import json
import traceback
from io import BytesIO
from PIL import Image
import numpy as np
import torch
from server import PromptServer
from ..logger import MXLogger

# 获取日志记录器实例
logger = MXLogger.get_instance()

class MXChatImageSendNode:
    """
    图像发送节点类，用于接收前端发送的base64编码图片数据，
    将其转换为ComfyUI可用的图像和掩码张量。
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_data": ("STRING", {"default": "", "hidden": True}),
            },
            "optional": {
                "text": ("STRING", {"default": "", "hidden": True}),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "MX Chat"

    def execute(self, image_data, text=""):
        try:
            logger.info("[MXChatImageSendNode] 开始处理接收到的base64图片数据")
            
            if not image_data:
                logger.error("[MXChatImageSendNode] 未提供图片数据")
                return self._return_default()
            
            # 移除base64前缀（如果存在）
            if 'base64,' in image_data:
                image_data = image_data.split('base64,')[1]
                logger.debug("[MXChatImageSendNode] 已移除base64前缀")
            
            # 解码base64数据
            try:
                image_bytes = base64.b64decode(image_data)
                image = Image.open(BytesIO(image_bytes))
                logger.debug(f"[MXChatImageSendNode] 成功解码图片，尺寸: {image.size}")
            except Exception as e:
                logger.error(f"[MXChatImageSendNode] base64解码失败: {str(e)}")
                return self._return_default()
            
            # 确保图片是RGB模式
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # 转换为numpy数组，并归一化到[0,1]范围
            img_array = np.array(image).astype(np.float32) / 255.0
            
            # 转换为torch张量
            img_tensor = torch.from_numpy(img_array)
            img_tensor = img_tensor.unsqueeze(0)  # 添加批次维度
            
            # 创建空白掩码
            mask = torch.zeros((1, image.size[1], image.size[0]), dtype=torch.float32)
            
            logger.info(f"[MXChatImageSendNode] 图片处理完成，输出张量形状: {img_tensor.shape}")
            
            # 发送处理后的图片到前端显示
            buffer = BytesIO()
            image.save(buffer, format='PNG')
            processed_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
            
            
            return (img_tensor, mask)
        
        except Exception as e:
            error_msg = f"[MXChatImageSendNode] 处理图片失败: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            PromptServer.instance.send_sync("mx-chat-message", {
                "text": error_msg,
                "isUser": False,
                "sender": "牧小新",
                "mode": "agent",
                "format": "markdown"
            })
            return self._return_default()

    def _return_default(self):
        default_image = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
        default_mask = torch.zeros((1, 64, 64), dtype=torch.float32)
        return (default_image, default_mask)

