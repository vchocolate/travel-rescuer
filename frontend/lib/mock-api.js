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
      time_slot: "11:30-12:00",
      activity: "广州某酒店 · 入住",
      location: "广州荔湾区",
      is_anchor: true,
      status: "anchored",
    },
    {
      block_id: "b2",
      day: 1,
      time_slot: "14:00-16:00",
      activity: "沙面岛户外游览",
      location: "广州荔湾区",
      is_anchor: false,
      status: "normal",
    },
    {
      block_id: "b4",
      day: 1,
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
  const hasDate = /\d{1,2}月\d{1,2}日/.test(input.order_text);
  const hasLocation = /(地址|位于|路|街|区)/.test(input.order_text);

  if (!input.order_text.trim() || !hasDate || !hasLocation) {
    throw new ApiError("订单缺少日期或地点，请补充后再确认", {
      kind: "http",
      status: 422,
      code: "ORDER_FIELD_MISSING",
    });
  }

  const block = {
    block_id: "b1",
    day: 1,
    time_slot: "15:00-16:00",
    activity: /酒店/.test(input.order_text) ? "入住广州某酒店" : "已确认订单",
    location: /荔湾/.test(input.order_text) ? "广州荔湾区" : "广州",
    is_anchor: true,
    status: "anchored",
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

  return clone(block);
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
    ...clone(trip),
    changed_ids: changedIds,
  };
}

function search(input) {
  requireTrip(input.trip_id);
  return [
    {
      title: "沙面岛游览攻略",
      url: "https://example.com/shamian",
      summary: `与“${input.query}”相关的示例证据：沙面岛适合傍晚散步，雨天可转入室内展馆。`,
      retrieved_at: "2026-11-04T07:00:00Z",
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
