# Travel Rescuer API 契约 v0.8

状态：**最终版，字段冻结；v0.8 新增意图、普通日程、block 操作接口与行程上下文搜索**。

- 已实现全部 8 个接口：`POST /api/init_trip`、`GET /api/trip/{trip_id}`、`POST /api/parse_order`、`POST /api/search`、`POST /api/recompute`、`POST /api/trip/{trip_id}/intent`、`POST /api/trip/{trip_id}/schedule`、`POST /api/trip/{trip_id}/update`。
- 意图由后端 LLM 判断，前端不做关键词正则路由；`order` / `schedule` / `recompute` / `search` / `clarify` 五种结果由前端分发。
- 普通日程永远不自动锚定；订单只有在日期命中当前行程且日期/时间/地点完整时才可锚定。
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
| CORS | 已允许 `http://localhost:3000`、`http://127.0.0.1:3000`、`http://localhost:3001`、`http://127.0.0.1:3001` |
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
  },
  "message": null
}
```

`message` 可选，用于说明订单未锚定、日期不在行程内或信息不完整的原因。

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

### IntentResponse

```json
{
  "intent": "schedule",
  "message": null
}
```

`intent` 枚举：`order | schedule | recompute | search | clarify`。

### ScheduleResponse

```json
{
  "success": true,
  "new_block": {
    "block_id": "b1",
    "day": 4,
    "date": "2026-11-08",
    "time_slot": "",
    "activity": "去朋友家",
    "location": "",
    "is_anchor": false,
    "status": "normal"
  },
  "message": "日期不在当前行程范围内，已作为普通日程加入，未锁定锚点。"
}
```

### UpdateBlockRequest

```json
{
  "action": "confirm_replace",
  "block_id": "old-affected-id",
  "target_block_id": "candidate-id"
}
```

`action` 枚举：`delete | lock | unlock | confirm_replace`；`target_block_id` 仅 `confirm_replace` 必填。

## 3. 接口总览

| 方法 | 路径 | 用途 | 请求模型 | 成功响应 | 状态 |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/init_trip` | 生成初始行程 | `InitTripRequest` | `TripState` | 已实现 |
| GET | `/api/trip/{trip_id}` | 读取完整行程 | 路径参数 `trip_id` | `TripState` | 已实现 |
| POST | `/api/parse_order` | 解析订单并生成锚点 | `ParseOrderRequest` | `ParseOrderResponse` | 已实现 |
| POST | `/api/search` | 检索并生成证据；可选 `trip_id` 注入行程上下文 | `SearchRequest` | `SearchResponse[]` | 已实现（需 `BOCHA_API_KEY`） |
| POST | `/api/recompute` | 突发变化后的局部重算 | `RecomputeRequest` | `RecomputeResponse` | 已实现 |
| POST | `/api/trip/{trip_id}/intent` | 后端 LLM 判断用户意图 | `IntentRequest` | `IntentResponse` | 已实现 |
| POST | `/api/trip/{trip_id}/schedule` | 记录普通日程，生成 normal 卡片 | `ScheduleRequest` | `ScheduleResponse` | 已实现 |
| POST | `/api/trip/{trip_id}/update` | 删除 / 锁定 / 解锁 / 采用替代方案 | `UpdateBlockRequest` | `TripState` | 已实现 |

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

- 日期命中当前行程、且日期/时间/地点/活动名称齐全：`success=true`，块为锚点，写入数据库。
- 日期不在当前行程范围内：仍写入数据库并返回 `200`，但强制 `success=false`、`is_anchor=false`、`status=normal`；按行程起始日计算 `day`，并返回明确 `message`，绝不误锁锚点。
- 日期、时间或地点缺失：仍写入数据库并返回 `200`，但 `success=false`、`is_anchor=false`、`status=normal`；`new_block` 的 `time_slot/location` 为空字符串，`date` 由兜底逻辑返回 `待定`。
- `day` 会根据当前 Trip 的日期校正；行程外日期会落到对应的新 Day，保证前端能渲染出新卡片。
- 活动名称缺失：`422`，不写入数据库。
- 图片模式需要配置 `VISION_LLM_*`；当前项目使用 Kimi `kimi-k3.1-pro`，支持图片。未配置视觉模型返回 `501`。
- 其他错误：行程不存在 `404`；LLM 未配置 `503`；模型调用或 Schema 校验失败 `502`；图片超过 5MB 返回 `413`。

### 4.4 POST `/api/search`

请求：

```json
{
  "query": "沙面有什么避坑建议",
  "trip_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

`query` 必填，`trip_id` 可选；不传时保持纯 query 搜索，行为与旧版本一致。

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
- 传入 `trip_id` 时，后端读取 Trip blocks，计算 active day、日期、当前城市和活动，作为紧凑 `trip_context` 注入同一次 Query Rewrite（不额外增加 LLM 调用）。
- 上下文只补充用户未明确说出的城市/时间；用户显式提到的城市、地点、日期绝对不被覆盖。多城市行程优先使用 active day 的城市。
- 上下文缺失、行程不存在或 DB 读取失败时，自动降级为纯 query 搜索。
- 若上下文城市唯一且 query 是“晚上去哪/附近有什么”等通用问法，后端增加 `city + query` 的确定性 fallback；博查仍最多两路（改写 query + fallback/original），不增加调用次数。
- 用改写后的 query 和 fallback query（无上下文时为原始 query）分别请求博查（并发），按 URL 去重。
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

### 4.6 POST `/api/trip/{trip_id}/intent`

请求：

```json
{
  "text": "帮我记一下11月8日去朋友家"
}
```

响应 `200`：

```json
{
  "intent": "schedule",
  "message": null
}
```

行为：

- 读取当前 Trip blocks，把紧凑行程上下文和用户文本交给后端意图模型。
- 返回 `order`、`schedule`、`recompute`、`search`、`clarify` 之一；`clarify` 可在 `message` 中给出追问。
- 意图接口只做判断，不写数据库；前端根据 `intent` 调用对应接口。
- 错误：行程不存在 `404`；LLM 未配置 `503`；LLM 调用失败 `502`。

### 4.7 POST `/api/trip/{trip_id}/schedule`

请求：

```json
{
  "text": "帮我记一下11月8日去朋友家"
}
```

响应 `200`：`ScheduleResponse`。

行为：

- LLM 抽取普通日程的 `date / time_slot / activity / location`，写入真实数据库。
- 普通日程永远是 `status=normal`、`is_anchor=false`，即使字段完整也不会自动锚定。
- 日期不在当前行程范围内时，按行程起始日计算新 `day`，卡片照常渲染并返回提示。
- 日期未识别时仍写入待确认卡片，并提示补充日期。
- 活动名称无法识别时返回 `422`；行程不存在 `404`；LLM/DB 失败按 `502/503` 返回。

### 4.8 POST `/api/trip/{trip_id}/update`

请求：

```json
{
  "action": "confirm_replace",
  "block_id": "old-affected-id",
  "target_block_id": "candidate-id"
}
```

响应 `200`：完整 `TripState`。

行为：

- `delete`：从数据库删除 `block_id`。
- `lock`：`block_id` 的 `is_anchor=true`，`status=anchored`。
- `unlock`：`block_id` 的 `is_anchor=false`，`status=normal`。
- `confirm_replace`：删除 `block_id`（旧 affected 卡片），把 `target_block_id` 的 candidate 状态改为 `normal`；目标必须是 candidate。
- 所有操作在事务内完成；提交后重新查询该 Trip 的全部 blocks，严格返回 `TripState`。
- 错误：行程或 block 不存在 `404`；目标不是 candidate、缺少 target、自引用 `400`；数据库异常 `500`。

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
- 后端全部接口可用：`init_trip`、`parse_order`（文本/图片）、`search`、`get_trip`、`recompute`、`intent`、`schedule`、`update`。前端演示只使用文本订单，图片上传入口已移除。
- `intent` 只返回意图，不写数据库；前端按 `order → parse_order`、`schedule → schedule`、`recompute → recompute`、`search → search`、`clarify → message` 分发，不再使用前端关键词正则。
- `schedule` 永远生成 `normal` 卡片，不自动锚定；行程外日期会分配新 Day，并返回提示。
- `parse_order` 只有日期命中当前行程且日期/时间/地点完整时才会返回锚点；行程外日期返回 `normal` 和 `message`，不要把它显示成已锁定。
- `update` 返回完整 `TripState`；前端请求期间禁用操作按钮，成功后直接覆盖当前 state。`confirm_replace` 会删除旧 affected 块并把 candidate 改为 normal。
- `get_trip` 找不到时统一返回 `404 "Trip not found"`，不要重试；数据库不可用为 `503`。
- `search` 可能返回空数组（博查或 LLM 失败）；显示“暂无证据”，不要自动重试风暴；最长约 105 秒。请求可带可选 `trip_id` 让后端补齐当前城市上下文；不传时行为不变。
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
- v0.8：新增后端 LLM 意图路由、普通日程接口和 block 操作接口；`parse_order` 增加行程日期校验与 `message`；`search` 支持可选 `trip_id` 注入当前行程城市上下文；锁/解锁/采用替代方案返回完整 `TripState`。
- 已接入 `model_json_schema()` 注入 System Prompt 与 `model_validate_json()` 强校验。
