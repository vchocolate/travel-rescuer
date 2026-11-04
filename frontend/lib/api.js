import { ApiError } from "./errors";
import { mockRequest } from "./mock-api";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const DEFAULT_TIMEOUT_MS = 20_000;

function errorFromPayload(payload, status) {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : null;
  const detail = record?.detail;
  const validationMessage =
    Array.isArray(detail) && detail.length
      ? String(detail[0]?.msg || "").trim() || null
      : null;
  const message =
    (typeof detail === "string" && detail.trim()) ||
    validationMessage ||
    (typeof record?.error === "string" && record.error) ||
    (typeof record?.message === "string" && record.message) ||
    `请求失败（HTTP ${status}）`;

  return new ApiError(message, {
    kind: "http",
    status,
    code: typeof record?.code === "string" ? record.code : null,
    details: payload,
  });
}

async function request(path, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, body, signal, ...init } = options;
  const requestInit = {
    ...init,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  };

  if (USE_MOCK) return mockRequest(path, requestInit);

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();

  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestInit,
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload = null;

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        if (response.ok) {
          throw new ApiError("服务器返回了无法解析的数据", {
            kind: "invalid-response",
            status: response.status,
            details: raw,
          });
        }
        payload = { detail: raw };
      }
    }

    if (!response.ok) throw errorFromPayload(payload, response.status);
    if (!raw) {
      throw new ApiError("服务器返回了空响应", {
        kind: "invalid-response",
        status: response.status,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(timedOut ? "请求超时，请稍后重试" : "请求已取消", {
        kind: timedOut ? "timeout" : "aborted",
      });
    }
    throw new ApiError("无法连接服务器，请检查网络或后端地址", {
      kind: "network",
      details: error,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export const tripApi = {
  initTrip(input, signal) {
    return request("/api/init_trip", {
      method: "POST",
      body: input,
      signal,
      timeoutMs: 120_000,
    });
  },

  getTrip(tripId, signal) {
    return request(`/api/trip/${encodeURIComponent(tripId)}`, {
      method: "GET",
      signal,
      timeoutMs: 60_000,
    });
  },

  searchEvidence(input, signal) {
    return request("/api/search", {
      method: "POST",
      body: input,
      signal,
      timeoutMs: 180_000,
    });
  },

  parseOrder(input, signal) {
    return request("/api/parse_order", {
      method: "POST",
      body: input,
      signal,
      timeoutMs: 210_000,
    });
  },

  recomputeTrip(input, signal) {
    return request("/api/recompute", {
      method: "POST",
      body: {
        trip_id: input.trip_id,
        change_desc: input.change_desc,
      },
      signal,
      timeoutMs: 120_000,
    });
  },
};

export function checkHealth(signal) {
  return request("/health", { method: "GET", signal });
}
