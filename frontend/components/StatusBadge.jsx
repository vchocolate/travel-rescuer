// 四种状态的视觉配置与徽标。改颜色只动这张表，别去改组件里散落的类名。

export const STATUS = {
  normal: {
    label: "正常",
    card: "border-slate-200 bg-white",
    badge: "border-slate-200 bg-slate-50 text-slate-600",
    dot: "bg-slate-300",
    icon: "text-slate-400",
    note: "text-slate-500",
    effect: "",
    hint: "常规行程 · 可自由调整",
  },
  anchored: {
    label: "已锁定",
    card: "border-amber-200 bg-amber-50/80",
    badge: "border-amber-200 bg-amber-100 text-amber-800",
    dot: "bg-amber-400",
    icon: "text-amber-500",
    note: "text-amber-700",
    effect: "",
    hint: "已锁定 · 订单确认后不参与重算",
  },
  affected: {
    label: "受影响",
    card: "border-yellow-300 bg-yellow-50",
    badge: "border-yellow-300 bg-yellow-100 text-yellow-900",
    dot: "bg-yellow-400",
    icon: "text-yellow-600",
    note: "text-yellow-800",
    effect: "affected-breathe",
    hint: "受降雨影响 · 等待替换确认",
  },
  candidate: {
    label: "替代方案",
    card: "border-emerald-300 bg-emerald-50/70",
    badge: "border-emerald-200 bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    icon: "text-emerald-600",
    note: "text-emerald-700",
    effect: "candidate-slide",
    hint: "系统给出的替代方案 · 待你确认",
  },
};

export function StatusIcon({ status, className }) {
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

export default function StatusBadge({ status }) {
  const config = STATUS[status] ?? STATUS.normal;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.badge}`}
    >
      <StatusIcon status={status} className={`h-3.5 w-3.5 ${config.icon}`} />
      {config.label}
    </span>
  );
}
