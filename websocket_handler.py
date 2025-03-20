import json
import os
import traceback
import uuid
from server import PromptServer
from aiohttp import web, WSMsgType

from .logger import MXLogger

logger = MXLogger.get_instance()

import threading

class WebSocketHandler:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(WebSocketHandler, cls).__new__(cls)
                    cls._instance.initialized = False
        return cls._instance
    
    def __init__(self):
        if not self.initialized:
            with self._lock:
                if not self.initialized:
                    self.load_config()
                    self._config_listeners = []
                    self.register_handlers()
                    self.initialized = True
    
    def load_config(self):
        config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        template_path = os.path.join(os.path.dirname(__file__), 'config.template.json')
        
        if not os.path.exists(config_path) and os.path.exists(template_path):
            import shutil
            shutil.copy2(template_path, config_path)
            logger.info("已创建配置文件 config.json，请在其中填写您的配置信息")

        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if not content:
                        logger.warning("config.json 文件为空，使用默认配置")
                        self.datasets = []
                        self.selected_model = ''
                    else:
                        config = json.loads(content)
                        self.datasets = config.get('datasets', [])
                        self.selected_model = config.get('selected_model', '')
                        if self.datasets and not self.selected_model:
                            self.selected_model = self.datasets[0]['model']
            except json.JSONDecodeError as e:
                logger.error(f"解析 config.json 失败: {str(e)}，使用默认配置")
                self.datasets = []
                self.selected_model = ''
            except Exception as e:
                logger.error(f"读取 config.json 失败: {str(e)}，使用默认配置")
                self.datasets = []
                self.selected_model = ''
        else:
            logger.warning("找不到配置文件 config.json，使用默认配置")
            self.datasets = []
            self.selected_model = ''

    def register_config_listener(self, listener):
        if callable(listener) and listener not in self._config_listeners:
            self._config_listeners.append(listener)
            logger.info("已注册配置更新监听器")

    async def handle_config_update(self, data, sid):
        logger.debug("[WebSocketHandler] 处理配置更新")
        try:
            config = data.get('config', {})
            logger.info(f"收到前端配置数据: {json.dumps(config, ensure_ascii=False)}")
            new_config = {
                "datasets": config.get('datasets', self.datasets),
                "selected_model": config.get('selected_model', self.selected_model)
            }
            self.datasets = new_config['datasets']
            self.selected_model = new_config['selected_model']

            config_path = os.path.join(os.path.dirname(__file__), 'config.json')
            logger.info(f"尝试写入配置文件: {config_path}")
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(new_config, f, indent=4, ensure_ascii=False)
            logger.info("[WebSocketHandler] 配置已保存到 config.json")

            selected_config = next((d for d in self.datasets if d['model'] == self.selected_model), None)
            for listener in self._config_listeners:
                listener(selected_config if selected_config else {})
            
            # 确保发送明确的成功状态和完整的配置信息
            await PromptServer.instance.send_json(
                event="config_updated",
                data={"success": True, "config": new_config},
                sid=sid  # 使用 sid 而不是 client_id
            )
            logger.info(f"已发送 config_updated 响应给 sid: {sid}")
            return True
        except Exception as e:
            logger.error(f"[WebSocketHandler] 更新配置失败: {str(e)}")
            logger.error(traceback.format_exc())
            await PromptServer.instance.send_json(
                event="config_updated",
                data={"success": False, "error": str(e)},
                sid=sid  # 使用 sid 而不是 client_id
            )
            logger.info(f"已发送错误响应给 sid: {sid}")
            return False

    async def handle_select_config(self, data, sid):
        logger.debug("[WebSocketHandler] 处理配置选择")
        try:
            config = data.get('config', {})
            selected_model = config.get('selected_model')
            if selected_model and any(d['model'] == selected_model for d in self.datasets):
                self.selected_model = selected_model
                config_path = os.path.join(os.path.dirname(__file__), 'config.json')
                with open(config_path, 'r', encoding='utf-8') as f:
                    current_config = json.load(f)
                current_config['selected_model'] = selected_model
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(current_config, f, indent=4, ensure_ascii=False)
                selected_config = next((d for d in self.datasets if d['model'] == self.selected_model), None)
                for listener in self._config_listeners:
                    listener(selected_config if selected_config else {})
                logger.info(f"[WebSocketHandler] 已应用模型: {selected_model}")
                # 确保发送明确的成功状态和完整的配置信息
                await PromptServer.instance.send_json(
                    event="config_updated",
                    data={"success": True, "selected_model": selected_model, "config": {"datasets": self.datasets, "selected_model": selected_model}},
                    sid=sid  # 使用 sid 而不是 client_id
                )
                logger.info(f"已发送 config_updated 响应给 sid: {sid}，包含完整配置信息")
            else:
                logger.warning(f"[WebSocketHandler] 无效的模型选择: {selected_model}")
                await PromptServer.instance.send_json(
                    event="config_updated",
                    data={"success": False, "error": "无效的模型选择"},
                    sid=sid  # 使用 sid 而不是 client_id
                )
                logger.info(f"已发送错误响应给 sid: {sid}")
        except Exception as e:
            logger.error(f"[WebSocketHandler] 选择配置失败: {str(e)}")
            logger.error(traceback.format_exc())
            await PromptServer.instance.send_json(
                event="config_updated",
                data={"success": False, "error": str(e)},
                sid=sid  # 使用 sid 而不是 client_id
            )
            logger.info(f"已发送错误响应给 sid: {sid}")

    def register_handlers(self):
        PromptServer.instance.routes._items = [r for r in PromptServer.instance.routes._items if r.path != '/ws']

        async def custom_websocket_handler(request):
            ws = web.WebSocketResponse()
            await ws.prepare(request)
            sid = request.rel_url.query.get('clientId', '') or str(uuid.uuid4().hex)
            PromptServer.instance.sockets[sid] = ws
            logger.info(f"WebSocket 连接建立，sid: {sid}")

            try:
                await PromptServer.instance.send_json(
                    event="status",
                    data={"status": PromptServer.instance.get_queue_info(), "sid": sid},
                    sid=sid
                )
                if PromptServer.instance.client_id == sid and PromptServer.instance.last_node_id is not None:
                    await PromptServer.instance.send_json(
                        event="executing",
                        data={"node": PromptServer.instance.last_node_id},
                        sid=sid
                    )
                
                # 发送当前配置信息到前端
                current_config = {
                    "datasets": self.datasets,
                    "selected_model": self.selected_model
                }
                logger.info(f"发送当前配置信息到前端: {json.dumps(current_config, ensure_ascii=False)}")
                await PromptServer.instance.send_json(
                    event="config_updated",
                    data={"success": True, "config": current_config},
                    sid=sid
                )

                async for msg in ws:
                    if msg.type == WSMsgType.TEXT:
                        try:
                            data = json.loads(msg.data)
                            logger.info(f"收到前端消息: {json.dumps(data, ensure_ascii=False)}")
                            message_type = data.get('type')
                            logger.debug(f"[WebSocketHandler] 接收到消息类型: {message_type}")
                            
                            if message_type == "update_config":
                                await self.handle_config_update(data, sid)
                            elif message_type == "select_config":
                                await self.handle_select_config(data, sid)
                            elif message_type == "get_initial_config":
                                # 处理获取初始配置请求
                                logger.info(f"[WebSocketHandler] 处理获取初始配置请求")
                                current_config = {
                                    "datasets": self.datasets,
                                    "selected_model": self.selected_model
                                }
                                logger.info(f"发送初始配置信息到前端: {json.dumps(current_config, ensure_ascii=False)}")
                                await PromptServer.instance.send_json(
                                    event="config_updated",
                                    data={"success": True, "config": current_config},
                                    sid=sid
                                )
                            elif message_type == "mode_change":
                                mode = data.get('mode', '未知')
                                logger.info(f"[WebSocketHandler] 模式切换到: {mode}")
                                await PromptServer.instance.send_json(
                                    event="mode_changed",
                                    data={"mode": mode},
                                    sid=sid
                                )
                            elif message_type == "log":
                                logger.info(f"[WebSocketHandler] 前端日志: {data.get('message', 'No message')}")
                            else:
                                logger.warning(f"未处理的消息类型: {message_type}")
                        except Exception as e:
                            logger.error(f"[WebSocketHandler] 处理消息失败: {str(e)}")
                            logger.error(traceback.format_exc())
                    elif msg.type == WSMsgType.ERROR:
                        logger.warning(f"WebSocket 连接关闭，异常: {ws.exception()}")
            finally:
                PromptServer.instance.sockets.pop(sid, None)
            return ws

        PromptServer.instance.routes.get('/ws')(custom_websocket_handler)
        logger.info("[WebSocketHandler] WebSocket 消息处理器注册完成")

websocket_handler = WebSocketHandler()