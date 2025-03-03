# ComfyUI_Agentpark

## 项目介绍 | Project Introduction

ComfyUI_Agentpark 是一个为 ComfyUI 开发的自定义节点扩展，提供了聊天界面和图像处理功能，使用户能够通过聊天方式与 ComfyUI 进行交互，并支持图像接收。该扩展旨在提升 ComfyUI 的用户体验，使其更加直观和易用。

ComfyUI_Agentpark is a custom node extension developed for ComfyUI, providing chat interface and image processing capabilities. It allows users to interact with ComfyUI through chat and supports sending and receiving images. This extension aims to enhance the user experience of ComfyUI, making it more intuitive and user-friendly.

## 功能特点 | Features

- **聊天界面**：提供直观的聊天界面，支持文本消息的发送和接收
  **Chat Interface**: Provides an intuitive chat interface, supporting sending and receiving text messages
- **AI 对话**：集成 AI 模型，支持智能对话功能
  **AI Conversation**: Integrates AI models, supporting intelligent conversation features
- **语音识别**：内置语音识别服务器，支持语音输入
  **Voice Recognition**: Built-in voice recognition server, supporting voice input
- **可配置 API**：支持配置不同的 AI 模型和 API 接口
  **Configurable API**: Supports configuration of different AI models and API interfaces
- **实时通信**：基于 WebSocket 的实时通信机制
  **Real-time Communication**: WebSocket-based real-time communication mechanism
- **日志记录**：完善的日志记录系统，便于调试和问题排查
  **Logging**: Comprehensive logging system for debugging and troubleshooting

## 安装说明 | Installation Guide

### 前提条件 | Prerequisites

- 已安装 ComfyUI
  Installed ComfyUI
- Python 3.8 或更高版本
  Python 3.8 or higher version

### 安装步骤 | Installation Steps

1. 克隆本仓库到 ComfyUI 的 custom_nodes 目录：
   Clone this repository to the custom_nodes directory of ComfyUI:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/你的用户名/comfyUI_Agentpark.git
```

2. 安装依赖：
   Install dependencies:

```bash
cd comfyUI_Agentpark
pip install -r requirements.txt
```

3. 重启 ComfyUI
   Restart ComfyUI

## 配置说明 | Configuration

首次运行时，扩展会自动创建 `config.json` 配置文件。您可以编辑此文件，填入您的 API 密钥和其他配置信息，也可以通过设置填写相关内容：

When running for the first time, the extension will automatically create a `config.json` configuration file. You can edit this file to fill in your API key and other configuration information, or you can fill in the relevant content through settings:

```json
{
  "api": {
    "url": "https://api.siliconflow.cn/v1/chat/completions",
    "key": "<your-api-key>",
    "model": "deepseek-ai/DeepSeek-V3"
  }
}
```

- `url`: API 服务器地址 | API server address
- `key`: 您的 API 密钥 | Your API key
- `model`: 使用的 AI 模型名称 | Name of the AI model used

## 使用方法 | Usage

### 在 ComfyUI 中使用 | Using in ComfyUI

1. 启动 ComfyUI
   Start ComfyUI
2. 在节点选择菜单中，找到 "MX Chat" 分类
   In the node selection menu, find the "MX Chat" category
3. 添加以下节点到您的工作流中：
   Add the following nodes to your workflow:
   - 发送消息 (MXChatSend)：用于发送消息到聊天界面
     Send Message (MXChatSend): Used to send messages to the chat interface
   - 接收消息 (MXChatReceive)：用于接收和显示聊天消息
     Receive Message (MXChatReceive): Used to receive and display chat messages
   - 接收图片 (MXChatImageReceive)：用于接收和显示图片
     Receive Image (MXChatImageReceive): Used to receive and display images

### 聊天功能 | Chat Features

- 在聊天界面中输入文本消息并发送
  Enter text messages in the chat interface and send them
- 支持上传图片进行处理
  Support uploading images for processing
- AI 会根据您的输入生成响应
  AI will generate responses based on your input

### 图像处理 | Image Processing

1. 将图像节点连接到 "接收图片" 节点
   Connect the image node to the "Receive Image" node
2. 处理后的图像会显示在聊天界面中
   Processed images will be displayed in the chat interface
3. 图像数据会被转换为适合 ComfyUI 处理的格式
   Image data will be converted to a format suitable for ComfyUI processing

## 服务器说明 | Server Information

扩展会自动启动两个服务器：

The extension will automatically start two servers:

- 语音识别服务器 (端口 8000)：处理语音输入
  Voice Recognition Server (Port 8000): Processes voice input
- 聊天服务器 (端口 8001)：处理聊天消息
  Chat Server (Port 8001): Processes chat messages

这些服务器会在后台运行，并由监控线程自动重启（如果意外停止）。

These servers run in the background and are automatically restarted by monitoring threads (if they stop unexpectedly).

## 故障排除 | Troubleshooting

### 常见问题 | Common Issues

1. **API 连接失败 | API Connection Failure**
   - 检查您的 API 密钥是否正确
     Check if your API key is correct
   - 确认网络连接是否正常
     Confirm if the network connection is normal
   - 验证 API URL 是否有效
     Verify if the API URL is valid

2. **服务器启动失败 | Server Startup Failure**
   - 检查端口 8000 和 8001 是否被占用
     Check if ports 8000 and 8001 are occupied
   - 查看日志文件获取详细错误信息
     View log files for detailed error information

### 日志位置 | Log Location

日志文件存储在 `logs` 目录中，可以查看这些日志以获取详细的错误信息和调试帮助。

Log files are stored in the `logs` directory. You can view these logs to get detailed error information and debugging help.

## 贡献指南 | Contribution Guidelines

欢迎贡献代码、报告问题或提出改进建议。请遵循以下步骤：

Contributions of code, issue reports, or improvement suggestions are welcome. Please follow these steps:

1. Fork 本仓库
   Fork this repository
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
   Create your feature branch (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'Add some amazing feature'`)
   Commit your changes (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
   Push to the branch (`git push origin feature/amazing-feature`)
5. 开启一个 Pull Request
   Open a Pull Request

## 许可证 | License

本项目采用 MIT 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## 联系方式 | Contact Information

如有任何问题或建议，请通过以下方式联系我们：

If you have any questions or suggestions, please contact us through the following methods:

- B站：牧新学长
  Bilibili: 牧新学长
- 抖音：牧新学长
  TikTok: 牧新学长

---

感谢使用 ComfyUI_Agentpark！

Thank you for using ComfyUI_Agentpark!