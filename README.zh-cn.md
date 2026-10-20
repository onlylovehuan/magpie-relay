# Magpie Relay for VS Code Copilot

[English](README.md) | 简体中文

一个将 Magpie 网关集成到 VS Code Copilot Chat 的扩展。

## 功能特性

- 动态发现 Magpie 网关中的可用模型。
- 根据模型元数据自动检测 Vision、Tool Calling 和 Reasoning 能力。
- 完整回放工具调用和工具结果，支持多轮 agent 工作流。
- 流式输出思考内容和正文内容。
- 将 token usage 回传给 Copilot，用于上下文校准。
- 默认不主动限制输出 token，减少长思考被截断的情况。
- API Key 优先保存在 VS Code SecretStorage 中。

## 安装

1. 克隆本仓库。
2. 安装依赖：

   ```bash
   npm install
   ```

3. 编译：

   ```bash
   npm run compile
   ```

4. 打包：

   ```bash
   npm run package
   ```

5. 在 VS Code 中安装生成的 `.vsix` 文件。

## 配置

### 1. 设置 Magpie 网关地址

打开命令面板，执行 `Magpie: 设置网关地址`。

默认地址是：

```text
http://127.0.0.1:3425
```

如果 Magpie 运行在其他主机或端口，请改成实际地址。

### 2. 设置网关密钥

打开命令面板，执行 `Magpie: 设置网关密钥`，输入在 Magpie 中创建的 Gateway Key。

密钥会优先保存到 VS Code SecretStorage。旧版本放在 `magpie-relay.gatewayKey` 设置中的值仍会被读取，但建议迁移到 SecretStorage。

### 3. 可选：设置上游 API Key

如果所选模型需要直接提供上游提供商密钥，执行 `Magpie: 设置上游 API Key`。

该密钥同样优先保存到 SecretStorage。

### 主要设置

| 设置 | 默认值 | 说明 |
|---|---:|---|
| `magpie-relay.endpoint` | `http://127.0.0.1:3425` | Magpie 网关地址 |
| `magpie-relay.maxTokens` | `0` | 最大输出 token；`0` 表示不主动限制。长思考场景建议保持 `0` |
| `magpie-relay.reasoningEffort` | `medium` | 模型未提供 per-model 配置时的默认推理强度 |
| `magpie-relay.enableTools` | `true` | 是否把 Copilot 工具定义转发给 Magpie |
| `magpie-relay.debugMode` | `false` | 输出更详细的调试日志 |

## 使用

### 刷新模型

执行 `Magpie: 刷新模型列表`，扩展会重新请求 `/v1/models` 并刷新 Copilot 模型选择器。

### 开始对话

1. 打开 VS Code Copilot Chat。
2. 在模型选择器中找到 `Magpie Relay` 提供商。
3. 选择模型。
4. 开始对话。

## 命令

| 命令 ID | 说明 |
|---|---|
| `magpie-relay.setEndpoint` | 设置 Magpie 网关地址 |
| `magpie-relay.setGatewayKey` | 设置 Magpie 网关密钥 |
| `magpie-relay.setApiKey` | 设置可选的上游 API Key |
| `magpie-relay.refreshModels` | 刷新模型列表 |
| `magpie-relay.openSettings` | 打开扩展设置 |
| `magpie-relay.clearAll` | 清除密钥和配置 |

## 安装 Magpie

请参考 [Magpie 官方仓库](https://github.com/yetone/magpie)。

```bash
# Docker
docker run -p 3425:3425 ghcr.io/yetone/magpie

# pip
pip install magpie
magpie serve
```

## 项目结构

```text
src/
├── extension.ts
├── auth.ts
├── config.ts
├── errors.ts
├── logger.ts
├── types.ts
├── provider/
│   ├── index.ts
│   ├── catalog.ts
│   ├── client.ts
│   ├── convert.ts
│   ├── request.ts
│   ├── stream.ts
│   └── tokens.ts
└── runtime/
    ├── lifecycle.ts
    └── provider.ts
```

## 调试

在设置中启用 `magpie-relay.debugMode`，然后查看 VS Code Output 面板中的 `Magpie Relay` 通道。

如果遇到长思考被截断，请确认 `magpie-relay.maxTokens` 为 `0`，或在模型选择器中降低 reasoning effort。

## License

MIT
