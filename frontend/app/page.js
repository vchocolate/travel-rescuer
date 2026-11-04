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

const chatMessages = [
  {
    role: "user",
    text: "周末去广州，喜欢历史文化，不想去太赶的景点。",
  },
  {
    role: "ai",
    text: "已生成两日时间轴。先确认一下：11月5日入住广州某酒店，这个安排我已经锁定为锚点。",
    evidence: true,
  },
  {
    role: "user",
    text: "粘贴酒店确认文本",
  },
  {
    role: "ai",
    text: "已识别「广州某酒店」入住信息，并锁定为锚点。后续局部重算不会修改这个行程块。",
  },
  {
    role: "user",
    text: "下午下雨，调整户外安排",
  },
  {
    role: "ai",
    text: "收到。已保留锚点，14:00 的户外游览标记为受影响，并生成一个室内替代方案。",
  },
];

const timeline = [
  {
    day: "DAY 1",
    date: "11月5日",
    subtitle: "抵达 · 沙面",
    blocks: [
      {
        time: "11:30",
        title: "广州某酒店 · 入住",
        location: "荔湾区 · 已确认订单",
        status: "anchored",
        note: "已锁定 · 订单确认后不参与重算",
      },
      {
        time: "14:00",
        title: "沙面岛户外游览",
        location: "沙面岛",
        status: "affected",
        note: "降雨影响 14:00–16:00 · 等待替换确认",
      },
      {
        time: "14:00",
        title: "永庆坊室内展馆",
        location: "恩宁路",
        status: "candidate",
        note: "替代方案 · 建议替换受影响的户外块",
      },
      {
        time: "18:30",
        title: "西关晚餐",
        location: "上下九步行街",
        status: "normal",
        note: "已预留 1.5 小时 · 可自由调整",
      },
    ],
  },
  {
    day: "DAY 2",
    date: "11月6日",
    subtitle: "老城 · 文化",
    blocks: [
      {
        time: "09:30",
        title: "陈家祠",
        location: "中山七路",
        status: "normal",
        note: "建议游览 1.5 小时",
      },
      {
        time: "12:00",
        title: "老字号午餐",
        location: "荔湾区",
        status: "normal",
        note: "已预留 1 小时",
      },
      {
        time: "14:30",
        title: "北京路步行街",
        location: "越秀区",
        status: "normal",
        note: "自由活动 · 可随时调整",
      },
      {
        time: "18:00",
        title: "返程",
        location: "广州南站",
        status: "normal",
        note: "建议提前 1 小时出发",
      },
    ],
  },
];

const legend = ["normal", "anchored", "affected", "candidate"];

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

function EvidenceCard() {
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
        沙面攻略摘要
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        沙面岛适合傍晚散步，雨天可转入永庆坊室内展馆，沿街骑楼与展馆动线较短。
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px]">
        <span className="truncate text-slate-500">来源：广州文旅</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-teal-700">
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
        </span>
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
        {message.evidence ? <EvidenceCard /> : null}
      </div>
    </div>
  );
}

function TimelineBlock({ block }) {
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
          className={`rounded-xl border p-3.5 transition-shadow hover:shadow-md sm:p-4 ${config.card} ${config.effect}`}
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
                广州两日游
              </span>
              <span className="text-xs text-slate-400">11.05 — 11.06</span>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              已自动保存
            </span>
            <button
              type="button"
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
              <span className="hidden sm:inline">复制链接</span>
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
              Mock 演示
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_55%)] p-4 sm:p-5">
            {chatMessages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap gap-1.5 px-1">
              {["粘贴订单文本", "下午下雨了", "查看替代方案"].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm transition-shadow focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200">
              <input
                type="text"
                placeholder="继续输入变化或订单…"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                aria-label="发送"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-700"
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
              <span>演示数据 · 后续接入 /api/init_trip</span>
              <span>Enter 发送</span>
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
                  广州两日游 · 共 8 个行程块
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
              {timeline.map((day) => (
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
                      <TimelineBlock key={block.title + block.time} block={block} />
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
