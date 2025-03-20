import logging
import os
from datetime import datetime

class MXLogger:
    _instance = None
    _logger = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        if MXLogger._logger is not None:
            raise Exception("MXLogger 是单例模式，请使用 get_instance() 方法获取实例")

        # 创建logger对象
        self._logger = logging.getLogger('MXChat')
        self._logger.setLevel(logging.DEBUG)

        # 创建日志目录
        log_dir = os.path.join(os.path.dirname(__file__), 'logs')
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)

        # 设置日志格式
        formatter = logging.Formatter(
            '[%(asctime)s] %(levelname)s [%(name)s.%(funcName)s:%(lineno)d] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )

        # 创建并配置控制台处理器
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(formatter)

        # 创建并配置文件处理器
        log_file = os.path.join(log_dir, f'mxchat_{datetime.now().strftime("%Y%m%d")}.log')
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)

        # 添加处理器到logger
        self._logger.addHandler(console_handler)
        self._logger.addHandler(file_handler)

    def debug(self, message):
        self._logger.debug(message)

    def info(self, message):
        self._logger.info(message)

    def warning(self, message):
        self._logger.warning(message)

    def error(self, message):
        self._logger.error(message)

    def critical(self, message):
        self._logger.critical(message)