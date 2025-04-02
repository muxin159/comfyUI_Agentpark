import os
import json
import socket
import subprocess
import time
import sys
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
from collections import defaultdict


# 配置管理类
class ConfigManager:
    def __init__(self):
        self.config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        self.api_key: str = ''
        self.api_url: str = ''
        self.model: str = ''
        self.datasets: list = []
        self.selected_model: str = ''
        self.load_config()

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



    def update_config(self, new_config=None):
        """更新当前配置并保存到文件"""
        try:
            if new_config and isinstance(new_config, dict):
                # 从 new_config 中提取配置字段
                if 'selected_model' in new_config:
                    self.selected_model = new_config['selected_model']
                if 'datasets' in new_config:
                    self.datasets = new_config['datasets']
                
                # 根据 selected_model 更新相关属性
                selected = next((d for d in self.datasets if d['model'] == self.selected_model), None)
                if selected:
                    self.api_key = selected.get('api_key', '')
                    self.api_url = selected.get('url', '')
                    self.model = selected.get('model', '')
                else:
                    # 如果没有找到匹配的模型，清空相关字段
                    self.api_key = ''
                    self.api_url = ''
                    self.model = ''
                
                # 保存配置到文件
                config_to_save = {
                    "datasets": self.datasets,
                    "selected_model": self.selected_model
                }
                with open(self.config_path, 'w', encoding='utf-8') as f:
                    json.dump(config_to_save, f, indent=4, ensure_ascii=False)
                
                # 重新加载配置以确保一致性
                self.load_config()
                print(f"配置已更新并重新加载: model={self.model}, url={self.api_url}")
                return True
            return False
        except Exception as e:
            print(f"更新配置时发生错误: {str(e)}")
            return False

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

class ConfigUpdateRequest(BaseModel):
    datasets: list
    selected_model: str

@app.post("/update_config")
async def update_config(request: ConfigUpdateRequest):
    try:
        # 验证请求数据
        if not isinstance(request.datasets, list):
            raise HTTPException(status_code=400, detail="datasets必须是一个数组")
        if not isinstance(request.selected_model, str):
            raise HTTPException(status_code=400, detail="selected_model必须是一个字符串")
        
        # 更新配置
        success = config_manager.update_config({
            "datasets": request.datasets,
            "selected_model": request.selected_model
        })
        
        if success:
            return {"status": "success", "message": "配置更新成功", "config": {
                "datasets": config_manager.datasets,
                "selected_model": config_manager.selected_model
            }}
        else:
            raise HTTPException(status_code=500, detail="配置更新失败")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def stream_chat_response(user_message: str, client_id: str = "default"):
    """使用 openai 库实现流式输出，支持推理过程"""
    global conversation_history

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

def check_port_in_use(port):
    """检查指定端口是否被占用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def get_process_using_port(port):
    """获取占用指定端口的进程PID"""
    try:
        # 使用netstat命令查找占用端口的进程
        cmd = f'netstat -ano | findstr :{port}'
        result = subprocess.check_output(cmd, shell=True).decode('utf-8')
        if result:
            # 提取PID
            for line in result.split('\n'):
                if f':{port}' in line and 'LISTENING' in line:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        return int(parts[-1])
        return None
    except Exception as e:
        print(f"获取占用端口{port}的进程失败: {str(e)}")
        return None

def kill_process(pid):
    """强制终止指定PID的进程"""
    try:
        subprocess.run(['taskkill', '/F', '/PID', str(pid)], check=True)
        print(f"成功终止进程 PID: {pid}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"终止进程失败 PID: {pid}, 错误: {str(e)}")
        return False

def check_and_free_ports(ports=[8166]):
    """检查并释放指定的端口，只检查聊天服务需要的端口"""
    for port in ports:
        if check_port_in_use(port):
            print(f"端口 {port} 已被占用，尝试释放...")
            pid = get_process_using_port(port)
            if pid:
                print(f"端口 {port} 被进程 PID: {pid} 占用")
                if kill_process(pid):
                    print(f"端口 {port} 已成功释放")
                    time.sleep(1)  # 等待端口完全释放
                else:
                    print(f"无法释放端口 {port}，服务可能无法正常启动")
            else:
                print(f"无法找到占用端口 {port} 的进程")
        else:
            print(f"端口 {port} 未被占用，可以使用")

if __name__ == "__main__":
    # 在启动服务器前检查并释放端口
    print("正在检查端口占用情况...")
    check_and_free_ports()
    
    import uvicorn
    print("正在启动聊天服务器...")
    uvicorn.run(app, host="0.0.0.0", port=8166)