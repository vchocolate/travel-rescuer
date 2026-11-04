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
- `POST /api/parse_order`：订单文本生成锚点。
- `POST /api/recompute`：整体替换重算后的行程块并高亮 `changed_ids`。
- `POST /api/search`：搜索证据卡。
- `GET /health`：健康检查。

请求层位于 `lib/api.js`，Mock 位于 `lib/mock-api.js`，交互状态位于
`hooks/useTripController.js`。

接口版本为 v0.7：创建请求使用 `query`；行程块支持 `date` 和 `待定`；订单响应使用
`{ success, new_block }`；重算请求使用 `change_desc`，响应使用
`{ changed_ids, trip_state }`；搜索结果使用 `highlights` 和 `pitfalls`。

## 检查

```bash
npm run lint
npm run build
```
