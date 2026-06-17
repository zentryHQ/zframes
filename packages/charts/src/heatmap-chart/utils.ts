import { HeatmapCell } from "./index";

/**
 * Default minimum relative threshold for filtering heatmap data.
 * Items with absolute values less than 5% of the maximum absolute value will be filtered out.
 */
export const DEFAULT_MIN_RELATIVE_THRESHOLD = 0.05;

/**
 * Filters heatmap data to remove cells with values that are too small relative to the largest.
 * Uses absolute values for comparison to handle both positive and negative values.
 *
 * @param data - Array of heatmap cells to filter
 * @param options - Configuration options
 * @param options.minRelativeThreshold - Minimum ratio relative to the largest absolute value (default: 0.05 = 5% of max)
 * @param options.getValue - Function to extract the numeric value from each item (default: item.value)
 * @returns Filtered array containing only cells above the threshold
 *
 * @example
 * // Basic usage with default options
 * const filtered = filterHeatmapData(data);
 *
 * @example
 * // Custom threshold - filter cells less than 10% of max
 * const filtered = filterHeatmapData(data, { minRelativeThreshold: 0.10 });
 *
 * @example
 * // Custom value getter for different data structures
 * const filtered = filterHeatmapData(data, { getValue: (item) => item.correlationScore });
 */
export function filterHeatmapData<T extends HeatmapCell>(
  data: T[],
  options: {
    minRelativeThreshold?: number;
    getValue?: (item: T) => number;
  } = {},
): T[] {
  const {
    minRelativeThreshold = DEFAULT_MIN_RELATIVE_THRESHOLD,
    getValue = (item: T) => item.value,
  } = options;

  if (data.length === 0) return [];

  const maxAbsValue = Math.max(...data.map((d) => Math.abs(getValue(d))));
  const threshold = maxAbsValue * minRelativeThreshold;

  return data.filter((item) => Math.abs(getValue(item)) >= threshold);
}

/**
 * Generates a grid of heatmap cells from row and column arrays with a value function.
 * Useful for creating correlation matrices or other grid-based data.
 *
 * @param rows - Array of row identifiers
 * @param columns - Array of column identifiers
 * @param getValue - Function to calculate the value for each cell given row and column
 * @returns Array of HeatmapCell objects
 *
 * @example
 * const data = generateHeatmapGrid(
 *   ['A', 'B', 'C'],
 *   ['X', 'Y', 'Z'],
 *   (row, col) => calculateCorrelation(row, col)
 * );
 */
export function generateHeatmapGrid<R, C>(
  rows: R[],
  columns: C[],
  getValue: (row: R, column: C) => number,
  options: {
    getRowId?: (row: R) => string;
    getColumnId?: (column: C) => string;
  } = {},
): HeatmapCell[] {
  const {
    getRowId = (row: R) => String(row),
    getColumnId = (column: C) => String(column),
  } = options;

  const cells: HeatmapCell[] = [];

  for (const row of rows) {
    for (const column of columns) {
      const rowId = getRowId(row);
      const columnId = getColumnId(column);

      cells.push({
        id: `${rowId}-${columnId}`,
        row: rowId,
        column: columnId,
        value: getValue(row, column),
      });
    }
  }

  return cells;
}

/**
 * Normalizes heatmap values to a 0-1 range or -1 to 1 range for diverging data.
 *
 * @param data - Array of heatmap cells
 * @param options - Configuration options
 * @param options.getValue - Function to extract the value (default: item.value)
 * @param options.diverging - Whether to normalize to -1 to 1 range (default: auto-detect based on negative values)
 * @returns New array with normalized values
 *
 * @example
 * const normalized = normalizeHeatmapValues(data);
 */
export function normalizeHeatmapValues<T extends HeatmapCell>(
  data: T[],
  options: {
    getValue?: (item: T) => number;
    diverging?: boolean;
  } = {},
): (T & { normalizedValue: number })[] {
  const { getValue = (item: T) => item.value } = options;

  if (data.length === 0) return [];

  const values = data.map(getValue);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const hasDiverging = options.diverging ?? minValue < 0;

  if (hasDiverging) {
    // Normalize to -1 to 1 range
    const absMax = Math.max(Math.abs(minValue), Math.abs(maxValue));
    if (absMax === 0) {
      return data.map((item) => ({ ...item, normalizedValue: 0 }));
    }
    return data.map((item) => ({
      ...item,
      normalizedValue: getValue(item) / absMax,
    }));
  } else {
    // Normalize to 0 to 1 range
    const range = maxValue - minValue;
    if (range === 0) {
      return data.map((item) => ({ ...item, normalizedValue: 1 }));
    }
    return data.map((item) => ({
      ...item,
      normalizedValue: (getValue(item) - minValue) / range,
    }));
  }
}

/**
 * Groups heatmap cells by row or column for aggregation operations.
 *
 * @param data - Array of heatmap cells
 * @param by - Whether to group by 'row' or 'column'
 * @returns Map of group key to array of cells
 *
 * @example
 * const byRow = groupHeatmapCells(data, 'row');
 * const rowATotals = byRow.get('A')?.reduce((sum, cell) => sum + cell.value, 0);
 */
export function groupHeatmapCells<T extends HeatmapCell>(
  data: T[],
  by: "row" | "column",
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const cell of data) {
    const key = by === "row" ? cell.row : cell.column;
    const existing = groups.get(key) || [];
    existing.push(cell);
    groups.set(key, existing);
  }

  return groups;
}
