import { formatDayDate, groupByDay } from "@/lib/timeline";
import TimelineBlock from "./TimelineBlock";
import { STATUS } from "./StatusBadge";

const LEGEND = ["normal", "anchored", "affected", "candidate"];

export default function Timeline({ blocks = [], changedIds = [] }) {
  const days = groupByDay(blocks);

  return (
    <section className="flex min-h-[600px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
      <div className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">动态时间轴</h2>
            <p className="text-[11px] text-slate-400">
              广州两日游 · 共 {blocks.length} 个行程块 · 演示数据
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {LEGEND.map((status) => (
              <span
                key={status}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS[status].dot}`} />
                {STATUS[status].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {days.length === 0 ? (
          <p className="py-12 text-center text-xs text-slate-400">
            暂无行程，先在左侧描述你的需求
          </p>
        ) : (
          <div className="space-y-6">
            {days.map(({ day, date, items }) => (
              <div key={day}>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-white">
                    DAY {day}
                  </span>
                  {date ? (
                    <span className="text-xs font-semibold text-slate-600">
                      {formatDayDate(date)}
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-400">{items.length} 个行程块</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div>
                  {items.map((block) => (
                    <TimelineBlock
                      key={block.block_id}
                      block={block}
                      isChanged={changedIds.includes(block.block_id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
