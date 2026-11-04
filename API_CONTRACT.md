# Travel Rescuer API 契约 v0.7

状态：**最终版，字段冻结；v0.7 新增 BlockSchema.date**。

- 已实现全部 5 个接口：`POST /api/init_trip`、`POST /api/parse_order`（文本/图片）、`POST /api/search`（博查）、`GET /api/trip/{trip_id}`、`POST /api/recompute`。
- `date`：新 AI 数据一律使用 `YYYY-MM-DD`。`BlockSchema.date` 默认 `待定`；数据库中的 `null` / 空字符串在返回前端前统一序列化为 `待定`。`init_trip` 生成日期，`parse_order` 提取日期，`recompute` 保留锚点日期并为候选块生成 ISO 日期。
- `recompute`：锚点绝对保护（含 date）；无锚点可调时返回原状态和提示；模型异常/JSON 校验失败/锚点篡改返回 `400`，服务不可用返回 `503`，不写脏数据。
- `get_trip`：无效 UUID、行程不存在、行程无 blocks 均返回 `404 {"detail": "Trip not found"}`；数据库不可用返回 `503`。
- `search` 依赖 `BOCHA_API_KEY`；博查或 LLM 失败时返回 `200 []`，不让路由崩溃。
- 所有 LLM 路由：System Prompt 会注入对应 Pydantic 模型的 `model_json_schema()`；模型返回文本必须通过 `model_validate_json()` 校验，失败不写数据库。

## 1. 通用约定

| 项目 | 约定 |
| --- | --- |
| Base URL（本地） | `http://127.0.0.1:8000` |
| 请求/响应 | `application/json; charset=utf-8` |
| 鉴权 | 无登录；`trip_id` 即行程访问凭证 |
| CORS | 已允许 `http://localhost:3000`、`http://127.0.0.1:3000` |
| `trip_id` | UUID 字符串 |
| `block_id` | 字符串。正式环境为 UUID 字符串；Mock 可用 `b1`、`b2` |
| 错误格式 | `{"detail": "..."}`；参数校验失败为 `422`，`detail` 是数组 |
| 时间格式 | 普通行程块用 `HH:MM-HH:MM`；订单锚点允许原文日期时间，如 `11月5日 15:00` |

`status` 只能是：

```text
normal | anchored | affected | candidate
```

不变式：`is_anchor=true` 的块必须为 `anchored`；`affected`、`candidate` 均不是锚点。

## 2. 数据模型

### BlockSchema

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `block_id` | string | 是 | 行程块唯一 ID；正式环境 UUID，Mock 可用 `b1` |
| `day` | integer | 是 | 第几天，从 1 开始 |
| `date` | string | 否（默认 `待定`） | 新 AI 数据必须 `YYYY-MM-DD`；数据库 `null` / 空字符串或缺失时返回 `待定` |
| `time_slot` | string | 是 | 时间段，例如 `14:00-16:00` |
| `activity` | string | 是 | 活动标题 |
| `location` | string | 是 | 地点 |
| `is_anchor` | boolean | 是 | 是否为订单锚点 |
| `status` | enum | 是 | `normal / anchored / affected / candidate` |

### TripState

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "blocks": []
}
```

### ParseOrderResponse

```json
{
  "success": true,
  "new_block": {
    "block_id": "b1",
    "day": 1,
    "date": "2026-11-05",
    "time_slot": "15:00",
    "activity": "广州荔湾某酒店 · 入住",
    "location": "广州市荔湾区恩宁路123号",
    "is_anchor": true,
    "status": "anchored"
  }
}
```

### SearchResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 来源标题 |
| `url` | string | 原文链接 |
| `highlights` | string[] | 亮点摘要 |
| `pitfalls` | string[] | 避坑提示 |

### RecomputeResponse

```json
{
  "changed_ids": ["b2", "b3"],
  "trip_state": {
    "trip_id": "123e4567-e89b-12d3-a456-426614174000",
    "blocks": []
  },
  "message": "已完成局部重算"
}
```

## 3. 接口总览

| 方法 | 路径 | 用途 | 请求模型 | 成功响应 | 状态 |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/init_trip` | 生成初始行程 | `InitTripRequest` | `TripState` | 已实现 |
| GET | `/api/trip/{trip_id}` | 读取完整行程 | 路径参数 `trip_id` | `TripState` | 已实现 |
| POST | `/api/parse_order` | 解析订单并生成锚点 | `ParseOrderRequest` | `ParseOrderResponse` | 已实现 |
| POST | `/api/search` | 检索并生成证据 | `SearchRequest` | `SearchResponse[]` | 已实现（需 `BOCHA_API_KEY`） |
| POST | `/api/recompute` | 突发变化后的局部重算 | `RecomputeRequest` | `RecomputeResponse` | 已实现 |

## 4. 接口示例

### 4.1 POST `/api/init_trip`

```json
{
  "trip_id": null,
  "query": "帮我安排周末广州两日游，喜欢历史文化，不想去太赶的景点。"
}
```

`trip_id` 为 `null` 或省略时新建行程；传入已存在 `trip_id` 时重新生成并替换该行程的全部 blocks。

响应 `200`：`TripState`。

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "blocks": [
    {
      "block_id": "b1",
      "day": 1,
      "date": "2026-11-07",
      "time_slot": "09:30-11:30",
      "activity": "参观陈家祠，欣赏岭南建筑",
      "location": "广州荔湾区陈家祠",
      "is_anchor": false,
      "status": "normal"
    }
  ]
}
```

错误：行程不存在 `404`；LLM 未配置 `503`；生成或 Schema 校验失败（重试一次后）`502`；保存失败 `500`。

### 4.2 GET `/api/trip/{trip_id}`

```http
GET /api/trip/123e4567-e89b-12d3-a456-426614174000
```

响应 `200`：`TripState`，`blocks` 按 `day + time_slot` 排序。

- `trip_id` 为无效 UUID、行程不存在、行程存在但没有任何 block：`404 {"detail": "Trip not found"}`。
- 数据库不可用：`503 {"detail": "Database unavailable"}`。
- 后端使用 `joinedload` 一次性查出 Trip 与 Blocks，避免 N+1。

### 4.3 POST `/api/parse_order`

文本请求：

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "order_text": "【酒店确认】广州某酒店已确认，11月5日15:00后入住，离店11月6日，地址：广州市荔湾区恩宁路。"
}
```

图片请求（后端能力，base64，单张不超过 5MB，也接受 `data:image/png;base64,...`；前端演示已移除上传入口，不调用此模式）：

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "image_base64": "iVBORw0KGgoAAAANSUhEUg...",
  "image_mime_type": "image/png"
}
```

一次只能传 `order_text` 或 `image_base64` 其中之一。

响应 `200`：

```json
{
  "success": true,
  "new_block": {
    "block_id": "b1",
    "day": 1,
    "date": "2026-11-05",
    "time_slot": "15:00",
    "activity": "广州荔湾某酒店 · 入住",
    "location": "广州市荔湾区恩宁路123号",
    "is_anchor": true,
    "status": "anchored"
  }
}
```

行为：

- 日期、时间、地点、活动名称齐全：`success=true`，块为锚点，写入数据库。
- 日期、时间或地点缺失：仍写入数据库并返回 `200`，但 `success=false`、`is_anchor=false`、`status=normal`；`new_block` 的 `time_slot/location` 为空字符串，`date` 由兜底逻辑返回 `待定`。
- 活动名称缺失：`422`，不写入数据库。
- 图片模式需要配置 `VISION_LLM_*`；当前项目使用 Kimi `kimi-k3.1-pro`，支持图片。未配置视觉模型返回 `501`。
- 其他错误：行程不存在 `404`；LLM 未配置 `503`；模型调用或 Schema 校验失败 `502`；图片超过 5MB 返回 `413`。

### 4.4 POST `/api/search`

请求：

```json
{
  "query": "沙面有什么避坑建议"
}
```

响应 `200`：`SearchResponse[]`。

```json
[
  {
    "title": "沙面岛游览攻略",
    "url": "https://example.com/shamian",
    "highlights": ["适合傍晚散步", "骑楼建筑集中"],
    "pitfalls": ["周末人多", "部分展馆周一闭馆"]
  }
]
```

当前已接入博查：

- 先调用一次 LLM 做 Query Rewrite；保留原始 query 作为兜底，不丢弃原始实体。
- 用改写后的 query 和原始 query 分别请求博查（并发），按 URL 去重。
- 请求体 `{"query": ..., "summary": true, "count": 3}`，从 `data.webPages.value` 提取 `name`、`url`、`snippet`（或 `summary`），封装成 `SearchEvidence`。
- 将合并后的 evidence 与**原始问题**一起交给总结模型，严格按原始意图提炼，并用 `SearchResultBundle` 做 `model_validate_json()` 校验。
- Query Rewrite 超时 30 秒，博查超时 15 秒，总结超时 90 秒；前端超时 180 秒。
- 未配置 `BOCHA_API_KEY`、博查失败、LLM 校验失败：返回 `200 []`，不抛错。
- 结果 URL 必须来自博查 evidence，否则后端会丢弃。

### 4.5 POST `/api/recompute`

请求：

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "change_desc": "下午下雨，户外去不了"
}
```

响应 `200`：

```json
{
  "changed_ids": ["b2", "b3"],
  "trip_state": {
    "trip_id": "123e4567-e89b-12d3-a456-426614174000",
    "blocks": []
  },
  "message": "已完成局部重算"
}
```

行为：

- 使用 `joinedload` 查询 Trip 和 Blocks；行程不存在返回 `404 "Trip not found"`。
- 分离 `is_anchor=true` 的 `protected_blocks`；没有可调整的非锚点块时，返回 `200` 原状态，`changed_ids=[]`，`message="没有可调整的非锚点行程"`。
- 将 `change_desc`、`protected_blocks`、`mutable_blocks` 发送给 LLM；System Prompt 注入 `RecomputeResponse.model_json_schema()`，并用 `model_validate_json()` 校验。
- 锚点断言：模型返回的完整 blocks 中，所有 protected 块必须按 `block_id` 原样存在，`day/date/time_slot/activity/location/is_anchor/status` 全部一致；历史锚点日期为 `待定` 时也必须保留 `待定`。锚点 ID 不能出现在 `changed_ids` 中。违反则拒绝写入，返回 `400`。候选新块必须填写合法 `YYYY-MM-DD`，不能使用 `待定`。
- 事务落库：受影响的旧块 `status` 更新为 `affected`；候选新块以 `candidate` 插入并关联当前 `trip_id`；提交事务。`changed_ids` 为本次实际修改的旧块 ID + 新块 ID。
- `trip_state.blocks` 为重算后的完整数据库状态，前端整体替换；`message` 用于展示结果说明。
- 无受影响块：返回 `200` 原状态，`message="未识别到需要调整的非锚点行程"`。
- 错误：模型调用失败/数据库失败 `503`；JSON 校验失败/锚点篡改/结果结构非法 `400`；行程不存在 `404`。所有失败均回滚，不会写入脏数据。

## 5. Mock 数据

`GET /api/trip/{trip_id}` 的 Mock：

```json
{
  "trip_id": "123e4567-e89b-12d3-a456-426614174000",
  "blocks": [
    {
      "block_id": "b1",
      "day": 1,
      "date": "2026-11-07",
      "time_slot": "11:30-12:00",
      "activity": "广州某酒店 · 入住",
      "location": "广州荔湾区",
      "is_anchor": true,
      "status": "anchored"
    },
    {
      "block_id": "b2",
      "day": 1,
      "date": "2026-11-07",
      "time_slot": "14:00-16:00",
      "activity": "沙面岛户外游览",
      "location": "广州荔湾区",
      "is_anchor": false,
      "status": "affected"
    },
    {
      "block_id": "b3",
      "day": 1,
      "date": "2026-11-07",
      "time_slot": "14:00-16:00",
      "activity": "永庆坊室内展馆",
      "location": "广州荔湾区恩宁路",
      "is_anchor": false,
      "status": "candidate"
    },
    {
      "block_id": "b4",
      "day": 1,
      "date": "2026-11-07",
      "time_slot": "18:30-20:00",
      "activity": "西关晚餐",
      "location": "广州荔湾区上下九",
      "is_anchor": false,
      "status": "normal"
    }
  ]
}
```

`POST /api/search` 的 Mock：

```json
[
  {
    "title": "沙面岛游览攻略",
    "url": "https://example.com/shamian",
    "highlights": ["适合傍晚散步", "骑楼建筑集中"],
    "pitfalls": ["周末人多", "部分展馆周一闭馆"]
  }
]
```

## 6. 给队友 A（UI）的映射规则

- 按 `date` / `day` 分组生成 Day 1 / Day 2 时间轴；显示日期，`date` 为 `待定` 时仍可显示，不要报错。
- 卡片字段：`date` → 日期，`time_slot` → 时间列，`activity` → 标题，`location` → 地点副标题。
- `block_id` 作为 React `key`。
- `status` 只负责视觉与文案：`normal` 正常（白）、`anchored` 已锁定（金色锁）、`affected` 受影响（黄色呼吸提示）、`candidate` 替代方案（绿色边框 + 滑入）。
- 锁定逻辑看 `is_anchor`，不要只靠 `status` 推断。
- `parse_order` 的 `success=false` 或 `new_block` 日期/时间/地点为空时，显示“待确认”，不要当锚点；`date` 为 `待定` 时也要容错展示。
- `search` 结果使用 `title`、`url`、`highlights`、`pitfalls` 渲染证据卡。

## 7. 给队友 B（联调）的规则

- 新增 `NEXT_PUBLIC_API_BASE_URL`，默认 `http://127.0.0.1:8000`。
- 后端全部接口可用：`init_trip`、`parse_order`（文本/图片）、`search`、`get_trip`、`recompute`。前端演示只使用文本订单，图片上传入口已移除。
- `get_trip` 找不到时统一返回 `404 "Trip not found"`，不要重试；数据库不可用为 `503`。
- `search` 可能返回空数组（博查或 LLM 失败）；显示“暂无证据”，不要自动重试风暴；最长约 105 秒。
- `recompute` 可能耗时 10–120 秒；`400` 表示模型结果/锚点保护失败，`503` 表示服务不可用。`changed_ids` 中是旧受影响块 ID + 新候选块 ID；锚点不会出现。`message` 可为空字符串或提示文案。
- **破坏性变更**：`init_trip` 请求字段由 `message` 改为 `query`。
- **破坏性变更**：`parse_order` 响应由扁平 Block + `missing_fields` 改为 `{success, new_block}`。
- 前端不启用图片上传，订单识别只传 `order_text`；后端保留 `image_base64` 能力（单张不超过 5MB），供内部或后续使用。
- `BlockSchema.date` 默认 `待定`；后端会把数据库 `null` / 空字符串统一转成 `待定`，前端直接展示即可。新 AI 数据仍必须是 `YYYY-MM-DD`。
- `init_trip` 可能耗时 10–120 秒，`parse_order` 文本约 10–60 秒、图片最多约 210 秒，需要 loading 和超时处理。
- 所有已实现接口的 LLM 输出都经过 Pydantic 严格校验；失败不会写数据库，前端按 `400/422/502/503` 显示可理解错误。
- 字段名或类型如需调整，先通知 A/B 并同步更新 Mock。

## 8. 实现状态与变更

- v0.3：统一 `BlockSchema`；`init_trip` 使用 `query`；`parse_order` 使用 `success + new_block`；`search` 使用 `query + SearchResponse[]`；`recompute` 使用 `change_desc + {changed_ids, trip_state}`。
- v0.4：`search` 接入博查；失败返回空数组；结果 URL 限制为博查 evidence。
- v0.5：`get_trip` 实现；`joinedload` 单查询；404/503；路径固定为 `/api/trip/{trip_id}`。
- v0.6：`recompute` 实现；事务落库；锚点断言；`RecomputeResponse.message`；400/503 兜底。
- v0.7：`BlockSchema.date`；`init_trip` 生成日期、`parse_order` 提取日期、`recompute` 保留/生成日期；锚点断言加入 `date`；数据库 `blocks` 新增 `date` 列；历史 `null` / 空字符串统一兜底为 `待定`；新 AI 日期强制 `YYYY-MM-DD`。
- 已接入 `model_json_schema()` 注入 System Prompt 与 `model_validate_json()` 强校验。
