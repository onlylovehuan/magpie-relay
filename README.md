# Magpie Relay for VS Code Copilot

一个将 Magpie 网关服务集成到 VS Code Copilot Chat 的插件。

## 功能特性

- ✅ **动态模型发现** - 自动从 Magpie 网关获取可用模型列表
- ✅ **多模态支持** - 支持带图片输入的模型（自动检测）
- ✅ **工具调用** - 支持 Function Calling
- ✅ **推理模型** - 支持思考/推理能力（自动检测）
- ✅ **流式响应** - 实时流式输出
- ✅ **安全存储** - API Key 使用 OS 密钥链存储
- ✅ **工具调用回放** - 完整回传工具调用和工具结果
- ✅ **Usage 回传** - 将网关 token 使用数据交给 Copilot 校准上下文
- ✅ **长思考保护** - 默认不限制输出 token，辅助请求不主动加深度思考

## 安装

1. 克隆本仓库
2. 安装依赖：`npm install`
3. 编译：`npm run compile`
4. 打包：`npm run package`
5. 安装生成的 `.vsix` 文件

## 配置

### 1. 设置 Magpie 网关地址

打开命令面板（`Ctrl+Shift+P`），搜索 `Magpie: 设置网关地址`

默认地址：`http://127.0.0.1:3425`

如果 Magpie 运行在其他机器或端口，请修改为实际地址。

### 2. 设置网关密钥

打开命令面板，搜索 `Magpie: 设置网关密钥`

输入你在 Magpie 网关设置中创建的 Gateway Key。

### 3. （可选）设置上游 API Key

如果某些模型需要直接认证，可以设置上游 API Key：
命令面板搜索 `Magpie: 设置上游 API Key`

## 使用

### 刷新模型列表

配置完网关后，执行 `Magpie: 刷新模型列表` 命令获取可用模型。

### 开始对话

1. 打开 VS Code Copilot Chat（`Ctrl+Shift+I`）
2. 在模型选择器中可以看到 "Magpie Relay" 提供商
3. 选择你想要的模型
4. 开始对话

### 可用命令

| 命令 | 说明 |
|------|------|
| `Magpie: 设置网关地址` | 配置 Magpie 网关 URL |
| `Magpie: 设置网关密钥` | 配置网关认证密钥 |
| `Magpie: 设置上游 API Key` | 配置上游提供商密钥 |
| `Magpie: 刷新模型列表` | 重新获取模型列表 |
| `Magpie: 打开设置` | 打开插件设置页面 |
| `Magpie: 清除所有配置` | 清除所有已保存的配置 |

## 模型能力显示

插件会根据 Magpie API 返回的信息自动显示模型能力：

- 🌅 **Vision** - 带图像图标表示支持图片输入
- 🔧 **Tool Calling** - 支持工具调用
- 🧠 **Reasoning** - 支持思考/推理

## Magpie 网关安装

如果你还没有安装 Magpie，请参考 [Magpie 官方文档](https://github.com/yetone/magpie)。

快速启动：

```bash
# 使用 Docker
docker run -p 3425:3425 ghcr.io/yetone/magpie

# 或使用 pip
pip install magpie
magpie serve
```

## 调试

在设置中开启 `magpie-relay.debugMode` 可以查看详细的请求日志。

## 文件结构

```
src/
├── extension.ts            # 入口文件
├── auth.ts                 # 认证管理，优先使用 SecretStorage
├── config.ts               # 配置读取
├── errors.ts               # 用户可见错误和诊断信息
├── logger.ts               # OutputChannel 日志
├── types.ts                # Magpie / OpenAI / VS Code 类型
├── provider/
│   ├── index.ts            # 主 Provider 类
│   ├── catalog.ts          # 模型目录和能力归一化
│   ├── client.ts           # Magpie HTTP/SSE 客户端
│   ├── convert.ts          # 消息、图片、工具调用和结果转换
│   ├── request.ts          # 请求准备和 reasoning effort 校验
│   ├── stream.ts           # 响应桥接到 VS Code progress
│   └── tokens.ts           # Token 和 usage 估算
└── runtime/
    ├── lifecycle.ts         # 生命周期
    └── provider.ts          # Provider 注册
```

## License

MIT
