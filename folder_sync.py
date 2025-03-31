import os
import shutil
import time
import threading
import msvcrt
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from .logger import MXLogger

logger = MXLogger.get_instance()

class FolderSyncHandler(FileSystemEventHandler):
    def __init__(self, source_dir, target_dir):
        self.source_dir = Path(source_dir)
        self.target_dir = Path(target_dir)

    def on_modified(self, event):
        if event.is_directory:
            return
        self._sync_file(event.src_path)

    def on_created(self, event):
        if event.is_directory:
            return
        self._sync_file(event.src_path)

    def on_deleted(self, event):
        if event.is_directory:
            return
        rel_path = os.path.relpath(event.src_path, str(self.source_dir))
        target_path = self.target_dir / rel_path
        try:
            if target_path.exists():
                target_path.unlink()
                logger.info(f"已删除文件: {rel_path}")
        except Exception as e:
            logger.error(f"删除文件失败: {str(e)}")

    def _sync_file(self, src_path):
        max_retries = 3
        retry_delay = 1.0  # 重试等待时间(秒)
        
        for attempt in range(max_retries):
            try:
                rel_path = os.path.relpath(src_path, str(self.source_dir))
                target_path = self.target_dir / rel_path
                target_path.parent.mkdir(parents=True, exist_ok=True)
                
                # 等待文件写入完成
                last_size = -1
                last_mtime = -1
                stable_count = 0
                while stable_count < 2:  # 连续2次检查文件大小和修改时间不变才认为写入完成
                    try:
                        stat = os.stat(src_path)
                        current_size = stat.st_size
                        current_mtime = stat.st_mtime
                        
                        if current_size == last_size and current_mtime == last_mtime:
                            stable_count += 1
                        else:
                            stable_count = 0
                            
                        last_size = current_size
                        last_mtime = current_mtime
                        time.sleep(0.1)  # 短暂等待后再次检查
                    except FileNotFoundError:
                        logger.error(f"源文件不存在: {rel_path}")
                        return
                    except Exception as e:
                        logger.error(f"检查文件状态失败: {str(e)}")
                        return
                
                # 使用临时文件进行复制
                temp_target = target_path.with_suffix('.tmp')
                shutil.copy2(src_path, temp_target)
                if target_path.exists():
                    target_path.unlink()
                temp_target.rename(target_path)
                
                logger.info(f"已同步文件: {rel_path}")
                break  # 成功后退出重试循环
                
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"同步文件失败，将在 {retry_delay} 秒后重试: {str(e)}")
                    time.sleep(retry_delay)
                else:
                    logger.error(f"同步文件失败，已达到最大重试次数: {str(e)}")


class FolderSync:
    def __init__(self, source_dir, target_dir):
        self.source_dir = Path(source_dir)
        self.target_dir = Path(target_dir)
        self.observer = None
        self.running = False

    def ensure_target_dir(self):
        """确保目标目录存在"""
        try:
            self.target_dir.mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            logger.error(f"创建目标目录失败: {str(e)}")
            return False

    def sync_folders(self):
        """初始同步文件夹内容"""
        try:
            if not self.source_dir.exists():
                logger.error(f"源目录不存在: {self.source_dir}")
                return False

            if not self.ensure_target_dir():
                return False

            # 复制源文件夹中的所有文件到目标文件夹
            try:
                for item in self.source_dir.iterdir():
                    if item.is_file():
                        target_item = self.target_dir / item.name
                        shutil.copy2(item, target_item)
                logger.info(f"已完成初始同步: {self.source_dir.name}")
            except Exception as e:
                logger.error(f"初始同步失败: {str(e)}")

            return True
        except Exception as e:
            logger.error(f"初始同步失败: {str(e)}")
            return False

    def start_sync(self):
        """启动同步监控"""
        if self.observer and self.observer.is_alive():
            logger.warning("同步监控已在运行中")
            return

        # 执行初始同步
        self.sync_folders()

        # 启动文件系统监控
        self.running = True
        event_handler = FolderSyncHandler(self.source_dir, self.target_dir)
        self.observer = Observer()
        self.observer.schedule(event_handler, str(self.source_dir), recursive=True)
        self.observer.start()
        logger.info("已启动实时同步监控")

    def stop_sync(self):
        """停止同步监控"""
        self.running = False
        if self.observer:
            self.observer.stop()
            self.observer.join()
        logger.info("已停止同步监控")