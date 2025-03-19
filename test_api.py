import os
import json
from openai import OpenAI
from collections import defaultdict

# 配置管理类
class ConfigManager:
    def __init__(self, config_path="config.json"):
        self.config_path = os.path.join(os.path.dirname(__file__), config_path)
        self.api_key: str = ''
        self.api_url: str = ''
        self.model: str = ''
        self.datasets: list = []
        self.selected_model: str = ''
        self.load_config()

    def load_config(self):
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
            print(f"加载配置成功: model={self.model}, url={self.api_url}")
        else:
            print("配置文件不存在")

# 对话历史
conversation_history = defaultdict(list)

def stream_chat_response(user_message: str, client_id: str = "default", config_manager=None, override_model=None):
    if not config_manager.api_url or not config_manager.api_key:
        print("未配置有效的 API URL 或 API Key")
        return

    # 初始化 OpenAI 客户端
    client = OpenAI(
        base_url=config_manager.api_url,
        api_key=config_manager.api_key
    )

    # 使用 override_model 如果提供了，否则用配置文件中的模型
    model_to_use = override_model if override_model else config_manager.model

    # 管理对话历史
    history = conversation_history[client_id]
    history.append({"role": "user", "content": user_message})
    if len(history) > 10:
        history = history[-10:]
    conversation_history[client_id] = history

    print(f"发送流式请求到LLM API，用户消息: {user_message}, clientId: {client_id}, 模型: {model_to_use}")

    try:
        # 发送带有流式输出的请求
        response = client.chat.completions.create(
            model=model_to_use,
            messages=history,
            stream=True,
            max_tokens=4000,
            temperature=0.7,
            top_p=0.7
        )

        assistant_response = ""
        for chunk in response:
            content = chunk.choices[0].delta.content
            if content is not None:  # 检查 content 是否为空
                assistant_response += content
                print(content, end='', flush=True)
        
        print("\n流式响应结束")
        if assistant_response:
            conversation_history[client_id].append({"role": "assistant", "content": assistant_response})
            if len(conversation_history[client_id]) > 10:
                conversation_history[client_id] = conversation_history[client_id][-10:]

    except Exception as e:
        print(f"流式请求失败: {str(e)}")

def test_api_call():
    config_manager = ConfigManager()
    user_message = "你好，请介绍一下自己。"
    client_id = "test_client_1"
    
    print("\n开始测试 API 调用...\n")
    
    # 测试已知的有效模型
    print("测试 deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:")
    stream_chat_response(user_message, client_id, config_manager, override_model="deepseek-ai/DeepSeek-R1-Distill-Qwen-32B")
    
    print("\n测试 deepseek-ai/DeepSeek-V3:")
    stream_chat_response(user_message, client_id, config_manager, override_model="deepseek-ai/DeepSeek-V3")
    
    # 尝试其他可能的模型名称
    print("\n测试 DeepSeek-V3:")
    stream_chat_response(user_message, client_id, config_manager, override_model="DeepSeek-V3")

if __name__ == "__main__":
    test_api_call()