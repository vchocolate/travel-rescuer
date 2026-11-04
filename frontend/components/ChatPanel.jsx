"use client";

import { useEffect, useRef } from "react";
import EvidenceCard from "./EvidenceCard";

const QUICK_ACTIONS = ["粘贴订单文本", "下午下雨了", "查看替代方案"];

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
        {message.evidence?.map((item, index) => (
          <EvidenceCard key={item.url ?? index} result={item} />
        ))}
      </div>
    </div>
  );
}

export default function ChatPanel({
  messages = [],
  value = "",
  onChange,
  onSend,
  onUpload,
  isLoading = false,
  error = "",
}) {
  const listRef = useRef(null);
  const fileRef = useRef(null);

  // 新消息或进入 loading 时滚到底部
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, isLoading]);

  const canSend = value.trim().length > 0 && !isLoading;

  const handleSend = () => {
    if (canSend) onSend?.(value);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (file) onUpload?.(file);
    event.target.value = "";
  };

  return (
    <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">行程助手</h2>
            <p className="text-[11px] text-slate-400">对话式规划 · 锚点保护</p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
          Mock 演示
        </span>
      </div>

      <div
        ref={listRef}
        className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_55%)] p-4 sm:p-5"
      >
        {messages.map((message, index) => (
          <ChatMessage key={message.id ?? index} message={message} />
        ))}

        {isLoading && (
          <div className="flex items-start gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
              AI
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {QUICK_ACTIONS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange?.(label)}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm transition-shadow focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            aria-label="上传图片"
            onClick={() => fileRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
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
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <input
            type="text"
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="继续输入变化或订单…"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            aria-label="发送"
            onClick={handleSend}
            disabled={!canSend}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-slate-400">
          <span>演示数据 · 后续接入 /api/chat</span>
          <span>Enter 发送</span>
        </div>
      </div>
    </section>
  );
}
