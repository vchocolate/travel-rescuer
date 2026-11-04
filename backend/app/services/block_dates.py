from datetime import date


def trip_has_date(value: str | None, blocks) -> bool:
    if not value:
        return False
    return any(getattr(block, "date", None) == value for block in blocks)


def resolve_day(value: str | None, blocks, fallback: int | None = None) -> int:
    fallback_day = fallback if fallback and fallback >= 1 else 1

    if value:
        for block in blocks:
            if getattr(block, "date", None) == value:
                return block.day

    valid_dates: list[date] = []
    for block in blocks:
        raw = getattr(block, "date", None)
        if not raw:
            continue
        try:
            valid_dates.append(date.fromisoformat(raw))
        except ValueError:
            continue

    if value and valid_dates:
        try:
            target = date.fromisoformat(value)
        except ValueError:
            return fallback_day
        base = min(valid_dates)
        return max(1, (target - base).days + 1)

    return fallback_day
