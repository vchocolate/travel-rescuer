# 旅伴重构器 · Travel Rescuer

> 让旅行计划从一张静态表格，变成能应对天气、交通和临时计划的动态旅行搭子。

旅伴重构器是一个面向真实旅行场景的全栈 Demo：

- 用自然语言生成旅行时间轴；
- 把已确认的酒店、机票、门票等订单锁定为「锚点」；
- 遇到下雨、变冷、取消、改期等变化时，只重算受影响的部分；
- 为受影响行程生成替代方案，由用户决定是否采用；
- 支持手动删除、锁定、解锁、采用替代方案；
- 搜索攻略时自动带入当前行程城市与日期上下文。

项目地址：<https://github.com/vchocolate/travel-rescuer>

---

## 核心能力

### 1. 一句话生成行程

输入目的地、日期和偏好，后端调用大模型生成结构化的 Day / 时间轴 / 地点数据，并持久化到数据库。

### 2. 订单锚点保护

粘贴酒店、机票、火车票或门票文字后，系统识别订单并生成行程卡片。

- 日期在当前行程内且日期、时间、地点完整：自动锁定为锚点；
- 日期不在当前行程内：作为普通待确认卡片加入，不自动锁定；
- 锁定后的行程块不会参与后续自动重算。

### 3. 后端 LLM 意图路由

前端不再用关键词正则猜测用户意图。用户输入统一交给后端意图模型判断：

| 意图 | 示例 | 处理 |
| --- | --- | --- |
| `order` | 酒店确认短信 | 订单解析 → 锚点或待确认卡片 |
| `schedule` | 帮我记一下 11 月 8 日去朋友家 | 普通日程 → normal 卡片 |
| `recompute` | 下午下雨，户外活动取消 | 局部重算 → affected + candidate |
| `search` | 晚上去哪逛逛 | 带行程上下文搜索证据 |
| `clarify` | 信息不足 | 追问用户 |

### 4. 局部重算与替代方案

重算只修改非锚点行程，锚点时间、地点和状态保持不变。

- 旧行程标记为 `affected`（黄色卡片）；
- 新方案标记为 `candidate`（绿色卡片）；
- 点击「采用此方案」后，旧 affected 卡片删除，candidate 转为 normal。

### 5. 行程上下文搜索

搜索请求可以携带当前 `trip_id`。后端读取当前行程的 active day、日期、城市和活动，注入同一次 Query Rewrite，让“晚上去哪逛逛”变成带城市的精准搜索词。

- 用户明确提到“上海”时不会被当前行程城市覆盖；
- 未传 `trip_id` 时保持原搜索行为；
- 行程上下文缺失或数据库异常时自动降级为纯 query 搜索。

### 6. 交互与持久化

- 删除 / 锁定 / 解锁 / 采用替代方案均通过真实后端接口完成；
- 成功后直接用后端返回的 `TripState` 覆盖页面状态；
- 行程 ID 保存在本地，刷新或分享链接后可以恢复；
- 演示数据仅用于未创建真实行程时的首屏展示，不参与真实操作。

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Next.js 16 App Router、React 19、Tailwind CSS 4 |
| 后端 | FastAPI、Pydantic、SQLAlchemy 2 |
| 数据库 | PostgreSQL（Supabase 兼容） |
| 大模型 | Kimi / Moonshot，可替换为 OpenAI 兼容接口 |
| 搜索 | 博查 Web Search API |
| 部署形态 | 前后端分离，REST API |

---

## 项目结构

```text
.
├── backend/
│   ├── app/
│   │   ├── routers/        # trips / orders / recompute / search
│   │   ├── services/       # LLM、意图、日程、订单、搜索、重算服务
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── main.py
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                # 本地私密配置，已被 Git 忽略
├── frontend/
│   ├── app/                # Next.js 页面
│   ├── components/         # ChatPanel / Timeline / TimelineBlock / 证据卡
│   ├── hooks/              # useTripController
│   ├── lib/                # API、Mock、时间轴、错误处理
│   ├── .env.example
│   └── .env.local          # 本地私密配置，已被 Git 忽略
├── API_CONTRACT.md         # 前后端接口契约
└── README.md
```

---

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 20.9+
- PostgreSQL / Supabase 数据库
- Kimi / Moonshot API Key
- 博查 API Key

### 1. 启动后端

```bash
cd backend
python -m venv .venv
```

Windows：

```powershell
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

macOS / Linux：

```bash
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

填写 `backend/.env` 后，初始化数据库表（首次运行）：

```bash
python -c "from app import models; from app.database import Base, engine; Base.metadata.create_all(engine)"
```

启动 API：

```bash
uvicorn app.main:app --reload --port 8000
```

健康检查：<http://127.0.0.1:8000/health>

### 2. 启动前端

```bash
cd frontend
npm install
```

Windows：

```powershell
copy .env.example .env.local
npm run dev
```

macOS / Linux：

```bash
cp .env.example .env.local
npm run dev
```

打开终端输出的地址（默认 `http://localhost:3000` 或 `http://localhost:3001`）。

前端 API 地址通过 `NEXT_PUBLIC_API_BASE_URL` 配置，默认 `http://127.0.0.1:8000`。

---

## 环境变量

### 后端 `backend/.env`

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL / Supabase 连接串 |
| `LLM_API_KEY` | 是 | Kimi 或兼容 OpenAI 接口的 Key |
| `LLM_BASE_URL` | 是 | 默认 `https://api.moonshot.cn/v1` |
| `LLM_MODEL` | 是 | 默认 `kimi-k3.1-pro` |
| `LLM_TIMEOUT` | 否 | LLM 请求超时秒数 |
| `LLM_JSON_MODE` | 否 | 是否启用 JSON 输出 |
| `LLM_REASONING_EFFORT` | 否 | Kimi 推理强度，可选 `low` / `high` / `max` |
| `VISION_LLM_API_KEY` | 否 | 视觉模型 Key；当前前端未启用图片上传 |
| `VISION_LLM_BASE_URL` | 否 | 视觉模型 Base URL |
| `VISION_LLM_MODEL` | 否 | 视觉模型名称 |
| `BOCHA_API_KEY` | 是 | 博查搜索 Key |
| `BOCHA_API_URL` | 否 | 博查搜索接口地址 |
| `BOCHA_TIMEOUT` | 否 | 博查超时秒数 |

### 前端 `frontend/.env.local`

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | 是 | 后端地址，默认 `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_USE_MOCK` | 否 | 离线演示时可设为 `true` |

> `backend/.env` 和 `frontend/.env.local` 已被 `.gitignore` 忽略，禁止提交到 Git。

---

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/init_trip` | 根据自然语言生成并保存行程 |
| `GET` | `/api/trip/{trip_id}` | 读取完整 TripState |
| `POST` | `/api/trip/{trip_id}/intent` | 后端 LLM 意图判断 |
| `POST` | `/api/parse_order` | 解析订单文字，生成锚点或待确认卡片 |
| `POST` | `/api/trip/{trip_id}/schedule` | 记录普通日程，生成 normal 卡片 |
| `POST` | `/api/trip/{trip_id}/update` | 删除 / 锁定 / 解锁 / 采用替代方案 |
| `POST` | `/api/recompute` | 局部重算，返回 affected + candidate |
| `POST` | `/api/search` | 证据搜索，可选 `trip_id` 注入行程上下文 |
| `GET` | `/health` | 健康检查 |

详细字段、错误码和前端映射规则见 [API_CONTRACT.md](./API_CONTRACT.md)。

---

## 推荐演示流程

1. 输入旅行需求，例如：`帮我安排周末广州两日游，喜欢历史文化和美食，不想太赶。`
2. 等待生成时间轴。
3. 粘贴酒店订单文字，验证锚点锁定。
4. 输入：`帮我记一下 11 月 8 日去朋友家`，验证普通日程卡片。
5. 粘贴一个行程外日期的订单，验证不会误锁锚点。
6. 输入：`下午下雨，户外活动取消。`，查看 affected / candidate。
7. 点击绿色卡片上的「采用此方案」，确认黄色卡片自动删除。
8. 输入：`晚上去哪逛逛`，验证搜索结果带上当前行程城市。
9. 使用删除 / 锁定 / 解锁按钮检查真实数据库交互。

---

## 开发检查

```bash
# 前端
cd frontend
npm run lint
npm run build

# 后端
cd backend
python -m compileall -q app
```

---

## 安全与隐私

- 所有密钥只放在本地环境变量中，不写入源码；
- `.env`、`.env.local`、`.venv`、`node_modules` 等已被 Git 忽略；
- 仓库仅包含 `.env.example` 占位模板，不包含真实 Key、数据库密码或个人数据；
- 对外公开仓库前，建议再次执行敏感信息扫描，并在必要时轮换所有曾经暴露的 Key；
- 真实行程、订单和账号信息请不要提交到仓库或公开演示环境。

---

## 已知限制

- 图片上传入口已关闭，订单锚点请直接粘贴订单文字；
- 依赖外部 LLM 与搜索服务，服务不可用或触发限流时会返回可读错误或空证据；
- 当前没有正式数据库迁移工具，生产环境建议引入 Alembic 管理表结构；
- 演示数据仅用于首屏展示，真实操作始终使用后端返回的数据。

---

## License

当前仓库未附带开源许可证文件。如需对外开源分发，请补充合适的 `LICENSE`。
