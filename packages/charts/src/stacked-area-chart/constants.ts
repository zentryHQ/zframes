export const CHART_MARGIN = {
  top: 20,
  right: 20,
  bottom: 40,
  left: 50,
};

export const CHART_DEFAULTS = {
  height: 400,
  animationDuration: 800,
};

export const GRID = {
  ticks: 6,
  opacity: 0.05,
  color: "#FFFFFF",
};

export const AXIS = {
  xTicks: 5,
  yTicks: 5,
  tickSize: 6,
  tickColor: "#404146",
  domainColor: "#FFFFFF",
  domainOpacity: 0.05,
  textOpacity: 0.5,
  fontSize: 12,
};

/**
 * Default color palette for stacked areas
 * Uses the standard multi-series palette from chart-utils for consistency
 */
export { CHART_COLORS_MULTI_SERIES as STACKED_AREA_COLORS } from "../chart-utils";

/**
 * Area styling
 */
export const AREA = {
  opacity: 0.8,
  hoverOpacity: 1,
  dimmedOpacity: 0.3,
  strokeWidth: 1,
  strokeOpacity: 0.5,
};
