import { ApiError } from "./errors";

const MOCK_TRIP_ID = "123e4567-e89b-12d3-a456-426614174000";
const MOCK_STORAGE_KEY = "travel-rescuer:mock-trips";
const trips = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createTripId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `trip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readBody(init) {
  if (!init?.body || typeof init.body !== "string") {
    throw new ApiError("请求体缺失", { kind: "http", status: 400 });
  }
  try {
    return JSON.parse(init.body);
  } catch {
    throw new ApiError("请求体不是合法 JSON", {
      kind: "invalid-response",
      status: 400,
    });
  }
}

function readStoredTrips() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(MOCK_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistTrip(trip) {
  trips.set(trip.trip_id, trip);
  if (typeof window === "undefined") return;
  const stored = readStoredTrips();
  stored[trip.trip_id] = trip;
  window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(stored));
}

function requireTrip(tripId) {
  const trip = trips.get(tripId) || readStoredTrips()[tripId];
  if (!trip) {
    throw new ApiError("行程不存在或分享链接已失效", {
      kind: "http",
      status: 404,
      code: "TRIP_NOT_FOUND",
    });
  }
  trips.set(tripId, trip);
  return trip;
}

function contractBlocks() {
  return [
    {
      block_id: "b1",
      day: 1,
      date: "2026-11-07",
      time_slot: "11:30-12:00",
      activity: "广州某酒店 · 入住",
      location: "广州荔湾区",
      is_anchor: true,
      status: "anchored",
    },
    {
      block_id: "b2",
      day: 1,
      date: "2026-11-07",
      time_slot: "14:00-16:00",
      activity: "沙面岛户外游览",
      location: "广州荔湾区",
      is_anchor: false,
      status: "normal",
    },
    {
      block_id: "b4",
      day: 1,
      date: "2026-11-07",
      time_slot: "18:30-20:00",
      activity: "西关晚餐",
      location: "广州荔湾区上下九",
      is_anchor: false,
      status: "normal",
    },
  ];
}

function createTrip(input) {
  const tripId = input.trip_id || createTripId();
  const existing = trips.get(tripId);
  const trip = {
    trip_id: tripId,
    blocks: existing?.blocks || contractBlocks(),
  };
  persistTrip(trip);
  return clone(trip);
}

function parseOrder(input) {
  const trip = requireTrip(input.trip_id);
  const orderText = input.order_text || "";
  const isImage = Boolean(input.image_base64);
  const hasActivity = isImage || /(酒店|车票|门票|入住|订单)/.test(orderText);
  const hasDate = isImage || /\d{1,2}月\d{1,2}日/.test(orderText);
  const hasTime = isImage || /\d{1,2}[:：]\d{2}/.test(orderText);
  const hasLocation = isImage || /(地址|位于|路|街|区)/.test(orderText);

  if (!isImage && !hasActivity) {
    throw new ApiError("订单中未识别出活动名称，请补充后再确认", {
      kind: "http",
      status: 422,
      code: "ORDER_ACTIVITY_MISSING",
    });
  }

  const dateMatch = orderText.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
  const parsedDate = dateMatch
    ? `${dateMatch[1] || "2026"}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`
    : "待定";
  const timeMatch = orderText.match(/\d{1,2}[:：]\d{2}/);
  const parsedTime = timeMatch ? timeMatch[0].replace("：", ":") : "";
  const success = hasDate && hasTime && hasLocation;
  const block = {
    block_id: success ? "b1" : `pending-${Date.now()}`,
    day: 1,
    date: isImage ? "2026-11-07" : parsedDate,
    time_slot: isImage ? "15:00" : parsedTime,
    activity:
      isImage || /酒店/.test(orderText)
        ? "广州荔湾某酒店 · 入住"
        : "已确认订单",
    location: hasLocation
      ? /荔湾/.test(orderText)
        ? "广州市荔湾区恩宁路123号"
        : "广州"
      : "",
    is_anchor: success,
    status: success ? "anchored" : "normal",
  };

  trip.blocks = trip.blocks
    .filter((item) => item.block_id !== block.block_id)
    .concat(block)
    .sort((left, right) =>
      `${left.day}-${left.time_slot}`.localeCompare(
        `${right.day}-${right.time_slot}`,
      ),
    );
  persistTrip(trip);

  return {
    success,
    new_block: clone(block),
  };
}

function recompute(input) {
  const trip = requireTrip(input.trip_id);
  const anchor = trip.blocks.find((block) => block.block_id === "b1");
  const outdoor = trip.blocks.find((block) => block.block_id === "b2");
  const dinner = trip.blocks.find((block) => block.block_id === "b4");
  const changedIds = ["b2", "b3"];

  trip.blocks = [
    ...(anchor ? [anchor] : []),
    {
      ...(outdoor || {
        block_id: "b2",
        day: 1,
        date: "2026-11-07",
        time_slot: "14:00-16:00",
        activity: "沙面岛户外游览",
        location: "广州荔湾区",
        is_anchor: false,
      }),
      is_anchor: false,
      status: "affected",
    },
    {
      block_id: "b3",
      day: 1,
      date: outdoor?.date || "2026-11-07",
      time_slot: "14:00-16:00",
      activity: "永庆坊室内展馆 · 雨天替代",
      location: "广州荔湾区恩宁路",
      is_anchor: false,
      status: "candidate",
    },
    ...(dinner ? [dinner] : []),
  ].sort((left, right) =>
    `${left.day}-${left.time_slot}`.localeCompare(
      `${right.day}-${right.time_slot}`,
    ),
  );
  persistTrip(trip);

  return {
    changed_ids: changedIds,
    trip_state: clone(trip),
    message: "已完成局部重算",
  };
}

function search(input) {
  return [
    {
      title: "沙面岛游览攻略",
      url: "https://example.com/shamian",
      highlights: [`与“${input.query}”相关`, "适合傍晚散步", "骑楼建筑集中"],
      pitfalls: ["周末人多", "部分展馆周一闭馆"],
    },
  ];
}

export async function mockRequest(path, init) {
  await wait(220);
  const url = new URL(path, "http://mock.local");
  const method = (init?.method || "GET").toUpperCase();

  if (method === "GET" && url.pathname === "/health") {
    return { status: "ok" };
  }
  if (method === "POST" && url.pathname === "/api/init_trip") {
    return createTrip(readBody(init));
  }
  if (method === "POST" && url.pathname === "/api/search") {
    return search(readBody(init));
  }
  if (method === "POST" && url.pathname === "/api/parse_order") {
    return parseOrder(readBody(init));
  }
  if (method === "POST" && url.pathname === "/api/recompute") {
    return recompute(readBody(init));
  }
  if (method === "GET" && url.pathname.startsWith("/api/trip/")) {
    const tripId = decodeURIComponent(url.pathname.slice("/api/trip/".length));
    return clone(requireTrip(tripId));
  }

  throw new ApiError(`Mock 未实现接口：${method} ${url.pathname}`, {
    kind: "http",
    status: 404,
  });
}
