import base64
import json
import traceback
from io import BytesIO
from PIL import Image
import numpy as np
import torch
import threading
import os
import time
from server import PromptServer
from ..logger import MXLogger

# 获取日志记录器实例
logger = MXLogger.get_instance()


class MXChatImageReceiveNode:
    """
    图像接收节点类，用于接收工作流中的图片，将其发送到前端显示，
    并向下传递与 LoadImage 一致的图像和掩码张量。
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"forceInput": True}),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "MX Chat"

    def execute(self, image):
        try:
            logger.info("[MXChatImageReceiveNode] 开始处理接收到的图片数据")
            
            if image is None or not isinstance(image, torch.Tensor) or image.numel() == 0:
                logger.error("[MXChatImageReceiveNode] 输入图像为空或无效")
                return self._return_default()
            
            output_images = []
            output_masks = []
            w, h = None, None
            
            if len(image.shape) == 4:
                batch_size = image.shape[0]
                logger.debug(f"[MXChatImageReceiveNode] 处理批量图像，批量大小: {batch_size}")
            else:
                batch_size = 1
                image = image.unsqueeze(0)
                logger.debug("[MXChatImageReceiveNode] 处理单张图像，增加批量维度")
            
            for i in range(batch_size):
                img_tensor = image[i]
                
                img_np = (img_tensor.cpu().numpy() * 255).astype(np.uint8)
                img_pil = Image.fromarray(img_np)
                
                if w is None and h is None:
                    w, h = img_pil.size[0], img_pil.size[1]
                
                if img_pil.size[0] != w or img_pil.size[1] != h:
                    logger.debug(f"[MXChatImageReceiveNode] 跳过尺寸不匹配的图像: {img_pil.size}")
                    continue
                
                if img_pil.mode != 'RGB':
                    img_pil = img_pil.convert('RGB')
                
                img_array = np.array(img_pil).astype(np.float32) / 255.0
                img_tensor_out = torch.from_numpy(img_array)
                output_images.append(img_tensor_out)
                
                mask = torch.zeros((h, w), dtype=torch.float32)
                output_masks.append(mask)
            
            if len(output_images) > 1:
                output_image = torch.stack(output_images, dim=0)
                output_mask = torch.stack(output_masks, dim=0)
                logger.debug(f"[MXChatImageReceiveNode] 输出批量图像，形状: {output_image.shape}")
            elif len(output_images) == 1:
                output_image = output_images[0].unsqueeze(0)
                output_mask = output_masks[0].unsqueeze(0)
                logger.debug(f"[MXChatImageReceiveNode] 输出单张图像，形状: {output_image.shape}")
            else:
                logger.error("[MXChatImageReceiveNode] 未生成有效的输出图像")
                return self._return_default()
            
            first_img_np = (output_image[0].cpu().numpy() * 255).astype(np.uint8)
            first_img_pil = Image.fromarray(first_img_np)
            buffer = BytesIO()
            first_img_pil.save(buffer, format='PNG')
            image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
            
            PromptServer.instance.send_sync("mx-chat-message", {
                "text": "这是生成的图片",
                "isUser": False,
                "sender": "牧小新",
                "imageData": image_base64,
                "mode": "agent",
                "format": "markdown"
            })
            logger.debug("[MXChatImageReceiveNode] 第一张图片已发送到前端")
            
            return (output_image, output_mask)
        
        except Exception as e:
            error_msg = f"[MXChatImageReceiveNode] 处理接收到的图片失败: {str(e)}"
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