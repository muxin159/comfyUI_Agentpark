import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
from collections import defaultdict

# 配置管理类
class ConfigManager:
    def __init__(self):
        self.config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')
        self.api_key: str = ''
        self.api_url: str = ''
        self.model: str = ''
        self.datasets: list = []
        self.selected_model: str = ''
        self.load_config()
        self.websocket_handler = None

    def load_config(self):
        """加载配置文件并设置当前配置"""
        if os.path.exists(self.config_path):
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                self.datasets = config.get('datasets', [])
                self.selected_model = config.get('selected_model', '')
                selected = next((d for d in self.datasets if d['model'] == self.selected_model), None)
                if selected:
                    self.api_key = selected.get('api_key', '')
                    self.api_url = selected.get('url', '')
                    self.model = selected.get('model', '')
                else:
                    self.api_key = ''
                    self.api_url = ''
                    self.model = ''
        else:
            self.datasets = []
            self.selected_model = ''
            self.api_key = ''
            self.api_url = ''
            self.model = ''
            print("配置文件不存在，使用默认空配置")

    def ensure_listener_registered(self):
        """确保监听器已注册"""
        if self.websocket_handler is None:
            try:
                from websocket_handler import websocket_handler
                self.websocket_handler = websocket_handler
                self.websocket_handler.register_config_listener(self.update_config)
                print("已注册 WebSocket 配置监听器")
            except ImportError as e:
                print(f"无法导入 websocket_handler: {str(e)}")

    def update_config(self, new_config):
        """更新当前配置（由 WebSocketHandler 调用）"""
        self.api_key = new_config.get('api_key', self.api_key) or ''
        self.api_url = new_config.get('url', self.api_url) or ''
        self.model = new_config.get('model', self.model) or ''
        print(f"配置已更新: model={self.model}, url={self.api_url}")

# 初始化配置管理器
config_manager = ConfigManager()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 存储对话历史的全局变量，按 clientId 分隔
conversation_history = defaultdict(list)

class ChatRequest(BaseModel):
    text: str
    mode: str = "chat"
    clientId: str = None  # 可选的 clientId，用于区分不同会话

def stream_chat_response(user_message: str, client_id: str = "default"):
    """使用 openai 库实现流式输出，支持推理过程"""
    global conversation_history
    config_manager.ensure_listener_registered()

    if not config_manager.api_url or not config_manager.api_key:
        yield json.dumps({"error": "未配置有效的 API URL 或 API Key"}) + "\n"
        return

    # 初始化 OpenAI 客户端
    client = OpenAI(
        base_url=config_manager.api_url,
        api_key=config_manager.api_key
    )

    # 管理对话历史
    history = conversation_history[client_id]
    history.append({"role": "user", "content": user_message})
    if len(history) > 10:
        history = history[-10:]
    conversation_history[client_id] = history

    print(f"发送流式请求到LLM API，用户消息: {user_message}, clientId: {client_id}, 模型: {config_manager.model}")

    try:
        # 发送带有流式输出的请求
        response = client.chat.completions.create(
            model=config_manager.model,
            messages=history,
            stream=True,
            max_tokens=4000,
            temperature=0.7,
            top_p=0.7
        )

        assistant_response = ""
        for chunk in response:
            delta = chunk.choices[0].delta
            content = delta.content if delta.content is not None else ""
            # 尝试获取推理过程字段（假设为 reasoning_content，可能需要根据 API 文档调整）
            reasoning_content = getattr(delta, 'reasoning_content', "") if hasattr(delta, 'reasoning_content') else ""

            if content:
                assistant_response += content
            if reasoning_content or content:
                output = json.dumps({
                    "text": content,
                    "reasoning_content": reasoning_content,  # 支持推理过程
                    "isUser": False,
                    "sender": "牧小新",
                    "mode": "chat",
                    "format": "markdown"
                }) + "\n"
                print(f"发送给前端的块: {output.strip()}")
                yield output

        print("流式响应结束")
        if assistant_response:
            conversation_history[client_id].append({"role": "assistant", "content": assistant_response})
            if len(conversation_history[client_id]) > 10:
                conversation_history[client_id] = conversation_history[client_id][-10:]

    except Exception as e:
        error_msg = f"流式请求失败: {str(e)}"
        print(error_msg)
        yield json.dumps({"error": error_msg}) + "\n"

@app.post("/chat")
async def chat(request: ChatRequest):
    print(f"聊天模式请求: {request.text}, clientId: {request.clientId}")
    if request.mode == "chat":
        client_id = request.clientId or "default"
        return StreamingResponse(
            stream_chat_response(request.text, client_id),
            media_type="application/x-ndjson"
        )
    else:
        raise HTTPException(status_code=400, detail="仅支持 chat 模式")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8166)