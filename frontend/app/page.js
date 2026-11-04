"use client";

import { useState } from "react";

import ChatPanel from "@/components/ChatPanel";
import Timeline from "@/components/Timeline";
import { useTripController } from "@/hooks/useTripController";
import { mockTrip } from "@/lib/mock";

const INITIAL_MESSAGES = [
  {
    id: "welcome",
    role: "ai",
    text: "把旅行需求写在下面即可开始。生成行程后，可以继续测试订单、下雨重算和替代方案。",
  },
];

const ORDER_RE = /(酒店|入住|离店|订单|车票|门票|航班|确认)/;
const DISRUPTION_RE = /(雨|下雨|天气|台风|变化|影响|调整|改)/;

function extractDestination(blocks) {
  const counts = new Map();
  for (const block of blocks) {
    const location = block.location?.trim();
    if (!location) continue;
    const match =
      location.match(/^([\u4e00-\u9fa5]{2,4}?)(?:市|·|\s)/) ||
      location.match(/^([\u4e00-\u9fa5]{2})/);
    const city = match?.[1];
    if (city) counts.set(city, (counts.get(city) || 0) + 1);
  }
  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ||
    ""
  );
}

let messageSequence = 0;

function nextMessageId() {
  messageSequence += 1;
  return `local-${Date.now()}-${messageSequence}`;
}

export default function Home() {
  const controller = useTripController();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [showDemo, setShowDemo] = useState(true);

  const displayBlocks =
    controller.trip?.blocks ?? (showDemo ? mockTrip.blocks : []);
  const isDemo = !controller.trip && showDemo;
  const dayCount = displayBlocks.length
    ? Math.max(...displayBlocks.map((block) => block.day))
    : 0;
  const destination = extractDestination(displayBlocks);
  const tripTitle =
    destination && dayCount > 0
      ? `${destination}${dayCount === 2 ? "两" : dayCount}日游`
      : "未命名行程";

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
              : "处理中";

  const statusLabel = controller.isBusy
    ? busyLabel
    : controller.trip
      ? "已自动保存"
      : isDemo
        ? "演示样例"
        : "未开始";

  const footerText = controller.trip
    ? "行程已保存 · 刷新或分享后仍可恢复"
    : isDemo
      ? "演示样例 · 首次发送会创建真实行程"
      : "输入需求开始规划";

  const placeholder = controller.trip
    ? "输入变化、订单或攻略问题…"
    : isDemo
      ? "先描述你的旅行需求…"
      : "描述目的地和日期，开始新行程…";

  const appendMessage = (message) => {
    setMessages((current) => [
      ...current,
      { id: nextMessageId(), ...message },
    ]);
  };

  async function submitOrderText(orderText) {
    if (!orderText.trim() || controller.isBusy || !controller.trip) return;

    appendMessage({ role: "user", text: orderText });
    const result = await controller.parseOrder({ orderText });
    const block = result?.new_block;
    if (!result) return;

    appendMessage({
      role: "ai",
      text:
        result.success && block
          ? `已识别「${block.activity}」并锁定为锚点。之后调整行程时，这一项不会被自动修改。`
          : "订单缺少日期、时间或地点，已加入行程并标记为待确认，不会误锁为锚点。",
    });
  }

  async function submitSearch(query) {
    if (!query.trim() || controller.isBusy || !controller.trip) return;

    appendMessage({ role: "user", text: query });
    const results = await controller.search(query);
    if (results?.length) {
      appendMessage({
        role: "ai",
        text: `找到 ${results.length} 条证据，请查看来源后决定是否调整行程。`,
        evidence: results,
      });
    } else if (results) {
      appendMessage({
        role: "ai",
        text: "暂时没有找到可用证据，本次不会虚构攻略内容。",
      });
    }
  }

  async function submitRecompute(change) {
    if (!change.trim() || controller.isBusy || !controller.trip) return;

    appendMessage({ role: "user", text: change });
    const result = await controller.recompute(change);
    if (!result) return;

    appendMessage({
      role: "ai",
      text:
        result.message ||
        (result.changed_ids.length
          ? "已经保留锚点并更新受影响的活动。变化项已在右侧突出显示。"
          : "已重新计算，但本次没有需要替换的行程项。"),
    });
  }

  async function submitMessage(value) {
    const text = value.trim();
    if (!text || controller.isBusy) return;

    setInput("");

    if (!controller.trip) {
      appendMessage({ role: "user", text });
      const nextTrip = await controller.initializeTrip(text);
      if (nextTrip) {
        appendMessage({
          role: "ai",
          text: `已生成共 ${nextTrip.blocks.length} 项安排，并保存为当前行程。你可以继续填写变化，或使用下方按钮处理订单与搜索。`,
        });
      }
      return;
    }

    if (ORDER_RE.test(text)) {
      await submitOrderText(text);
      return;
    }

    if (DISRUPTION_RE.test(text)) {
      await submitRecompute(text);
      return;
    }

    await submitSearch(text);
  }

  async function uploadOrderImage(file) {
    if (!file || controller.isBusy) return;

    if (!controller.trip) {
      appendMessage({
        role: "ai",
        text: "请先创建或打开一份行程，再上传订单截图。",
      });
      return;
    }

    if (!file.type.startsWith("image/")) {
      appendMessage({ role: "ai", text: "只支持图片格式的订单截图。" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      appendMessage({
        role: "ai",
        text: "订单图片超过 5MB，请压缩或换成更小的截图。",
      });
      return;
    }

    let dataUrl;
    try {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
    } catch {
      appendMessage({
        role: "ai",
        text: "图片读取失败，请重新选择订单截图。",
      });
      return;
    }

    appendMessage({
      role: "user",
      text: `上传订单截图：${file.name}`,
      image: dataUrl,
    });

    const result = await controller.parseOrderImage(dataUrl);
    if (!result) return;

    appendMessage({
      role: "ai",
      text: result.success
        ? `已从截图中识别「${result.new_block.activity}」并锁定为锚点。`
        : "已读取截图，但日期、时间或地点不完整，请在行程中确认后再使用。",
    });
  }

  async function copyShareLink() {
    if (!controller.shareUrl) {
      appendMessage({
        role: "ai",
        text: "请先生成或打开一份行程，再复制分享链接。",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(controller.shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      appendMessage({
        role: "ai",
        text: `当前浏览器无法自动复制，请手动复制：${controller.shareUrl}`,
      });
    }
  }

  function buildSampleOrder() {
    const dayOne = displayBlocks.find(
      (block) => block.day === 1 && block.date && block.date !== "待定",
    );
    const date = dayOne?.date ?? "待定";
    const city = destination || "广州";
    return `酒店已确认：入住日期 ${date}，15:00后入住${city}某酒店，地址${city}荔湾区。`;
  }

  function handleNewTrip() {
    controller.resetTrip();
    setMessages(INITIAL_MESSAGES);
    setInput("");
    setCopied(false);
    setShowDemo(false);
  }

  const quickActions = controller.trip
    ? [
        {
          label: "测试订单锚点",
          onClick: () => void submitOrderText(buildSampleOrder()),
        },
        {
          label: "下午下雨了",
          onClick: () => void submitRecompute("下午下雨，调整户外安排"),
        },
        {
          label: "查看替代方案",
          onClick: () => void submitSearch("沙面附近有哪些室内场馆推荐？"),
        },
      ]
    : [];

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
                {tripTitle}
              </span>
              <span className="text-xs text-slate-400">
                {isDemo
                  ? "演示样例"
                  : dayCount > 0
                    ? `${dayCount} 天安排`
                    : "尚未创建"}
              </span>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={handleNewTrip}
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
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="hidden sm:inline">新建行程</span>
            </button>
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
        <ChatPanel
          messages={messages}
          value={input}
          onChange={setInput}
          onSubmit={submitMessage}
          onUpload={uploadOrderImage}
          quickActions={quickActions}
          isLoading={controller.isBusy}
          error={controller.error || ""}
          onClearError={controller.clearError}
          statusLabel={statusLabel}
          footerText={footerText}
          placeholder={placeholder}
        />
        <Timeline
          blocks={displayBlocks}
          changedIds={controller.lastChangedIds}
          title={tripTitle}
          isDemo={isDemo}
          blockCount={displayBlocks.length}
        />
      </main>
    </div>
  );
}
