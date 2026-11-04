# 旅伴重构器前端

当前版本已接入 B 的请求层、Mock 主链路和交互状态。

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
NEXT_PUBLIC_USE_MOCK=true
```

后端仍返回 501 时保持 `NEXT_PUBLIC_USE_MOCK=true`。真实接口可用后改为 `false`。

## B 已接入

- `POST /api/init_trip`：创建行程。
- `GET /api/trip/{trip_id}`：刷新或分享链接恢复。
- `POST /api/parse_order`：订单文本生成锚点。
- `POST /api/recompute`：整体替换重算后的行程块并高亮 `changed_ids`。
- `POST /api/search`：搜索证据卡。
- `GET /health`：健康检查。

请求层位于 `lib/api.js`，Mock 位于 `lib/mock-api.js`，交互状态位于
`hooks/useTripController.js`。

## 检查

```bash
npm run lint
npm run build
```
