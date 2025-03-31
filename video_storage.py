import os
import time
from pathlib import Path

class VideoStorage:
    _instance = None
    
    def __init__(self):
        self.base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ComfyUI', 'web', 'videos')
        self.base_url = '/videos/'
        self._ensure_storage_dir()
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = VideoStorage()
        return cls._instance
    
    def _ensure_storage_dir(self):
        """确保视频存储目录存在"""
        os.makedirs(self.base_dir, exist_ok=True)
    
    def get_video_path(self, filename):
        """获取视频文件的完整存储路径"""
        return os.path.join(self.base_dir, filename)
    
    def clean_old_videos(self, max_age_days=7):
        """清理指定天数之前的视频文件"""
        try:
            current_time = time.time()
            for file in os.listdir(self.base_dir):
                file_path = os.path.join(self.base_dir, file)
                if os.path.isfile(file_path):
                    file_age = current_time - os.path.getmtime(file_path)
                    if file_age > (max_age_days * 24 * 60 * 60):
                        os.remove(file_path)
        except Exception as e:
            print(f'清理旧视频文件时出错: {str(e)}')