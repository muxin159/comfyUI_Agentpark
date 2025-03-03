import json
import os
import requests
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
                    self.register_handlers()  # 注册处理器
                    self.initialized = True
    
    def load_config(self):
        """加载配置文件，若不存在则从模板创建，并验证配置有效性"""
        try:
            config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')
            template_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.template.json')
            if not os.path.exists(config_path) and os.path.exists(template_path):
                import shutil
                shutil.copy2(template_path, config_path)
                logger.info("已创建配置文件 config.json，请在其中填写您的配置信息")
            
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    self.api_url = config['api'].get('url', 'https://api.siliconflow.cn/v1/chat/completions')
                    self.api_key = config['api'].get('key', '<token>')
                    self.model = config['api'].get('model', 'deepseek-ai/DeepSeek-V3')
                
                if self.api_key == '<token>' or not self.api_key:
                    logger.warning("API 密钥未配置，使用默认值可能导致请求失败")
                if not self.api_url.startswith('http'):
                    logger.warning(f"API URL 无效: {self.api_url}，请检查配置文件")
            else:
                logger.warning("找不到配置文件 config.json，使用默认配置")
                self.api_url = "https://api.siliconflow.cn/v1/chat/completions"
                self.api_key = "<token>"
                self.model = "deepseek-ai/DeepSeek-V3"
        except Exception as e:
            logger.error(f"加载配置文件时出错: {str(e)}")
            logger.error(traceback.format_exc())
            self.api_url = "https://api.siliconflow.cn/v1/chat/completions"
            self.api_key = "<token>"
            self.model = "deepseek-ai/DeepSeek-V3"
    
    def register_handlers(self):
        """注册 WebSocket 消息处理器，统一处理所有消息"""
        try:
            logger.info("[WebSocketHandler] 开始注册 WebSocket 消息处理器")

            async def custom_websocket_handler(request):
                ws = web.WebSocketResponse()
                await ws.prepare(request)
                sid = request.rel_url.query.get('clientId', '') or str(uuid.uuid4().hex)
                PromptServer.instance.sockets[sid] = ws

                try:
                    await PromptServer.instance.send("status", {"status": PromptServer.instance.get_queue_info(), 'sid': sid}, sid)
                    if PromptServer.instance.client_id == sid and PromptServer.instance.last_node_id is not None:
                        await PromptServer.instance.send("executing", {"node": PromptServer.instance.last_node_id}, sid)

                    async for msg in ws:
                        if msg.type == WSMsgType.TEXT:
                            try:
                                data = json.loads(msg.data)
                                message_type = data.get('type')
                                logger.debug(f"[WebSocketHandler] 接收到消息类型: {message_type}")
                                
                                if message_type == "mx-chat-message":
                                    await self.handle_chat_message(data, sid)
                                elif message_type == "update_config":
                                    await self.handle_config_update(data, sid)
                                elif message_type == "imageData":
                                    await self.handle_imageData(data, sid)
                                elif message_type == "log":
                                    logger.info(f"[WebSocketHandler] 前端日志: {data.get('message', 'No message')}")
                            except Exception as e:
                                logger.error(f"[WebSocketHandler] 处理消息失败: {str(e)}")
                                logger.error(traceback.format_exc())
                        elif msg.type == WSMsgType.ERROR:
                            logger.warning(f"[WebSocketHandler] WebSocket 连接关闭，异常: {ws.exception()}")
                finally:
                    PromptServer.instance.sockets.pop(sid, None)
                return ws

            PromptServer.instance.routes.get('/ws')(custom_websocket_handler)
            logger.info("[WebSocketHandler] WebSocket 消息处理器注册完成")
        except Exception as e:
            logger.error(f"[WebSocketHandler] 注册 WebSocket 消息处理器失败: {str(e)}")
            logger.error(traceback.format_exc())
            raise e
    
    async def _process_image_data(self, imageData, text, sid):
        """统一处理图片数据的内部方法"""
        if not imageData:
            logger.error("[WebSocketHandler] 图片数据为空")
            return {
                "success": False,
                "error": "空图片数据",
                "processed_data": None
            }
        
        # 处理 base64 前缀
        if 'base64,' in imageData:
            imageData = imageData.split('base64,')[1]
            logger.info("[WebSocketHandler] 已去除 base64 前缀")
        
        with self._lock:
            result = self.image_node.handle_imageData({
                "imageData": imageData,
                "text": text,
                "mode": "agent"
            })
        
        if not result.get('success'):
            error_msg = result.get('error', '未知错误')
            logger.error(f"[WebSocketHandler] 图片处理失败: {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "processed_data": None
            }
        
        logger.info("[WebSocketHandler] 图片数据处理成功")
        # 确保只返回处理后的文件名，不使用原始imageData作为默认值
        if 'processed_data' not in result:
            logger.error("[WebSocketHandler] 图片处理成功但未返回processed_data字段")
            return {
                "success": False,
                "error": "处理成功但未返回文件名",
                "processed_data": None
            }
        
        return {
            "success": True,
            "error": None,
            "processed_data": result['processed_data']
        }
    
    async def handle_chat_message(self, data, sid):
        logger.info("[WebSocketHandler] 开始处理聊天消息")
        try:
            user_message = data.get('text', '')
            mode = data.get('mode', 'agent')
            imageData = data.get('imageData', '')

            logger.info(f"[WebSocketHandler] 处理模式: {mode}, 用户消息: {user_message}")
            logger.debug(f"[WebSocketHandler] 图片数据长度: {len(imageData) if imageData else 0}")

            if mode == 'chat':
                ai_response = self.generate_response(user_message)
                await PromptServer.instance.send("mx-chat-message", {
                    "text": ai_response,
                    "isUser": False,
                    "sender": "牧小新",
                    "mode": "chat"
                }, sid)
                logger.debug("[WebSocketHandler] 已成功推送 chat 模式消息到前端")
            elif mode == 'agent':
                # 发送用户消息到前端
                message_data = {
                    "text": user_message,
                    "isUser": True,
                    "sender": "comfy大魔导师",
                    "mode": "agent"
                }
                
                # 处理图片数据
                if imageData:
                    logger.info(f"[WebSocketHandler] 收到图片数据，长度: {len(imageData)}")
                    result = await self._process_image_data(imageData, user_message, sid)
                    
                    if not result['success']:
                        await PromptServer.instance.send("mx-chat-message", {
                            "text": f"图片处理失败: {result['error']}",
                            "isUser": False,
                            "sender": "牧小新",
                            "mode": "agent"
                        }, sid)
                        return
                    
                    message_data["imageData"] = result['processed_data']
                else:
                    logger.warning("[WebSocketHandler] 未收到图片数据")
                
                await PromptServer.instance.send("mx-chat-message", message_data, sid)
                logger.debug("[WebSocketHandler] 已成功推送 agent 模式消息到前端")
        except Exception as e:
            error_msg = f"处理聊天消息时出错: {str(e)}"
            logger.error(f"[WebSocketHandler] {error_msg}")
            logger.error(traceback.format_exc())
            await PromptServer.instance.send("mx-chat-message", {
                "text": "处理消息失败，请稍后再试。",
                "isUser": False,
                "sender": "牧小新"
            }, sid)
    
    async def handle_config_update(self, data, sid):
        logger.debug("[WebSocketHandler] 处理配置更新")
        try:
            config = data.get('config', {})
            if 'model_name' in config:
                self.model = config['model_name']
            if 'url' in config:
                self.api_url = config['url']
            if 'api_key' in config:
                self.api_key = config['api_key']
            
            config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    current_config = json.load(f)
                current_config['api']['key'] = self.api_key
                current_config['api']['url'] = self.api_url
                current_config['api']['model'] = self.model
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(current_config, f, indent=4, ensure_ascii=False)
                await PromptServer.instance.send("mx-chat-message", {
                    "text": "配置已更新",
                    "isUser": False,
                    "sender": "牧小新"
                }, sid)
            else:
                logger.warning("[WebSocketHandler] config.json 不存在，无法保存配置")
                await PromptServer.instance.send("mx-chat-message", {
                    "text": "配置文件不存在，更新失败",
                    "isUser": False,
                    "sender": "牧小新"
                }, sid)
        except Exception as e:
            error_msg = f"更新配置时出错: {str(e)}"
            logger.error(f"[WebSocketHandler] {error_msg}")
            logger.error(traceback.format_exc())
            await PromptServer.instance.send("mx-chat-message", {
                "text": f"更新配置失败: {str(e)}",
                "isUser": False,
                "sender": "牧小新"
            }, sid)
    
    async def handle_imageData(self, data, sid):
        logger.info("[WebSocketHandler] 开始处理图片数据")
        try:
            imageData = data.get('imageData', '')
            text = data.get('text', '用户上传了一张图片')
            
            result = await self._process_image_data(imageData, text, sid)
            
            if result['success']:
                await PromptServer.instance.send("imageData_ack", {"success": True}, sid)
                await PromptServer.instance.send("mx-chat-message", {
                    "text": text,
                    "isUser": True,
                    "imageData": result['processed_data'],
                    "mode": "agent"
                }, sid)
            else:
                await PromptServer.instance.send("imageData_ack", {"success": False, "error": result['error']}, sid)
                await PromptServer.instance.send("mx-chat-message", {
                    "text": f"图片处理失败: {result['error']}",
                    "isUser": False,
                    "sender": "牧小新",
                    "mode": "agent"
                }, sid)
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[WebSocketHandler] 处理图片数据时出错: {error_msg}")
            logger.error(traceback.format_exc())
            await PromptServer.instance.send("imageData_ack", {"success": False, "error": error_msg}, sid)
            await PromptServer.instance.send("mx-chat-message", {
                "text": f"处理图片数据时出错: {error_msg}",
                "isUser": False,
                "sender": "牧小新",
                "mode": "agent"
            }, sid)
    
    def generate_response(self, user_message):
        logger.debug(f"[WebSocketHandler] 为用户消息生成响应: {user_message}")
        try:
            payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": user_message}],
                "stream": False,
                "max_tokens": 512,
                "stop": ["null"],
                "temperature": 0.7,
                "top_p": 0.7,
                "top_k": 50,
                "frequency_penalty": 0.5,
                "n": 1,
                "response_format": {"type": "text"}
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            logger.debug(f"[WebSocketHandler] API 请求: URL={self.api_url}")
            response = requests.post(self.api_url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            response_data = response.json()
            logger.debug(f"[WebSocketHandler] API 响应状态码: {response.status_code}")
            return response_data["choices"][0]["message"]["content"]
        except requests.exceptions.Timeout:
            logger.error("[WebSocketHandler] API 请求超时")
            return "API 请求超时，请检查网络连接或稍后重试。"
        except requests.exceptions.ConnectionError:
            logger.error("[WebSocketHandler] API 连接错误")
            return "无法连接到 API 服务器，请检查网络连接或 API 地址是否正确。"
        except requests.exceptions.HTTPError as e:
            logger.error(f"[WebSocketHandler] API 请求失败: {str(e)}")
            if response.status_code == 401:
                return "API 密钥验证失败，请检查配置文件中的 API 密钥是否正确。"
            elif response.status_code == 404:
                return "API 接口地址不正确，请检查配置文件中的 URL 设置。"
            elif response.status_code >= 500:
                return "API 服务器内部错误，请稍后重试。"
            return f"API 请求失败: {str(e)}"
        except Exception as e:
            logger.error(f"[WebSocketHandler] 生成回复时出错: {str(e)}")
            logger.error(traceback.format_exc())
            return "抱歉，我现在无法正常回复，请稍后再试。"

websocket_handler = WebSocketHandler()