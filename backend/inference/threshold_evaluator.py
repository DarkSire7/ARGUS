def _severity(count: int, warning: int, critical: int) -> str:
    if count >= critical:
        return "critical"
    if count >= warning:
        return "warning"
    return "green"


def evaluate(
    cell_counts: list[int],
    thresholds: list[dict],
) -> tuple[list[dict], list[dict]]:
    """
    Compare per-cell counts against warning/critical thresholds.

    Returns:
        cells   — all 9 cell status dicts (cellIndex, count, severity)
        breaches — only cells at warning or critical level, with thresholdValue added
    """
    cells: list[dict] = []
    breaches: list[dict] = []

    for i, (count, t) in enumerate(zip(cell_counts, thresholds)):
        sev = _severity(count, t["warning"], t["critical"])
        cell = {"cellIndex": i, "count": count, "severity": sev}
        cells.append(cell)

        if sev in ("warning", "critical"):
            threshold_val = t["critical"] if sev == "critical" else t["warning"]
            breaches.append({**cell, "thresholdValue": threshold_val})

    return cells, breaches
