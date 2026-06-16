class ZoneMapper:
    """
    Divides a video frame into a COLS x ROWS grid and maps each detection
    centroid to a cell index (0-based, row-major order).

    Cell layout for a 3x3 grid:
        0 | 1 | 2
        ---------
        3 | 4 | 5
        ---------
        6 | 7 | 8
    """

    def __init__(self, frame_width: int, frame_height: int, cols: int = 3, rows: int = 3):
        self.cols = cols
        self.rows = rows
        self._cell_w = frame_width / cols
        self._cell_h = frame_height / rows

    def get_cell(self, cx: float, cy: float) -> int:
        col = min(int(cx / self._cell_w), self.cols - 1)
        row = min(int(cy / self._cell_h), self.rows - 1)
        return row * self.cols + col

    def count_cells(self, detections: list[dict]) -> list[int]:
        """Return per-cell person counts (length = cols * rows)."""
        counts = [0] * (self.cols * self.rows)
        for det in detections:
            counts[self.get_cell(det["cx"], det["cy"])] += 1
        return counts
