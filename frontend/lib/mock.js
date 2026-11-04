// 演示数据：字段严格按 API_CONTRACT.md v0.7 定义。
// Day 1 用契约第 5 节的原样 4 个块；Day 2 用于演示按 day 分组与「订单原文时间」。
// 全部为演示样例，不含真实订单号与手机号。

export const mockTrip = {
  trip_id: "123e4567-e89b-12d3-a456-426614174000",
  blocks: [
    {
      block_id: "b1",
      day: 1,
      date: "2026-11-05",
      time_slot: "11:30-12:00",
      activity: "广州某酒店 · 入住",
      location: "广州荔湾区",
      is_anchor: true,
      status: "anchored",
    },
    {
      block_id: "b2",
      day: 1,
      date: "2026-11-05",
      time_slot: "14:00-16:00",
      activity: "沙面岛户外游览",
      location: "广州荔湾区",
      is_anchor: false,
      status: "affected",
    },
    {
      block_id: "b3",
      day: 1,
      date: "2026-11-05",
      time_slot: "14:00-16:00",
      activity: "永庆坊室内展馆",
      location: "广州荔湾区恩宁路",
      is_anchor: false,
      status: "candidate",
    },
    {
      block_id: "b4",
      day: 1,
      date: "2026-11-05",
      time_slot: "18:30-20:00",
      activity: "西关晚餐",
      location: "广州荔湾区上下九",
      is_anchor: false,
      status: "normal",
    },
    {
      block_id: "b5",
      day: 2,
      date: "2026-11-06",
      time_slot: "09:00-11:30",
      activity: "广东省博物馆",
      location: "广州天河区",
      is_anchor: false,
      status: "normal",
    },
    {
      // 订单锚点保留订单原文时间，不是 HH:MM-HH:MM 格式
      block_id: "b6",
      day: 2,
      date: "2026-11-06",
      time_slot: "2026年11月6日 12:00",
      activity: "广州某餐厅 · 午餐预约",
      location: "广州天河区",
      is_anchor: true,
      status: "anchored",
    },
    {
      block_id: "b7",
      day: 2,
      date: "2026-11-06",
      time_slot: "14:00-16:30",
      activity: "北京路步行街",
      location: "广州越秀区",
      is_anchor: false,
      status: "normal",
    },
  ],
};

// 对应 POST /api/recompute 的 changed_ids，只负责高亮。
// 接入后由接口返回；想本地看效果改成 ["b2", "b3"]。
export const mockChangedIds = [];

// 对应 POST /api/search 的 SearchResponse[]
export const mockResults = [
  {
    title: "沙面岛游览攻略",
    url: "https://example.com/shamian",
    highlights: ["适合傍晚散步", "骑楼建筑集中"],
    pitfalls: ["周末人多", "部分展馆周一闭馆"],
  },
];

export const mockMessages = [
  {
    id: "m1",
    role: "user",
    text: "帮我安排周末广州两日游，喜欢历史文化，不想去太赶的景点。",
  },
  {
    id: "m2",
    role: "ai",
    text: "已生成两日时间轴：第一天逛荔湾老城，第二天去天河与越秀。所有安排都可在右侧时间轴查看。",
  },
  {
    id: "m3",
    role: "user",
    text: "沙面有什么避坑建议？",
  },
  {
    id: "m4",
    role: "ai",
    text: "检索到以下来源，亮点与避坑提示如下。具体以原文为准。",
    evidence: mockResults,
  },
  {
    id: "m5",
    role: "user",
    text: "【示例订单】广州某酒店已确认，11月5日15:00后入住，离店11月6日，地址：广州市荔湾区恩宁路。",
  },
  {
    id: "m6",
    role: "ai",
    text: "已识别为酒店订单，生成锚点行程块并锁定。重算时该块不会被修改。",
  },
  {
    id: "m7",
    role: "user",
    text: "下午下雨，户外去不了，调整一下。",
  },
  {
    id: "m8",
    role: "ai",
    text: "已定位受影响块「沙面岛户外游览」，改为室内替代方案「永庆坊室内展馆」。酒店锚点与无关行程保持不变。",
  },
];
