// 证据卡：字段来自 POST /api/search 的 SearchResponse。
// 亮点（highlights）与避坑（pitfalls）都是数组，必须能点开原文链接。

export default function EvidenceCard({ result }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">
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
        </span>
        <span className="text-[11px] font-semibold text-slate-700">{result.title}</span>
        <a
          href={result.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-800"
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

      {result.highlights?.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10px] font-bold tracking-[0.1em] text-emerald-700">核心要点</p>
          <ul className="mt-1 space-y-1">
            {result.highlights.map((item) => (
              <li key={item} className="flex gap-1.5 text-xs leading-5 text-slate-700">
                <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.pitfalls?.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10px] font-bold tracking-[0.1em] text-amber-700">提醒</p>
          <ul className="mt-1 space-y-1">
            {result.pitfalls.map((item) => (
              <li key={item} className="flex gap-1.5 text-xs leading-5 text-slate-700">
                <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
