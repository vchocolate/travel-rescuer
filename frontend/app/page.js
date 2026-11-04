"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useTripController } from "../hooks/useTripController";

const STATUS = {
  normal: {
    label: "正常",
    card: "border-slate-200 bg-white",
    badge: "border-slate-200 bg-slate-50 text-slate-600",
    dot: "bg-slate-300",
    icon: "text-slate-400",
    note: "text-slate-500",
    effect: "",
  },
  anchored: {
    label: "已锁定",
    card: "border-amber-200 bg-amber-50/80",
    badge: "border-amber-200 bg-amber-100 text-amber-800",
    dot: "bg-amber-400",
    icon: "text-amber-500",
    note: "text-amber-700",
    effect: "",
  },
  affected: {
    label: "受影响",
    card: "border-yellow-300 bg-yellow-50",
    badge: "border-yellow-300 bg-yellow-100 text-yellow-900",
    dot: "bg-yellow-400",
    icon: "text-yellow-600",
    note: "text-yellow-800",
    effect: "affected-breathe",
  },
  candidate: {
    label: "替代方案",
    card: "border-emerald-300 bg-emerald-50/70",
    badge: "border-emerald-200 bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    icon: "text-emerald-600",
    note: "text-emerald-700",
    effect: "candidate-slide",
  },
};

const initialChatMessages = [
  {
    role: "ai",
    text: "把旅行需求写在下面即可开始。生成行程后，可以继续测试订单、下雨重算和替代方案。",
  },
];

const fallbackBlocks = [
  {
    block_id: "demo-b1",
    day: 1,
    date: "2026-11-05",
    time_slot: "11:30-12:00",
    activity: "广州某酒店 · 入住",
    location: "广州荔湾区",
    is_anchor: true,
    status: "anchored",
  },
  {
    block_id: "demo-b2",
    day: 1,
    date: "2026-11-05",
    time_slot: "14:00-16:00",
    activity: "沙面岛户外游览",
    location: "广州荔湾区",
    is_anchor: false,
    status: "affected",
  },
  {
    block_id: "demo-b3",
    day: 1,
    date: "2026-11-05",
    time_slot: "14:00-16:00",
    activity: "永庆坊室内展馆",
    location: "广州荔湾区恩宁路",
    is_anchor: false,
    status: "candidate",
  },
  {
    block_id: "demo-b4",
    day: 2,
    date: "2026-11-06",
    time_slot: "09:30-11:00",
    activity: "陈家祠",
    location: "广州荔湾区中山七路",
    is_anchor: false,
    status: "normal",
  },
];

const legend = ["normal", "anchored", "affected", "candidate"];

const STATUS_NOTES = {
  normal: "可自由调整",
  anchored: "已锁定 · 订单确认后不参与重算",
  affected: "受变化影响 · 等待替代方案确认",
  candidate: "替代方案 · 建议替换受影响的行程块",
};

function toTimelineDays(blocks) {
  const groups = new Map();
  for (const block of blocks) {
    const dayBlocks = groups.get(block.day) || [];
    dayBlocks.push({
      id: block.block_id,
      time: block.time_slot.split("-")[0] || block.time_slot,
      timeSlot: block.time_slot,
      date: block.date || "待定",
      title: block.activity,
      location: block.location,
      status: block.status,
      note:
        !block.date ||
        block.date === "待定" ||
        !block.time_slot ||
        !block.location
          ? "待确认 · 订单日期、时间或地点不完整"
          : STATUS_NOTES[block.status] || "",
      isAnchor: block.is_anchor,
    });
    groups.set(block.day, dayBlocks);
  }

  return Array.from(groups.entries()).map(([day, dayBlocks]) => ({
    day: `DAY ${day}`,
    date:
      dayBlocks[0]?.date && dayBlocks[0].date !== "待定"
        ? dayBlocks[0].date
        : `第 ${day} 天 · 日期待定`,
    subtitle: "实时行程",
    blocks: dayBlocks,
  }));
}

function sourceName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "原始来源";
  }
}

function StatusIcon({ status, className }) {
  const shared = {
    className,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (status === "anchored") {
    return (
      <svg {...shared}>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  }

  if (status === "affected") {
    return (
      <svg {...shared}>
        <path d="M12 3 21 19H3L12 3Z" />
        <path d="M12 9v4" />
        <path d="M12 16.5h.01" />
      </svg>
    );
  }

  if (status === "candidate") {
    return (
      <svg {...shared}>
        <path d="M12 3.5 13.8 9 19 10.8 13.8 12.6 12 18.1 10.2 12.6 5 10.8 10.2 9 12 3.5Z" />
        <path d="M18.5 16.5v3" />
        <path d="M17 18h3" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function StatusBadge({ status }) {
  const config = STATUS[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.badge}`}
    >
      <StatusIcon status={status} className={`h-3.5 w-3.5 ${config.icon}`} />
      {config.label}
    </span>
  );
}

function EvidenceCard({ evidence }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 3h7l4 4v14H7V3Z" />
          <path d="M14 3v5h5" />
          <path d="M10 13h5" />
          <path d="M10 17h5" />
        </svg>
        证据卡
      </div>
      <p className="mt-1.5 text-sm font-semibold text-slate-800">
        {evidence.title}
      </p>
      <div className="mt-2 grid gap-2 text-xs leading-5">
        <div>
          <p className="font-semibold text-slate-700">亮点</p>
          <ul className="list-disc pl-4 text-slate-600">
            {(evidence.highlights || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-700">避坑</p>
          <ul className="list-disc pl-4 text-slate-600">
            {(evidence.pitfalls || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px]">
        <span className="truncate text-slate-500">
          来源：{sourceName(evidence.url)}
        </span>
        <a
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-teal-700"
          href={evidence.url}
          rel="noreferrer"
          target="_blank"
        >
          查看原文
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 17 17 7" />
            <path d="M9 7h8v8" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function ChatMessage({ message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-tr-md bg-slate-900 px-3.5 py-2.5 text-sm leading-6 text-white shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
        AI
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-700 shadow-sm">
        {message.text}
        {message.evidence?.map((item) => (
          <EvidenceCard key={item.url} evidence={item} />
        ))}
      </div>
    </div>
  );
}

function TimelineBlock({ block, affected }) {
  const config = STATUS[block.status];

  return (
    <div className="relative flex gap-3 sm:gap-4">
      <div className="w-11 shrink-0 pt-4 text-right text-[11px] font-semibold tabular-nums text-slate-500 sm:w-12">
        {block.time}
      </div>
      <div className="relative flex w-4 shrink-0 justify-center">
        <span className="absolute inset-y-0 w-px bg-slate-200" />
        <span
          className={`z-10 mt-[21px] h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${config.dot}`}
        />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div
          className={`rounded-xl border p-3.5 transition-shadow hover:shadow-md sm:p-4 ${config.card} ${config.effect} ${
            affected ? "ring-2 ring-slate-400 ring-offset-2" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {block.location}
              </p>
              <h3 className="mt-0.5 text-sm font-semibold leading-5 text-slate-900 sm:text-[15px]">
                {block.title}
              </h3>
            </div>
            <StatusBadge status={block.status} />
          </div>
          <p className={`mt-2 text-xs leading-5 ${config.note}`}>
            {block.note}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const controller = useTripController();
  const [messages, setMessages] = useState(initialChatMessages);
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const chatScrollRef = useRef(null);
  const orderFileRef = useRef(null);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, controller.error]);

  const timelineDays = useMemo(
    () =>
      toTimelineDays(controller.trip?.blocks || fallbackBlocks),
    [controller.trip],
  );
  const blockCount = controller.trip?.blocks.length ?? fallbackBlocks.length;
  const dayCount = controller.trip
    ? new Set(controller.trip.blocks.map((block) => block.day)).size
    : new Set(fallbackBlocks.map((block) => block.day)).size;
  const busyLabel =
    controller.busyAction === "initialize"
      ? "正在规划"
      : controller.busyAction === "parse-order"
        ? "正在解析订单"
        : controller.busyAction === "recompute"
          ? "正在重算"
          : controller.busyAction === "search"
            ? "正在检索"
            : controller.busyAction === "load"
              ? "正在恢复行程"
              : controller.trip
                ? "已自动保存"
                : "Mock 演示";

  async function submitMessage(value) {
    const text = value.trim();
    if (!text || controller.isBusy) return;

    setInput("");
    setMessages((current) => [...current, { role: "user", text }]);

    if (!controller.trip) {
      const nextTrip = await controller.initializeTrip(text);
      if (nextTrip) {
        setMessages([
          { role: "user", text },
          {
            role: "ai",
            text: `已生成共 ${nextTrip.blocks.length} 项安排，并保存为当前行程。你可以继续填写变化，或使用下方按钮处理订单与搜索。`,
          },
        ]);
      }
      return;
    }

    const result = await controller.recompute(text);
    if (result) {
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text:
            result.message ||
            (result.changed_ids.length
              ? "已经保留锚点并更新受影响的活动。变化项已在右侧突出显示。"
              : "已重新计算，但本次没有需要替换的行程项。"),
        },
      ]);
    }
  }

  async function submitOrderText(orderText) {
    if (!orderText.trim() || controller.isBusy || !controller.trip) return;
    setMessages((current) => [
      ...current,
      { role: "user", text: orderText },
    ]);
    const result = await controller.parseOrder({ orderText });
    const block = result?.new_block;
    if (result) {
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text:
            result.success && block
              ? `已识别「${block.activity}」并锁定为锚点。之后调整行程时，这一项不会被自动修改。`
              : "订单缺少日期、时间或地点，已加入行程并标记为待确认，不会误锁为锚点。",
        },
      ]);
    }
  }

  async function submitSearch(query) {
    if (!query.trim() || controller.isBusy || !controller.trip) return;
    setMessages((current) => [...current, { role: "user", text: query }]);
    const results = await controller.search(query);
    if (results?.length) {
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: `找到 ${results.length} 条证据，请查看来源后决定是否调整行程。`,
          evidence: results,
        },
      ]);
    } else if (results) {
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: "暂时没有找到可用证据，本次不会虚构攻略内容。",
        },
      ]);
    }
  }

  async function uploadOrderImage(file) {
    if (!file || controller.isBusy) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessages((current) => [
        ...current,
        { role: "ai", text: "订单图片超过 5MB，请压缩或换成更小的截图。" },
      ]);
      return;
    }

    setMessages((current) => [
      ...current,
      { role: "user", text: `上传订单截图：${file.name}` },
    ]);

    let dataUrl;
    try {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
    } catch {
      setMessages((current) => [
        ...current,
        { role: "ai", text: "图片读取失败，请重新选择订单截图。" },
      ]);
      return;
    }
    const imageBase64 = dataUrl.split(",")[1] || "";
    const result = await controller.parseOrder({
      imageBase64,
      imageMimeType: file.type,
    });
    if (result) {
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: result.success
            ? `已从截图中识别「${result.new_block.activity}」并锁定为锚点。`
            : "已读取截图，但时间或地点不完整，请在行程中确认后再使用。",
        },
      ]);
    }
  }

  async function copyShareLink() {
    if (!controller.shareUrl) {
      setMessages((current) => [
        ...current,
        { role: "ai", text: "请先生成或打开一份行程，再复制分享链接。" },
      ]);
      return;
    }

    try {
      await navigator.clipboard.writeText(controller.shareUrl);
      setCopied(true);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: `当前浏览器无法自动复制，请手动复制：${controller.shareUrl}`,
        },
      ]);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight text-slate-900">
                旅伴重构器
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Travel Rescuer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-sm font-semibold text-slate-700">
                {dayCount === 2 ? "广州两日游" : "广州行程"}
              </span>
              <span className="text-xs text-slate-400">
                {controller.trip ? `${dayCount} 天安排` : "11.05 — 11.06"}
              </span>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {busyLabel}
            </span>
            <button
              type="button"
              onClick={copyShareLink}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 sm:px-3"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 13a5 5 0 0 0 7.1.1l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7" />
                <path d="M14 11a5 5 0 0 0-7.1-.1l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7" />
              </svg>
              <span className="hidden sm:inline">
                {copied ? "已复制" : "复制链接"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1480px] grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:h-[calc(100vh-4rem)] lg:grid-cols-2 lg:gap-5 lg:py-5">
        <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">行程助手</h2>
                <p className="text-[11px] text-slate-400">
                  对话式规划 · 锚点保护
                </p>
              </div>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
              {busyLabel}
            </span>
          </div>

          <div
            ref={chatScrollRef}
            className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_55%)] p-4 sm:p-5"
          >
            {messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
            {controller.error ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800"
              >
                <p>{controller.error}</p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold underline"
                  onClick={controller.clearError}
                >
                  关闭提示
                </button>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap gap-1.5 px-1">
              <button
                type="button"
                disabled={!controller.trip || controller.isBusy}
                onClick={() =>
                  void submitOrderText(
                    "酒店已确认：11月5日15:00后入住广州某酒店，离店11月6日，地址广州荔湾区。",
                  )
                }
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                测试订单锚点
              </button>
              <button
                type="button"
                disabled={!controller.trip || controller.isBusy}
                onClick={() => orderFileRef.current?.click()}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                上传订单截图
              </button>
              <input
                ref={orderFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void uploadOrderImage(file);
                }}
              />
              <button
                type="button"
                disabled={!controller.trip || controller.isBusy}
                onClick={() => void submitMessage("下午下雨，调整户外安排")}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下午下雨了
              </button>
              <button
                type="button"
                disabled={!controller.trip || controller.isBusy}
                onClick={() => void submitSearch("沙面附近有哪些室内场馆推荐？")}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                查看替代方案
              </button>
            </div>
            <form
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm transition-shadow focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200"
              onSubmit={(event) => {
                event.preventDefault();
                void submitMessage(input);
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={controller.isBusy}
                placeholder={
                  controller.trip
                    ? "输入天气、交通或其他行程变化…"
                    : "先描述你的旅行需求…"
                }
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!input.trim() || controller.isBusy}
                aria-label="发送"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 19V5" />
                  <path d="m6 11 6-6 6 6" />
                </svg>
              </button>
            </form>
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-slate-400">
              <span>
                {controller.trip
                  ? "行程已保存 · 刷新或分享后仍可恢复"
                  : "示例模式 · 首次发送会创建行程"}
              </span>
              <span>{controller.isBusy ? busyLabel : "Enter 发送"}</span>
            </div>
          </div>
        </section>

        <section className="flex min-h-[600px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
          <div className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  动态时间轴
                </h2>
                <p className="text-[11px] text-slate-400">
                  广州行程 · 共 {blockCount} 个行程块
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {legend.map((status) => (
                  <span
                    key={status}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${STATUS[status].dot}`}
                    />
                    {STATUS[status].label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            <div className="space-y-6">
              {timelineDays.map((day) => (
                <div key={day.day}>
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-white">
                      {day.day}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">
                      {day.date}
                    </span>
                    <span className="text-xs text-slate-400">
                      {day.subtitle}
                    </span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div>
                    {day.blocks.map((block) => (
                      <TimelineBlock
                        key={block.id || block.title + block.time}
                        block={block}
                        affected={controller.lastChangedIds.includes(block.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
