/**
 * Default minimum relative threshold for filtering treemap data.
 * Items with values less than 2% of the maximum value will be filtered out.
 */
export const DEFAULT_MIN_RELATIVE_THRESHOLD = 0.02;

/**
 * Filters treemap data to remove items that are too small relative to the largest item.
 * This prevents tiny, unreadable boxes from appearing in the treemap.
 *
 * @param data - Array of data items to filter
 * @param options - Configuration options
 * @param options.minRelativeThreshold - Minimum ratio relative to the largest value (default: 0.02 = 2% of max)
 * @param options.getValue - Function to extract the numeric value from each item (default: item.value)
 * @returns Filtered array containing only items above the threshold
 *
 * @example
 * // Basic usage with default options
 * const filtered = filterTreemapData(data);
 *
 * @example
 * // Custom threshold - filter items less than 5% of max
 * const filtered = filterTreemapData(data, { minRelativeThreshold: 0.05 });
 *
 * @example
 * // Custom value getter for different data structures
 * const filtered = filterTreemapData(data, { getValue: (item) => item.tvl });
 */
export function filterTreemapData<T>(
  data: T[],
  options: {
    minRelativeThreshold?: number;
    getValue?: (item: T) => number;
  } = {},
): T[] {
  const {
    minRelativeThreshold = DEFAULT_MIN_RELATIVE_THRESHOLD,
    getValue = (item: T) => (item as T & { value: number }).value,
  } = options;

  if (data.length === 0) return [];

  const maxValue = Math.max(...data.map(getValue));
  const threshold = maxValue * minRelativeThreshold;

  return data.filter((item) => getValue(item) >= threshold);
}
