import { isPending, splitTimeSlot } from "@/lib/timeline";
import StatusBadge, { STATUS, StatusIcon } from "./StatusBadge";

function BlockActionButton({
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  onClick,
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={onClick}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

export default function TimelineBlock({
  block,
  isChanged = false,
  isDemo = false,
  isUpdating = false,
  updatingAction = null,
  actionsDisabled = false,
  onAction,
}) {
  const config = STATUS[block.status] ?? STATUS.normal;
  const showActions = !isDemo && typeof onAction === "function";
  const actionsBusy = isUpdating || actionsDisabled;
  const { top, bottom } = splitTimeSlot(block.time_slot);
  const pending = isPending(block);
  // 契约 v0.7：date 缺失时后端返回「待定」，需要单独提示
  const datePending = !block.date || block.date.trim() === "待定";
  // 契约：锁定逻辑看 is_anchor；待确认的块即使 is_anchor 为真也不能显示成锚点
  const locked = block.is_anchor && !pending;

  return (
    <div className="relative flex gap-3 sm:gap-4">
      <div className="w-[4.75rem] shrink-0 pt-4 text-right text-[11px] font-semibold tabular-nums text-slate-500 sm:w-20">
        <span className="block break-words">{top}</span>
        {bottom ? <span className="block text-slate-400">{bottom}</span> : null}
      </div>

      <div className="relative flex w-4 shrink-0 justify-center">
        <span className="absolute inset-y-0 w-px bg-slate-200" />
        <span
          className={`z-10 mt-[21px] h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${
            pending ? "bg-slate-300" : config.dot
          }`}
        />
      </div>

      <div className="min-w-0 flex-1 pb-4">
        <div
          data-changed={isChanged || undefined}
          className={`rounded-xl border p-3.5 transition-shadow hover:shadow-md sm:p-4 ${
            pending ? "border-dashed border-slate-300 bg-slate-50" : `${config.card} ${config.effect}`
          } ${isChanged ? "ring-2 ring-sky-400 ring-offset-1" : ""}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {block.location || "地点待补充"}
              </p>
              <h3 className="mt-0.5 text-sm font-semibold leading-5 text-slate-900 sm:text-[15px]">
                {block.activity}
              </h3>
              {datePending && (
                <span className="mt-1 inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  日期待定
                </span>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {pending ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  待确认
                </span>
              ) : (
                <StatusBadge status={block.status} />
              )}

              {showActions && (
                <div className="flex flex-wrap justify-end gap-1">
                  {block.status === "normal" && (
                    <>
                      <BlockActionButton
                        label="🗑️ 删除"
                        loadingLabel="删除中…"
                        loading={isUpdating && updatingAction === "delete"}
                        disabled={actionsBusy}
                        onClick={() => onAction("delete")}
                      />
                      <BlockActionButton
                        label="🔒 锁定"
                        loadingLabel="锁定中…"
                        loading={isUpdating && updatingAction === "lock"}
                        disabled={actionsBusy}
                        onClick={() => onAction("lock")}
                      />
                    </>
                  )}
                  {block.status === "anchored" && (
                    <BlockActionButton
                      label="🔓 解锁"
                      loadingLabel="解锁中…"
                      loading={isUpdating && updatingAction === "unlock"}
                      disabled={actionsBusy}
                      onClick={() => onAction("unlock")}
                    />
                  )}
                  {block.status === "candidate" && (
                    <BlockActionButton
                      label="✅ 采用此方案"
                      loadingLabel="采用中…"
                      loading={
                        isUpdating && updatingAction === "confirm_replace"
                      }
                      disabled={actionsBusy}
                      onClick={() => onAction("confirm_replace")}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <p className={`mt-2 text-xs leading-5 ${pending ? "text-slate-500" : config.note}`}>
            {pending ? "缺少日期、时间或地点 · 确认后才会锁定为锚点" : config.hint}
          </p>

          {locked && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
              <StatusIcon status="anchored" className="h-3 w-3" />
              锚点 · 重算时不会被修改
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
