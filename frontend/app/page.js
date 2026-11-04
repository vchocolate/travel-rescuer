"use client";

import { useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import Timeline from "@/components/Timeline";
import { mockChangedIds, mockMessages, mockTrip } from "@/lib/mock";

const TRIP_TITLE = "广州两日游";

// 演示占位：真实回复由 B 的 /api/chat 返回，前端只负责渲染
const DEMO_REPLY = "（演示模式）已收到你的调整。接入 /api/chat 后，这里会返回受影响行程块与替代方案。";

export default function Home() {
  const [messages, setMessages] = useState(mockMessages);
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSend = (text) => {
    const content = text.trim();
    if (!content || isLoading) return;

    setError("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", text: content }]);
    setValue("");
    setIsLoading(true);

    window.setTimeout(() => {
      setMessages((prev) => [...prev, { id: `demo-${Date.now()}`, role: "ai", text: DEMO_REPLY }]);
      setIsLoading(false);
    }, 700);
  };

  const handleUpload = (file) => {
    if (!file.type.startsWith("image/")) {
      setError("只支持图片文件");
      return;
    }
    setError("");
    setMessages((prev) => [
      ...prev,
      { id: `upload-${Date.now()}`, role: "user", text: `已上传图片：${file.name}` },
    ]);
  };

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
              <p className="truncate text-sm font-bold tracking-tight text-slate-900">旅伴重构器</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Travel Rescuer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-sm font-semibold text-slate-700">{TRIP_TITLE}</span>
              <span className="text-xs text-slate-400">{mockTrip.trip_id.slice(0, 8)}</span>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              演示样例
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1480px] grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:h-[calc(100vh-4rem)] lg:grid-cols-2 lg:gap-5 lg:py-5">
        <ChatPanel
          messages={messages}
          value={value}
          onChange={setValue}
          onSend={handleSend}
          onUpload={handleUpload}
          isLoading={isLoading}
          error={error}
        />
        <Timeline
          blocks={mockTrip.blocks}
          changedIds={mockChangedIds}
          title={TRIP_TITLE}
          isDemo
          blockCount={mockTrip.blocks.length}
        />
      </main>
    </div>
  );
}
