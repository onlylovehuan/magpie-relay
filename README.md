# Magpie Relay for VS Code Copilot

English. A Simplified Chinese version is available in `README.zh-cn.md`.

A VS Code Copilot Chat extension that integrates a Magpie gateway as a language-model provider.

## Features

- Dynamic model discovery from the Magpie gateway.
- Automatic vision, tool-calling, and reasoning capability detection from model metadata.
- Complete tool-call and tool-result replay for multi-turn agent workflows.
- Streaming output for thinking and response content.
- Token usage forwarding to Copilot for context calibration.
- No forced output-token limit by default, reducing truncated long-thinking turns.
- SecretStorage-first storage for gateway and upstream API keys.

## Installation

1. Clone this repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Compile:

   ```bash
   npm run compile
   ```

4. Package:

   ```bash
   npm run package
   ```

5. Install the generated `.vsix` file in VS Code.

## Configuration

### 1. Set the Magpie gateway URL

Open the Command Palette and run `Magpie: Set Gateway Address`.

The default URL is:

```text
http://127.0.0.1:3425
```

Change it if Magpie runs on another host or port.

### 2. Set the gateway key

Open the Command Palette and run `Magpie: Set Gateway Key`. Enter the gateway key created in Magpie.

Keys are stored in VS Code SecretStorage first. Legacy plaintext values from the old `magpie-relay.gatewayKey` setting are still read, but migrating to SecretStorage is recommended.

### 3. Optional upstream API key

If a selected model needs a direct provider key, run `Magpie: Set Upstream API Key`.

This key also uses SecretStorage first.

### Settings

| Setting | Default | Description |
|---|---:|---|
| `magpie-relay.endpoint` | `http://127.0.0.1:3425` | Magpie gateway URL |
| `magpie-relay.maxTokens` | `0` | Maximum output tokens; `0` means no extension-level limit. Keep `0` for long-thinking workloads |
| `magpie-relay.reasoningEffort` | `medium` | Fallback reasoning effort when no per-model setting is provided |
| `magpie-relay.enableTools` | `true` | Forward Copilot tool definitions to Magpie |
| `magpie-relay.debugMode` | `false` | Enable detailed debug logging |

## Usage

### Refresh models

Run `Magpie: Refresh Models` to request `/v1/models` again and refresh the Copilot model picker.

### Start a chat

1. Open VS Code Copilot Chat.
2. Find the `Magpie Relay` provider in the model picker.
3. Select a model.
4. Start chatting.

## Commands

| Command ID | Description |
|---|---|
| `magpie-relay.setEndpoint` | Set the Magpie gateway URL |
| `magpie-relay.setGatewayKey` | Set the Magpie gateway key |
| `magpie-relay.setApiKey` | Set the optional upstream API key |
| `magpie-relay.refreshModels` | Refresh the model list |
| `magpie-relay.openSettings` | Open extension settings |
| `magpie-relay.clearAll` | Clear keys and configuration |

## Install Magpie

See the [official Magpie repository](https://github.com/yetone/magpie).

```bash
# Docker
docker run -p 3425:3425 ghcr.io/yetone/magpie

# pip
pip install magpie
magpie serve
```

## Project structure

```text
src/
  extension.ts
  auth.ts
  config.ts
  errors.ts
  logger.ts
  types.ts
  provider/
    index.ts
    catalog.ts
    client.ts
    convert.ts
    request.ts
    stream.ts
    tokens.ts
  runtime/
    lifecycle.ts
    provider.ts
```

## Debugging

Enable `magpie-relay.debugMode` in settings, then open the `Magpie Relay` channel in the VS Code Output panel.

If long thinking is truncated, confirm that `magpie-relay.maxTokens` is `0`, or lower the model's reasoning effort in the model picker.

## License

MIT
