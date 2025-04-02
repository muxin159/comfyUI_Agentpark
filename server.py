import os
import tempfile
import socket
import subprocess
import time
import sys
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import whisper
import logging
from opencc import OpenCC

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 加载Whisper模型和OpenCC转换器
try:
    model = whisper.load_model("small")
    converter = OpenCC('t2s')  # 繁体到简体转换
    logger.info("Whisper模型和OpenCC转换器加载成功")
except Exception as e:
    logger.error(f"加载模型失败: {str(e)}")
    model = None
    converter = None

@app.post("/whisper")
async def transcribe_audio(audio: UploadFile = File(...)):
    if not model:
        raise HTTPException(status_code=500, detail="Whisper模型未正确加载")

    if not audio.filename.lower().endswith(('.wav', '.mp3', '.ogg', '.m4a')):
        raise HTTPException(status_code=400, detail="不支持的音频格式")

    try:
        logger.info(f"接收到音频文件: {audio.filename}")
        # 创建临时文件保存上传的音频
        temp_audio = None
        try:
            temp_audio = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
            content = await audio.read()
            temp_audio.write(content)
            temp_audio.flush()
            temp_audio.close()  # 确保文件被关闭
            logger.info(f"临时文件已创建: {temp_audio.name}")

            # 使用Whisper模型进行语音识别
            result = model.transcribe(temp_audio.name)
            text = result["text"].strip()
            # 将繁体转换为简体
            if converter:
                text = converter.convert(text)
            logger.info(f"语音识别结果(简体): {text}")
        finally:
            # 确保在任何情况下都尝试删除临时文件
            if temp_audio and os.path.exists(temp_audio.name):
                try:
                    os.unlink(temp_audio.name)
                    logger.info("临时文件已删除")
                except Exception as e:
                    logger.error(f"删除临时文件失败: {str(e)}")
                    # 继续执行，不影响返回结果

            return JSONResponse(
                content={"text": text},
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "*"
                }
            )
    except Exception as e:
        logger.error(f"处理音频文件时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.options("/whisper")
async def whisper_options():
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        }
    )

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
        logger.error(f"获取占用端口{port}的进程失败: {str(e)}")
        return None

def kill_process(pid):
    """强制终止指定PID的进程"""
    try:
        subprocess.run(['taskkill', '/F', '/PID', str(pid)], check=True)
        logger.info(f"成功终止进程 PID: {pid}")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"终止进程失败 PID: {pid}, 错误: {str(e)}")
        return False

def check_and_free_ports(ports=[8165]):
    """检查并释放指定的端口，只检查语音识别服务需要的端口"""
    for port in ports:
        if check_port_in_use(port):
            logger.info(f"端口 {port} 已被占用，尝试释放...")
            pid = get_process_using_port(port)
            if pid:
                logger.info(f"端口 {port} 被进程 PID: {pid} 占用")
                if kill_process(pid):
                    logger.info(f"端口 {port} 已成功释放")
                    time.sleep(1)  # 等待端口完全释放
                else:
                    logger.warning(f"无法释放端口 {port}，服务可能无法正常启动")
            else:
                logger.warning(f"无法找到占用端口 {port} 的进程")
        else:
            logger.info(f"端口 {port} 未被占用，可以使用")

if __name__ == "__main__":
    # 在启动服务器前检查并释放端口
    logger.info("正在检查端口占用情况...")
    check_and_free_ports()
    
    import uvicorn
    logger.info("正在启动Whisper服务器...")
    uvicorn.run(app, host="0.0.0.0", port=8165)
