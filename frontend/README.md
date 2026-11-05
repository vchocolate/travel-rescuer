# 旅伴重构器前端

当前版本为 A（ui 分支组件）与 B（interaction 分支请求/交互层）的集成版：
UI 组件来自 A，请求、状态、持久化和分享逻辑来自 B。

## 启动

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:3000`。

## 环境变量

复制 `.env.example` 为 `.env.local`：

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_USE_MOCK=false
```

图片上传入口已移除。订单锚点请直接粘贴订单文字，在输入框提交。

默认连接真实后端。只有后端不可用、需要离线演示时才临时设置
`NEXT_PUBLIC_USE_MOCK=true`。

## B 已接入

- `POST /api/init_trip`：创建行程。
- `GET /api/trip/{trip_id}`：刷新或分享链接恢复。
- `POST /api/trip/{trip_id}/intent`：后端 LLM 判断用户意图。
- `POST /api/parse_order`：订单文本生成锚点；行程外日期只生成 normal 卡片。
- `POST /api/trip/{trip_id}/schedule`：记录普通日程，永不自动锚定。
- `POST /api/trip/{trip_id}/update`：删除 / 锁定 / 解锁 / 采用替代方案。
- `POST /api/recompute`：整体替换重算后的行程块并高亮 `changed_ids`。
- `POST /api/search`：搜索证据卡；可带 `trip_id` 注入当前城市上下文。
- `GET /health`：健康检查。

请求层位于 `lib/api.js`，Mock 位于 `lib/mock-api.js`，交互状态位于
`hooks/useTripController.js`。

接口版本为 v0.8：创建请求使用 `query`；行程块支持 `date` 和 `待定`；订单响应使用
`{ success, new_block, message }`；意图响应使用 `{ intent, message }`；日程响应使用
`{ success, new_block, message }`；重算请求使用 `change_desc`，响应使用
`{ changed_ids, trip_state }`；block 操作响应为完整 `TripState`；搜索结果使用
`highlights` 和 `pitfalls`，并可携带可选 `trip_id`。

用户输入先经过后端 `/intent` 判断，前端不保存或猜测意图正则。普通日程永远是
`normal`，只有符合当前行程日期且字段完整的订单才会成为锚点。

## 检查

```bash
npm run lint
npm run build
```
