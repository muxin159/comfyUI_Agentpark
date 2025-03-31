import base64
import cv2
import torch
import numpy as np
from io import BytesIO
import tempfile
import logging
import os
import torchaudio
import io
import subprocess
import traceback

logger = logging.getLogger('MXChat')

class MXChatVideoSendNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video_data": ("STRING", {"default": "", "hidden": True}),
                "location_name": ("STRING", {"default": "默认位置"}),
            },
            "optional": {
                "text": ("STRING", {"default": "", "hidden": True}),
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO")
    RETURN_NAMES = ("frames", "audio")
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
            logger.warning("[MXChatVideoSendNode] widgets 未定义，跳过初始化")

    def execute(self, video_data, location_name="默认位置", text=""):
        effective_location_name = self.location_name if self.location_name else location_name
        try:
            logger.info(f"[MXChatVideoSendNode] 开始处理视频数据，location_name: {effective_location_name}")
            if not video_data:
                logger.error("[MXChatVideoSendNode] 未提供视频数据")
                return (torch.zeros(1, 64, 64, 3), {"waveform": torch.zeros(1, 1, 1), "sample_rate": 44100})

            if 'base64,' in video_data:
                video_data = video_data.split('base64,')[1]
             

            # 解码 Base64 数据为字节
            video_bytes = base64.b64decode(video_data)

            # 创建临时目录用于处理视频和音频文件
            temp_dir = tempfile.mkdtemp(prefix="mxchat_video_")
            temp_file_path = os.path.join(temp_dir, "input.mp4")
            temp_audio_path = os.path.join(temp_dir, "audio.wav")
            
            try:
                # 将字节流写入临时文件
                with open(temp_file_path, "wb") as f:
                    f.write(video_bytes)
                
            
                
                # 使用 OpenCV 打开临时文件提取视频帧
                cap = cv2.VideoCapture(temp_file_path, cv2.CAP_FFMPEG)
                if not cap.isOpened():
                    logger.error("[MXChatVideoSendNode] 无法打开视频文件")
                    return (torch.zeros(1, 64, 64, 3), {"waveform": torch.zeros(1, 1, 1), "sample_rate": 44100})
                
                frames = []
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    frame_tensor = torch.from_numpy(frame_rgb).float() / 255.0
                    frames.append(frame_tensor)
                
                cap.release()
                
                if not frames:
                    logger.error("[MXChatVideoSendNode] 视频中未提取到帧")
                    return (torch.zeros(1, 64, 64, 3), {"waveform": torch.zeros(1, 1, 1), "sample_rate": 44100})
                
                video_tensor = torch.stack(frames)  # [帧数, 高度, 宽度, 3]
                logger.info(f"[MXChatVideoSendNode] 视频帧提取完成，形状: {video_tensor.shape}")
                
                # 提取音频数据 - 首先尝试使用ffmpeg提取音频到WAV文件
                audio_data = None
                try:
                    # 使用ffmpeg提取音频到WAV文件
                    ffmpeg_cmd = [
                        "ffmpeg", "-i", temp_file_path, "-vn", "-acodec", "pcm_s16le", 
                        "-ar", "44100", "-ac", "2", "-y", temp_audio_path
                    ]
                
                    result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
                    
                    if result.returncode != 0:
                        logger.warning(f"[MXChatVideoSendNode] ffmpeg提取音频失败: {result.stderr}")
                        raise Exception(f"ffmpeg提取音频失败: {result.stderr}")
                    
                    if os.path.exists(temp_audio_path) and os.path.getsize(temp_audio_path) > 0:
                        # 使用torchaudio加载提取的音频文件
                        waveform, sample_rate = torchaudio.load(temp_audio_path)
                        
                        # 确保波形是三维张量 [batch_size, channels, samples]
                        if waveform.dim() == 1:  # 单声道一维数据
                            waveform = waveform.unsqueeze(0).unsqueeze(0)  # 转换为 [1, 1, samples]
                        elif waveform.dim() == 2:  # 立体声二维数据 [channels, samples]
                            waveform = waveform.unsqueeze(0)  # 转换为 [1, channels, samples]
                        
                        audio_data = {"waveform": waveform, "sample_rate": sample_rate}
                        logger.info(f"[MXChatVideoSendNode] 音频提取成功，波形形状: {waveform.shape}, 采样率: {sample_rate}")
                    else:
                        logger.warning(f"[MXChatVideoSendNode] 音频文件不存在或为空: {temp_audio_path}")
                        raise Exception("提取的音频文件不存在或为空")
                        
                except Exception as e:
                    # 如果ffmpeg提取失败，尝试使用torchaudio直接从视频文件提取
                    logger.warning(f"[MXChatVideoSendNode] ffmpeg提取音频失败，尝试使用torchaudio: {str(e)}")
                    try:
                        waveform, sample_rate = torchaudio.load(temp_file_path)
                        
                        # 确保波形是三维张量 [batch_size, channels, samples]
                        if waveform.dim() == 1:  # 单声道一维数据
                            waveform = waveform.unsqueeze(0).unsqueeze(0)  # 转换为 [1, 1, samples]
                        elif waveform.dim() == 2:  # 立体声二维数据 [channels, samples]
                            waveform = waveform.unsqueeze(0)  # 转换为 [1, channels, samples]
                        
                        audio_data = {"waveform": waveform, "sample_rate": sample_rate}
                        logger.info(f"[MXChatVideoSendNode] 使用torchaudio直接提取音频成功，波形形状: {waveform.shape}, 采样率: {sample_rate}")
                    except Exception as e2:
                        logger.error(f"[MXChatVideoSendNode] 所有音频提取方法均失败: {str(e2)}")
                        logger.error(traceback.format_exc())
                        audio_data = {"waveform": torch.zeros(1, 2, 44100), "sample_rate": 44100}
            except Exception as e:
                logger.error(f"[MXChatVideoSendNode] 提取音频失败: {str(e)}")
                logger.error(traceback.format_exc())
                audio_data = {"waveform": torch.zeros(1, 2, 44100), "sample_rate": 44100}
            
            logger.info(f"[MXChatVideoSendNode] 视频处理完成，输出张量形状: {video_tensor.shape}")
            if audio_data:
                logger.info(f"[MXChatVideoSendNode] 音频数据: 波形形状={audio_data['waveform'].shape}, 采样率={audio_data['sample_rate']}")
            else:
                logger.warning("[MXChatVideoSendNode] 没有有效的音频数据")
                audio_data = {"waveform": torch.zeros(1, 2, 44100), "sample_rate": 44100}
                
            return (video_tensor, audio_data)

        except Exception as e:
            logger.error(f"[MXChatVideoSendNode] 处理视频失败: {str(e)}")
            return (torch.zeros(1, 64, 64, 3), {"waveform": torch.zeros(1, 1, 1), "sample_rate": 44100})
        finally:
            # 清理所有临时文件和目录
            if 'temp_dir' in locals() and os.path.exists(temp_dir):
                try:
                    for root, dirs, files in os.walk(temp_dir, topdown=False):
                        for file in files:
                            try:
                                os.unlink(os.path.join(root, file))
                            except Exception as e:
                                logger.warning(f"[MXChatVideoSendNode] 删除临时文件失败: {str(e)}")
                    os.rmdir(temp_dir)
                   
                except Exception as e:
                    logger.warning(f"[MXChatVideoSendNode] 清理临时目录失败: {str(e)}")