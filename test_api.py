import requests
import json

# 从配置文件中加载 API 配置
def load_config(config_file="config.json"):
    try:
        with open(config_file, "r") as f:
            config = json.load(f)
        return config["api"]
    except Exception as e:
        print(f"加载配置文件失败: {str(e)}")
        return None

# 加载配置
config = load_config()
if not config:
    print("无法加载配置，请检查配置文件。")
    exit(1)

# API 配置
api_url = config["url"]
api_key = config["key"]
model = config["model"]

# 请求头
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

# 请求体
payload = {
    "model": model,
    "messages": [{"role": "user", "content": "你好，介绍一下你自己"}],
    "stream": False,
    "max_tokens": 512,
    "temperature": 0.7,
    "top_p": 0.7,
    "top_k": 50,
    "frequency_penalty": 0.5,
    "n": 1,
    "response_format": {"type": "text"}
}

# 发送 POST 请求
try:
    response = requests.post(api_url, json=payload, headers=headers)
    print(f"状态码: {response.status_code}")
    print(f"响应内容: {response.text}")

    # 检查请求是否成功
    if response.status_code == 200:
        response_data = response.json()
        if "choices" in response_data:
            ai_response = response_data["choices"][0]["message"]["content"]
            print("AI 回复:", ai_response)
        else:
            print("API 返回数据格式异常:", response.text)
    else:
        print(f"请求失败，状态码: {response.status_code}, 错误信息: {response.text}")
except requests.exceptions.RequestException as e:
    print(f"请求出错: {str(e)}")