import os
import json
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# 配置重试策略
retry_strategy = Retry(
    total=3,  # 最大重试次数
    backoff_factor=1,  # 重试间隔
    status_forcelist=[429, 500, 502, 503, 504]  # 需要重试的HTTP状态码
)

# 创建带有重试机制的会话
session = requests.Session()
session.mount("https://", HTTPAdapter(max_retries=retry_strategy))

# 读取配置文件
config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')
with open(config_path, 'r', encoding='utf-8') as f:
    config = json.load(f)

# 获取API配置
api_config = config.get('api', {})
api_key = api_config.get('key', '')
api_url = api_config.get('url', '')
model = api_config.get('model', '')

app = FastAPI()

# 配置CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    text: str
    mode: str = "chat"

@app.post("/chat")
async def chat(request: ChatRequest):
    print(f"聊天模式请求: {request.text}")
    try:
        # 准备请求数据
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": request.text}],
            "stream": False,
            "max_tokens": 1000,
            "temperature": 0.7,
            "top_p": 0.7,
            "top_k": 50,
            "frequency_penalty": 0.6,
            "n": 1,
            "response_format": {"type": "text"}
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        print(f"发送请求到LLM API，用户消息: {request.text}")
        print(f"请求参数: {json.dumps(payload, ensure_ascii=False)}")

        # 使用带有重试机制的会话发送请求
        response = session.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=(5, 15)  # 连接超时5秒，读取超时15秒
        )
        response_data = response.json()

        print(f"API响应数据: {json.dumps(response_data, ensure_ascii=False)}")

        if response.status_code == 200 and "choices" in response_data:
            ai_response = response_data["choices"][0]["message"]["content"]
            print(f"成功获取AI响应: {ai_response}")
            return JSONResponse(
                content={
                    "text": ai_response,
                    "isUser": False,
                    "sender": "牧小新",
                    "mode": "chat",
                    "format": "markdown"
                }
            )
        else:
            error_msg = "API请求失败"
            print(f"{error_msg}: {response_data}")
            raise HTTPException(status_code=500, detail=error_msg)

    except requests.exceptions.ConnectTimeout:
        error_msg = "连接LLM服务器超时，请检查网络连接"
        print(error_msg)
        raise HTTPException(status_code=504, detail=error_msg)

    except requests.exceptions.ReadTimeout:
        error_msg = "等待LLM响应超时，请稍后重试"
        print(error_msg)
        raise HTTPException(status_code=504, detail=error_msg)

    except requests.exceptions.ConnectionError:
        error_msg = "无法连接到LLM服务器，请检查网络连接"
        print(error_msg)
        raise HTTPException(status_code=503, detail=error_msg)

    except Exception as e:
        error_msg = f"处理聊天请求时出错: {str(e)}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)