import base64
import torch
import torchaudio
import io
import logging

logger = logging.getLogger('MXChat')

class MXChatAudioSendNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio_data": ("STRING", {"default": "", "hidden": True}),
                "location_name": ("STRING", {"default": "默认位置"}),
            },
            "optional": {
                "text": ("STRING", {"default": "", "hidden": True}),
            }
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "execute"
    CATEGORY = "Agentpark/SendNode"

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
            logger.warning("[MXChatAudioSendNode] widgets 未定义，跳过初始化")

    def execute(self, audio_data, location_name="默认位置", text=""):
        effective_location_name = self.location_name if self.location_name else location_name
        try:
            logger.info(f"[MXChatAudioSendNode] 开始处理音频数据，location_name: {effective_location_name}")
            if not audio_data:
                logger.error("[MXChatAudioSendNode] 未提供音频数据")
                return ({"waveform": torch.zeros(1, 1, 1), "sample_rate": 44100},)

            # 移除 base64 前缀（如果存在）
            if 'base64,' in audio_data:
                audio_data = audio_data.split('base64,')[1]
               

            # 解码 base64 数据为字节
            audio_bytes = base64.b64decode(audio_data)

            # 将字节数据转换为音频波形
            audio_io = io.BytesIO(audio_bytes)
            waveform, sample_rate = torchaudio.load(audio_io)

            # 确保波形是三维张量 [batch_size, channels, samples]
            if waveform.dim() == 1:  # 单声道一维数据
                waveform = waveform.unsqueeze(0).unsqueeze(0)  # 转换为 [1, 1, samples]
            elif waveform.dim() == 2:  # 立体声二维数据 [channels, samples]
                waveform = waveform.unsqueeze(0)  # 转换为 [1, channels, samples]

            logger.info(f"[MXChatAudioSendNode] 音频处理完成，输出张量形状: {waveform.shape}, 采样率: {sample_rate}")
            return ({"waveform": waveform, "sample_rate": sample_rate},)

        except Exception as e:
            logger.error(f"[MXChatAudioSendNode] 处理音频失败: {str(e)}")
            return ({"waveform": torch.zeros(1, 1, 1), "sample_rate": 44100},)

    def _return_default(self):
        return ({"waveform": torch.zeros(1, 1, 1), "sample_rate": 44100},)