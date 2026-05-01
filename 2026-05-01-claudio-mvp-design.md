# Claudio MVP 设计文档

**日期**：2026-05-01
**状态**：设计已确认，待编写实现计划

## 1. 产品定位

Claudio 是一个**私人 AI 电台**：纯本地运行，由 Claude 扮演深夜电台 DJ，从网易云音乐挑歌、用 Fish Audio 合成的英伦磁性男声串场，根据时间、天气、用户听歌历史与个人档案做出有"人味儿"的播报与选曲。

**核心体验**：用户打开 PWA → 音乐自然流淌 → DJ 在合适时机开口（不啰嗦）→ 用户随时可以打字与 DJ 对话或点歌。

## 2. 关键决策

| 维度 | 决策 |
|---|---|
| 音乐源 | 网易云音乐**开放平台官方 API**（合规、稳定） |
| DJ 人格 | 深夜电台风：慢、沉、有故事感 |
| TTS 声线 | Fish Audio，英伦磁性中年男声 |
| 串场触发 | Claude 智能判断（每首歌后自决是否开口）+ 用户对话/点歌时触发 |
| 用户上下文 | 时间/天气 + 网易云听歌历史/收藏 + 用户手写个人档案 |
| 选曲逻辑 | Claude 选曲（含发现新歌：从用户收藏 / 相似歌 / 网易云推荐 中选）+ 用户主动点歌 |
| UI 范围 | 播放/暂停 · 进度条 · 喜欢/跳过 · DJ 串场气泡 · 对话输入框 |
| 部署 | 纯本地，Node 服务跑在 `localhost`，浏览器访问 |
| 存储 | 本地 JSON 文件（无数据库） |

## 3. 整体架构

```
┌─ PWA (浏览器) ────────────────────────┐
│  播放器 UI · DJ 气泡 · 对话框           │
│  HTML5 Audio · Service Worker          │
└──────────┬─────────────────────────────┘
           │ HTTP + SSE（推送 DJ 串场/状态）
┌──────────▼─────────────────────────────┐
│  Node 中枢 (localhost:3000)             │
│  ┌─ 编排层 (Orchestrator) ─────────┐   │
│  │  调度循环 · 上下文装配 · 决策    │   │
│  └─ 适配器层 ────────────────────┘   │
│     ├─ NeteaseClient（官方 API）       │
│     ├─ ClaudeClient（DJ 大脑）         │
│     ├─ FishAudioClient（TTS）          │
│     └─ WeatherClient（OpenWeather）    │
│  存储：本地 JSON（用户档案/历史/缓存） │
└─────────────────────────────────────────┘
```

**设计原则**：所有"思考"集中在 Node，前端只管"播和聊"。这样以后改 DJ 行为、换 TTS、换音乐源都不用动前端。

## 4. 模块拆分

### 4.1 Node 服务

| 模块 | 职责 | 关键接口 |
|---|---|---|
| **Orchestrator** | 调度大脑：决定何时串场、装配上下文、串联各模块 | `tick()`, `onTrackEnd()`, `onUserMessage()` |
| **ContextBuilder** | 把时间/天气/历史/档案/当前曲目打包成给 Claude 的 prompt | `build(state) → ContextBundle` |
| **DJBrain**（Claude 适配） | 调 Claude，返回结构化决策 | `decide(context)`, `chat(userMsg, context)` |
| **MusicSource**（网易云） | 搜歌、获取歌曲 URL、推荐、相似歌、用户收藏 | `search`, `getUrl`, `recommend`, `getFavorites` |
| **TTSEngine**（Fish Audio） | 文本→音频文件，缓存相同文本避免重复生成 | `synthesize(text) → audioUrl` |
| **Weather** | 包装 OpenWeather | `current(city)` |
| **PlayQueue** | 维护待播队列、历史、当前曲目状态 | `next()`, `enqueue()`, `current()` |
| **UserProfile** | 读写本地 JSON：个人档案、喜欢/跳过历史 | `get()`, `like()`, `skip()` |
| **EventBus**（SSE） | 向前端推送事件 | `emit(event, payload)` |

### 4.2 前端

- `Player`：HTML5 Audio 包装 + 队列衔接（音乐 → DJ 串场 → 下一首）
- `DJBubble`：显示串场文本
- `ChatBox`：用户输入对话
- `EventClient`：监听 SSE

## 5. 关键数据流

### 5.1 一首歌自然播完

1. 前端 `Player` 检测到曲目剩 5 秒 → `POST /track/ending`
2. `Orchestrator.onTrackEnd()` → `ContextBuilder` 装上下文（刚播的歌、时间、天气、最近 N 首历史、用户档案、DJ 最近说过的话）
3. `DJBrain.decide(ctx)` → Claude 返回 `{shouldSpeak, script?, nextTrack: {source, hint}}`
4. 若 `shouldSpeak`：`TTSEngine.synthesize(script)` → 生成音频缓存
5. `MusicSource` 据 `nextTrack` 选下一首 → `getUrl()` 拿流地址
6. SSE 推 `dj-speaking{audioUrl, text}` 与 `track-next{url, meta}` → 前端按顺序播

### 5.2 用户在对话框点歌或闲聊

1. 前端 `POST /chat {message}`
2. `DJBrain.chat()` → Claude 识别意图：`{intent: "play"|"chat", query?, reply}`
3. 若 `play`：`MusicSource.search` 拿歌
4. `TTSEngine` 生成回复音频
5. SSE 推 `dj-speaking` + `track-now`（立即切歌，不等当前歌播完）

### 5.3 用户点"喜欢"

1. 前端 `POST /like {trackId}` → `UserProfile.like()` 写入 JSON
2. 下次 `ContextBuilder` 装上下文时进 prompt，影响 Claude 选曲偏好

### 5.4 Claude 决定不说话

`decide()` 返回 `shouldSpeak: false` → 跳过 TTS，直接接下一首。这就是"懂得沉默"。

## 6. 数据与状态

### 6.1 本地存储（`./data/`）

```
data/
├── profile.json       # 用户个人档案（手写，DJ 用来"认识"用户）
├── history.json       # 播放历史：[{trackId, title, artist, playedAt, liked, skipped}]
├── favorites.json     # 喜欢过的歌
├── dj-memory.json     # DJ 最近说过的话（去重，避免话术重复）
└── audio-cache/       # TTS 生成的音频，按文本 hash 命名
```

### 6.2 `profile.json` 示例

```json
{
  "name": "光哥",
  "bio": "数据分析师，住在杭州，最近在做 AI 产品",
  "musicTaste": "indie folk, post-rock, 偶尔听民谣",
  "vibes": "深夜工作时喜欢听不带歌词的"
}
```

### 6.3 运行时状态（内存）

`currentTrack` · `playQueue` · `isPlaying` · `lastDJSpeechAt`

### 6.4 配置（`.env`）

```
ANTHROPIC_API_KEY=...
NETEASE_CLIENT_ID=...
NETEASE_CLIENT_SECRET=...
FISH_AUDIO_API_KEY=...
FISH_AUDIO_VOICE_ID=...
OPENWEATHER_API_KEY=...
CITY=Hangzhou
```

### 6.5 Claude Prompt 骨架

```
You are a late-night radio DJ with a deep, warm British voice.
You speak slowly, intimately, like an old friend on the air after midnight.

[USER PROFILE]
{profile}

[NOW]
Time: {time}, Weather: {weather}
Just played: {lastTrack}
Recent history (last 5): {history}

[YOUR RECENT MONOLOGUES — DO NOT REPEAT YOURSELF]
{recentScripts}

[USER MESSAGE — IF ANY]
{userMessage}

Decide: should you speak now? Silence is also a choice — a real DJ
doesn't talk after every song. If yes, write a script (1-3 sentences).
Then pick the next track from:
  favorites | similar-to-current | netease-recommend | specific-search

Return JSON:
{
  "shouldSpeak": boolean,
  "script": string | null,
  "nextTrack": { "source": "...", "hint": "..." }
}
```

## 7. 错误处理

**核心原则：DJ 可以哑火，音乐不能停。**

| 失败 | 兜底 |
|---|---|
| Claude API 超时/报错 | 静默接下一首；下一轮再试 |
| Fish Audio 失败 | 把 `script` 推到前端气泡显示，不出声 |
| 网易云某首 URL 解析失败 | 自动跳过；记录失败队列 |
| 网易云全挂 | 退化到"只播 favorites 里有缓存 URL 的歌" |
| OpenWeather 挂 | 跳过该上下文项 |
| TTS 音频下载超时（5 秒） | 跳过本次串场 |

## 8. 测试策略

- **单元测试**：`ContextBuilder`（上下文格式）、`PlayQueue`（状态机）、`DJBrain` 响应解析与容错
- **适配器层**：用 mock 测调用参数，不真调外部 API
- **一个集成测试**：跑通"歌结束 → 串场 → 下一首"全链路，外部 API mock
- **手动验收**：真 API 跑半小时，听感是关键
- **不做**：UI 端到端测试（MVP 阶段不划算）

## 9. 非目标（明确不做）

- 推送到家庭音响（UPnP/DLNA）—— v2
- 云端部署 —— 等 MVP 成熟
- 移动端访问 / 局域网手机访问 —— 暂不做
- 多用户支持
- 完整像素时钟 / 主题切换等 UI 装饰（cc3.png 中的）
- 数据库（SQLite/Postgres）—— JSON 够用

## 10. 技术栈

- **后端**：Node.js + TypeScript + Fastify（或 Express）+ SSE
- **前端**：原生 HTML/JS + Service Worker（PWA）；不引入 React/Vue 框架以保持轻量
- **测试**：Vitest
- **外部依赖**：`@anthropic-ai/sdk`、网易云开放平台官方 SDK/HTTP、Fish Audio HTTP API、OpenWeather HTTP
