// 时间轴相关的纯函数：不依赖 React，方便单独验证。

const RANGE = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/;

/**
 * time_slot 有两种形态（契约第 1 节）：
 *   1. 普通块 "14:00-16:00"
 *   2. 订单锚点 "2026年11月5日 15:00"
 * 统一拆成上下两行展示。
 */
export function splitTimeSlot(timeSlot = "") {
  const range = timeSlot.match(RANGE);
  if (range) return { top: range[1], bottom: range[2] };

  const parts = timeSlot.trim().split(/\s+/);
  if (parts.length > 1) {
    return { top: parts.slice(0, -1).join(" "), bottom: parts[parts.length - 1] };
  }
  return { top: timeSlot, bottom: "" };
}

// 排序依据：取第一个 HH:MM；解析不出来排到当天最后。
export function startMinutes(timeSlot = "") {
  const match = timeSlot.match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

// 契约 v0.7：日期缺失时后端统一返回「待定」，前端按无日期处理。
const PENDING = "待定";

// ISO 日期转「11月5日」；手动解析避免 new Date 的时区偏移。
export function formatDayDate(date) {
  const text = String(date ?? "").trim();
  if (!text || text === PENDING) return "";
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;
  return `${Number(match[2])}月${Number(match[3])}日`;
}

/** 按 day 分组、按开始时间排序；同一分钟保持后端返回顺序（affected 后紧跟 candidate）。 */
export function groupByDay(blocks = []) {
  const sorted = [...blocks].sort(
    (a, b) => a.day - b.day || startMinutes(a.time_slot) - startMinutes(b.time_slot),
  );

  const days = [];
  for (const block of sorted) {
    const last = days[days.length - 1];
    if (last && last.day === block.day) {
      last.items.push(block);
    } else {
      days.push({ day: block.day, date: block.date ?? "", items: [block] });
    }
  }
  return days;
}

/** parse_order 失败或时间/地点为空（或后端返回「待定」）时，不能当锚点，显示「待确认」。 */
export function isPending(block) {
  const time = block.time_slot?.trim() ?? "";
  const place = block.location?.trim() ?? "";
  return !time || !place || time === PENDING || place === PENDING;
}
