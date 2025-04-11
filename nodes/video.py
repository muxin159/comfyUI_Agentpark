import cv2
import torch
import numpy as np
import tempfile
import uuid
import os
import shutil
import subprocess
import traceback
import torchaudio
from server import PromptServer
from ..logger import MXLogger

logger = MXLogger.get_instance()

class MXChatVideoReceiveNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video": ("IMAGE", {"forceInput": True}),
            },
            "optional": {
                "audio": ("AUDIO", {"forceInput": True}),
            }
        }
    
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "Agentpark/ReceiveNode"

    def execute(self, video, audio=None):
        try:
            logger.info("[MXChatVideoReceiveNode] 开始处理接收到的视频数据")
            
            if video is None or not isinstance(video, torch.Tensor) or video.numel() == 0:
                logger.error("[MXChatVideoReceiveNode] 输入视频为空或无效")
                return self._return_default()
            
            if len(video.shape) != 4:
                logger.error(f"[MXChatVideoReceiveNode] 输入视频形状无效: {video.shape}")
                return self._return_default()
            
            num_frames, height, width, channels = video.shape
          
            
            # 调整分辨率到最大 1920x1080
            max_width, max_height = 1920, 1080
            if width > max_width or height > max_height:
                scale = min(max_width / width, max_height / height)
                new_width, new_height = int(width * scale), int(height * scale)
                logger.info(f"调整分辨率从 {width}x{height} 到 {new_width}x{new_height}")
            else:
                new_width, new_height = width, height
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_file:
                temp_file_path = temp_file.name
            temp_avi_path = temp_file_path.replace('.mp4', '.avi')
            
            fourcc = cv2.VideoWriter_fourcc(*'MJPG')  # type: ignore
            out = cv2.VideoWriter(temp_avi_path, fourcc, 30.0, (new_width, new_height), True)
            if not out.isOpened():
                logger.error("[MXChatVideoReceiveNode] 视频编码器初始化失败，尝试使用 XVID")
                fourcc = cv2.VideoWriter_fourcc(*'XVID')  # type: ignore
                out = cv2.VideoWriter(temp_avi_path, fourcc, 30.0, (new_width, new_height), True)
                if not out.isOpened():
                    raise Exception("视频编码器初始化失败（MJPG 和 XVID 均不可用）")
            
            for i in range(num_frames):
                frame = video[i].cpu().numpy()
                frame = np.clip(frame, 0, 1) * 255
                frame = frame.astype(np.uint8)
                if frame.shape[-1] != 3:
                    logger.error(f"[MXChatVideoReceiveNode] 帧 {i} 的通道数不正确: {frame.shape}")
                    continue
                if new_width != width or new_height != height:
                    frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
                frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                out.write(frame)
            
            out.release()
            
            # 检查 AVI 文件是否有效
            if os.path.getsize(temp_avi_path) < 1024:  # 小于 1KB，可能为空
                logger.error(f"[MXChatVideoReceiveNode] 生成的 AVI 文件可能为空，大小: {os.path.getsize(temp_avi_path)} 字节")
            
            # 如果有音频数据，将其保存为临时文件
            temp_audio_path = None
            if audio is not None and isinstance(audio, dict) and 'waveform' in audio and 'sample_rate' in audio:
                try:
                    logger.info("[MXChatVideoReceiveNode] 处理音频数据")
                    waveform = audio['waveform']
                    sample_rate = audio['sample_rate']
                    
                    # 确保波形是正确的形状
                    if waveform.dim() == 3:  # [batch, channels, samples]
                        waveform = waveform.squeeze(0)  # 移除批次维度，变为 [channels, samples]
                    
                    # 创建临时音频文件
                    temp_audio_path = temp_file_path.replace('.mp4', '.wav')
                    torchaudio.save(temp_audio_path, waveform, sample_rate)
                    logger.info(f"[MXChatVideoReceiveNode] 音频数据已保存到临时文件: {temp_audio_path}")
                    
                    # 检查音频文件是否有效
                    if os.path.getsize(temp_audio_path) < 1024:  # 小于 1KB，可能为空
                        logger.warning(f"[MXChatVideoReceiveNode] 生成的音频文件可能为空，大小: {os.path.getsize(temp_audio_path)} 字节")
                        temp_audio_path = None
                except Exception as e:
                    logger.error(f"[MXChatVideoReceiveNode] 处理音频数据失败: {str(e)}")
                    logger.error(traceback.format_exc())
                    temp_audio_path = None
            
            # 根据是否有音频数据选择不同的ffmpeg命令
            if temp_audio_path:
                logger.info("[MXChatVideoReceiveNode] 合并视频和音频")
                subprocess.run(
                    ['ffmpeg', '-i', temp_avi_path, '-i', temp_audio_path, '-c:v', 'libx264', 
                     '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', temp_file_path],
                    check=True, capture_output=True
                )
            else:
                logger.info("[MXChatVideoReceiveNode] 仅处理视频数据，无音频")
                subprocess.run(
                    ['ffmpeg', '-i', temp_avi_path, '-c:v', 'libx264', '-preset', 'ultrafast', 
                     '-pix_fmt', 'yuv420p', '-y', temp_file_path],
                    check=True, capture_output=True
                )
            
            # 保存到 ComfyUI/output 目录
            comfyui_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
            output_dir = os.path.join(comfyui_root, 'output')
            os.makedirs(output_dir, exist_ok=True)
            filename = f'{uuid.uuid4()}.mp4'
            target_path = os.path.join(output_dir, filename)
            shutil.copy2(temp_file_path, target_path)
            if not os.path.exists(target_path):
                logger.error(f"[MXChatVideoReceiveNode] 视频文件未正确生成: {target_path}")
                raise Exception("视频文件生成失败")
            elif os.path.getsize(target_path) < 1024:  # 检查 MP4 文件大小
                logger.error(f"[MXChatVideoReceiveNode] 生成的 MP4 文件可能无效，大小: {os.path.getsize(target_path)} 字节")
            else:
                logger.info(f"[MXChatVideoReceiveNode] 视频文件成功保存: {target_path}")
            
            video_url = f"/view?filename={filename}"
          
            
            PromptServer.instance.send_sync("mx-chat-message", {
                "text": "这是生成的视频",
                "isUser": False,
                "sender": "牧小新",
                "videoData": [{"fileType": "video/mp4", "videoUrl": video_url}],
                "mode": "agent",
                "format": "markdown"
            })
            logger.info("[MXChatVideoReceiveNode] 视频已发送到前端")
            
    
          
            
            return (video,)
        
        except Exception as e:
            error_msg = f"[MXChatVideoReceiveNode] 处理视频失败: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            return self._return_default()

    def _return_default(self):
        default_video = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
        return (default_video,)