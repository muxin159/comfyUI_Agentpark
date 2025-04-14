import base64
from io import BytesIO
from PIL import Image
import numpy as np
import torch
from ..logger import MXLogger

logger = MXLogger.get_instance()

class MXChatImageSendNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_data": ("STRING", {"default": "", "hidden": True}),
                "location_name": ("STRING", {"default": "默认位置", "multiline": False}),
            },
            "optional": {
                "text": ("STRING", {"default": "", "hidden": True}),
            }
        }
    
    RETURN_TYPES = ("IMAGE",)  # 保持接口一致，但 MASK 可以是占位符
    RETURN_NAMES = ("image", )
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "Agentpark"

    def __init__(self):
        self.location_name = None

    def onNodeCreated(self):
        self.location_name = "默认位置"
        if hasattr(self, "widgets"):
            for widget in self.widgets:
                if widget.name == "location_name":
                    widget.value = self.location_name
                    break
        else:
            logger.warning("[MXChatImageSendNode] widgets 未定义，跳过初始化")

    def execute(self, image_data, location_name="默认位置", text=""):
        effective_location_name = self.location_name if self.location_name else location_name
        try:
            logger.info(f"[MXChatImageSendNode] 开始处理图片数据，location_name: {effective_location_name}")
            if not image_data:
                logger.error("[MXChatImageSendNode] 未提供图片数据")
                return self._return_default()
            if 'base64,' in image_data:
                image_data = image_data.split('base64,')[1]
          
            image_bytes = base64.b64decode(image_data)
            image = Image.open(BytesIO(image_bytes))
       
            # 直接使用原始图像数据，不强制转换模式
            img_array = np.array(image).astype(np.float32) / 255.0
            img_tensor = torch.from_numpy(img_array).unsqueeze(0)  # 保持原始通道数
            
            # 生成一个占位符掩码（如果下游需要，但不包含透明信息）
            mask = torch.ones((1, image.size[1], image.size[0]), dtype=torch.float32)  # 全1掩码，表示不透明

            logger.info(f"[MXChatImageSendNode] 图片处理完成，输出张量形状: {img_tensor.shape}")
            return (img_tensor, mask)
        except Exception as e:
            logger.error(f"[MXChatImageSendNode] 处理图片失败: {str(e)}")
            return self._return_default()

    def _return_default(self):
        default_image = torch.zeros((1, 64, 64, 3), dtype=torch.float32)  # 默认 RGB
        
        return (default_image, )