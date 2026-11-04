# Travel Rescuer API 契约 v0.1

状态：**字段冻结，后端路由已占位**。当前除 `/health` 外均返回 `501 Not Implemented`，A/B 先按本契约开发，待后端实现后只切换 Base URL，不改字段名和类型。

## 1. 通用约定

| 项目 | 约定 |
| --- | --- |
| Base URL（本地） | `http://127.0.0.1:8000` |
| 请求/响应 | `application/json; charset=utf-8` |
| 鉴权 | 无登录；`trip_id` 即行程访问凭证 |
| CORS | 已允许 `http://localhost:3000`、`http://127.0.0.1:3000` |
| `trip_id` | UUID 字符串，例如 `123e4567-e89b-12d3-a456-426614174000` |
| `block_id` | 字符串。正式环境为 UUID 字符串；Mock 可用 `b1`、`b2` 等短 ID。前端只当作不透明 key，不要解析 |
| 错误格式 | `{"detail": "..."}`；FastAPI 参数校验失败为 `422`，`detail` 是数组 |
| 时间格式 | `time_slot` 使用 `HH:MM-HH:MM`；`retrieved_at` 使用 ISO 8601 UTC |

`status` 只能是以下四个值：

```text
normal | anchored | affected | candidate
```

不变式：`is_anchor=true` 的块必须为 `anchored`；`affected`、`candidate` 均不是锚点。

## 2. 数据模型

### Block

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `block_id` | string | 是 | 行程块唯一 ID；正式环境 UUID，Mock 可用 `b1` |
| `day` | integer | 是 | 第几天，从 1 开始 |
| `time_slot` | string | 是 | 时间段，例如 `14:00-16:00` |
| `activity` | string | 是 | 活动标题，例如 `沙面岛户外游览` |
| `location` | string | 是 | 地点，例如 `广州荔湾区` |
| `is_anchor` | boolean | 是 | 是否为订单锚点；锚点不得被重算修改 |
| `status` | enum | 是 | `normal / anchored / affected / candidate` |

### TripState

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "blocks": []
}
```

### Evidence

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 来源标题 |
| `url` | string | 原文链接 |
| `summary` | string | 摘要；不得编造原文没有的内容 |
| `retrieved_at` | string | 检索时间，ISO 8601 UTC |

## 3. 接口总览

| 方法 | 路径 | 用途 | 成功响应 |
| --- | --- | --- | --- |
| POST | `/api/init_trip` | 从自然语言生成初始行程 | `TripState` |
| GET | `/api/trip/{trip_id}` | 读取完整行程 | `TripState` |
| POST | `/api/search` | 检索攻略并生成证据卡 | `Evidence[]` |
| POST | `/api/parse_order` | 解析订单文本并生成锚点 | `Block` |
| POST | `/api/recompute` | 突发变化后的局部重算 | `changed_ids` + `TripState` |
| GET | `/health` | 健康检查 | `{"status": "ok"}` |

## 4. 接口示例

### 4.1 POST `/api/init_trip`

请求：`trip_id` 可为 `null`（新建行程），也可传入已有 ID（继续编辑）。

```json
{
  "trip_id": null,
  "message": "帮我安排周末广州两日游，喜欢历史文化，不想去太赶的景点。"
}
```

响应 `200`：`TripState`（见下方完整 Mock）。

### 4.2 GET `/api/trip/{trip_id}`

```http
GET /api/trip/123e4567-e89b-12d3-a456-426614174000
```

响应 `200`：`TripState`。不存在时返回 `404`。

### 4.3 POST `/api/search`

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "query": "沙面有什么避坑建议"
}
```

响应 `200`：

```json
[
  {
    "title": "沙面岛游览攻略",
    "url": "https://example.com/shamian",
    "summary": "沙面岛适合傍晚散步，雨天可转入室内展馆。",
    "retrieved_at": "2026-11-04T07:00:00Z"
  }
]
```

### 4.4 POST `/api/parse_order`

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "order_text": "酒店已确认：11月5日入住广州某酒店，离店11月6日，地址广州荔湾区。"
}
```

响应 `200`：一个锚点 `Block`：

```json
{
  "block_id": "b1",
  "day": 1,
  "time_slot": "15:00-16:00",
  "activity": "入住广州某酒店",
  "location": "广州荔湾区",
  "is_anchor": true,
  "status": "anchored"
}
```

字段缺失或文本无效时返回 `422`，前端标记“待确认”，不得擅自生成锚点。

### 4.5 POST `/api/recompute`

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "change": "下午下雨，户外去不了"
}
```

响应 `200`：

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "changed_ids": ["b2", "b3"],
  "blocks": []
}
```

`blocks` 为**重算后的完整列表**，前端整体替换；`changed_ids` 只包含受影响/被替换的非锚点块，锚点 ID 绝不能出现。

## 5. 完整 Mock 数据（B 可直接使用）

`GET /api/trip/{trip_id}` 返回：

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "blocks": [
    {
      "block_id": "b1",
      "day": 1,
      "time_slot": "11:30-12:00",
      "activity": "广州某酒店 · 入住",
      "location": "广州荔湾区",
      "is_anchor": true,
      "status": "anchored"
    },
    {
      "block_id": "b2",
      "day": 1,
      "time_slot": "14:00-16:00",
      "activity": "沙面岛户外游览",
      "location": "广州荔湾区",
      "is_anchor": false,
      "status": "affected"
    },
    {
      "block_id": "b3",
      "day": 1,
      "time_slot": "14:00-16:00",
      "activity": "永庆坊室内展馆",
      "location": "广州荔湾区恩宁路",
      "is_anchor": false,
      "status": "candidate"
    },
    {
      "block_id": "b4",
      "day": 1,
      "time_slot": "18:30-20:00",
      "activity": "西关晚餐",
      "location": "广州荔湾区上下九",
      "is_anchor": false,
      "status": "normal"
    }
  ]
}
```

`POST /api/recompute` 的 mock 响应可使用同一份 `blocks`，`changed_ids` 设为 `["b2", "b3"]`。

## 6. 给队友 A（UI）的映射规则

- 按 `day` 分组生成 Day 1 / Day 2 时间轴。
- 卡片字段：`time_slot` → 时间列，`activity` → 标题，`location` → 地点副标题。
- `block_id` 用作 React `key`。
- `status` 只负责视觉与文案：`normal` 正常（白）、`anchored` 已锁定（金色锁）、`affected` 受影响（黄色呼吸提示）、`candidate` 替代方案（绿色边框 + 滑入）。
- 锁定逻辑看 `is_anchor`，不要只靠 `status` 推断。
- `candidate` 是建议方案，不应显示为已确认的锚点。
- 重算后用 `changed_ids` 高亮本次变化块。

## 7. 给队友 B（联调）的规则

- 新增环境变量 `NEXT_PUBLIC_API_BASE_URL`，默认 `http://127.0.0.1:8000`；不要在前端硬编码多个地址。
- 当前后端为 `501` 占位，先用 Mock 服务器返回第 5 节 JSON；接入真实后端时只改 Base URL。
- 请求统一封装 `fetch`，处理 loading / error / 重复提交禁用。
- 成功后把 `trip_id` 写入 URL 与 `localStorage`；刷新优先从 URL 读取。
- `/api/recompute` 返回后用 `response.blocks` **整体替换**本地列表，不手工 patch；锚点块保持原样。
- 搜索失败或证据不足时明确提示，不要编造摘要。
- 字段名或类型如需调整，先通知 A/B 并同步更新 Mock，禁止单方面改名。

## 8. 最小示例（已通过 Pydantic 校验）

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "blocks": [
    {
      "block_id": "b1",
      "day": 1,
      "time_slot": "14:00-16:00",
      "activity": "沙面岛户外游览",
      "location": "广州荔湾区",
      "is_anchor": false,
      "status": "normal"
    }
  ]
}
```

结论：**结构有效，已被后端 Pydantic `TripState` 校验通过**。两点约定：

1. `block_id` 为 `"b1"` 仅用于 Mock；正式后端返回 UUID 字符串，但前端都按字符串处理。
2. `changed_ids` 只出现在 `/api/recompute` 响应中，普通 `TripState` 不包含该字段。

对应的后端模型在 `backend/app/schemas.py`，数据库表已包含 `location` 字段。
