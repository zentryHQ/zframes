import * as d3 from 'd3';
import { findClosestDataPoint } from '../utils';
import { CHART_BREAKPOINTS, TOOLTIP, CHART_MARGIN } from '../constants';
import type { CombinedDataPoint, MultiSeriesData } from '../types';
import { parseMarketData } from '../../lib/format';

interface InteractionHandlers {
    onMouseMove: (event: MouseEvent | TouchEvent) => void;
    onMouseLeave: () => void;
}
interface createInteractionsProps {
    g: d3.Selection<SVGGElement, unknown, null, undefined>;
    containerWidth: number;
    innerWidth: number;
    innerHeight: number;
    xScale: d3.ScaleTime<number, number, never>;
    yScale: d3.ScaleLinear<number, number, never>;
    combinedData: CombinedDataPoint[];
    filteredSeries: MultiSeriesData[];
    tooltipRef: React.RefObject<HTMLDivElement | null>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    legendRef: React.RefObject<HTMLDivElement | null>;
    highestValue: number;
    formatValue?: (value: number) => string;
}

export const createInteractions = ({
    g,
    containerWidth,
    innerWidth,
    innerHeight,
    xScale,
    yScale,
    combinedData,
    filteredSeries,
    tooltipRef,
    containerRef,
    legendRef,
    highestValue,
    formatValue,
}: createInteractionsProps): InteractionHandlers => {
    const hoverLine = g
        .append('line')
        .attr('class', 'hover-line')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('stroke-opacity', 0.6)
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 0)
        .attr('y2', innerHeight)
        .attr('opacity', 0);

    const hoverDots = g.append('g').attr('class', 'hover-dots');

    let isFirstHover = true;
    let cachedContainerWidth =
        containerRef.current?.getBoundingClientRect().width || innerWidth;
    let cachedTooltipHeight = 0;
    let cachedTooltipWidth = 0;

    const updateHoverLine = (xPos: number) => {
        if (isFirstHover) {
            hoverLine.attr('x1', xPos - 0.75);
            hoverLine.attr('x2', xPos - 0.75);
            hoverLine
                .transition()
                .duration(150)
                .ease(d3.easeCubicOut)
                .attr('opacity', 1);
            isFirstHover = false;
        } else {
            hoverLine
                .transition()
                .duration(100)
                .ease(d3.easeLinear)
                .attr('x1', xPos - 0.75)
                .attr('x2', xPos - 0.75)
                .attr('opacity', 1);
        }
    };

    const updateHoverDots = (dataPoint: CombinedDataPoint, xPos: number) => {
        const existingGroups = hoverDots.selectAll('g.hover-circle-group');
        const groups = existingGroups.data(
            filteredSeries.filter((s) => dataPoint.values[s.id] !== undefined)
        );

        groups.exit().remove();

        const newGroups = groups
            .enter()
            .append('g')
            .attr('class', 'hover-circle-group')
            .style('opacity', 0);

        newGroups
            .append('image')
            .attr(
                'href',
                'https://cdn.guildfi.com/image/upload/v1753965058/Nexus/Nexus-SS2/icon/chart-knob.webp'
            )
            .attr('width', 32)
            .attr('height', 32)
            .attr('x', -16)
            .attr('y', -16);

        newGroups
            .attr('transform', (seriesData) => {
                const value = dataPoint.values[seriesData.id];
                return `translate(${xPos}, ${yScale(value)}) scale(0.5)`;
            })
            .style('opacity', 1)
            .transition()
            .duration(200)
            .ease(d3.easeBackOut)
            .attr('transform', (seriesData) => {
                const value = dataPoint.values[seriesData.id];
                return `translate(${xPos}, ${yScale(value)}) scale(1)`;
            });

        groups
            .transition()
            .duration(100)
            .ease(d3.easeLinear)
            .attr('transform', (seriesData) => {
                const value = dataPoint.values[seriesData.id];
                return `translate(${xPos}, ${yScale(value)})`;
            });
    };

    const calculateDesktopTooltipPosition = (
        mouseX: number,
        mouseY: number
    ) => {
        if (
            tooltipRef.current &&
            cachedTooltipHeight === 0 &&
            cachedTooltipWidth === 0
        ) {
            cachedTooltipHeight =
                tooltipRef.current.getBoundingClientRect().height;
            cachedTooltipWidth =
                tooltipRef.current.getBoundingClientRect().width;
        }

        let tooltipX = mouseX + TOOLTIP.offsetX;

        if (tooltipX + cachedTooltipWidth > cachedContainerWidth) {
            tooltipX = mouseX - cachedTooltipWidth;
        }

        if (tooltipX < 0) {
            tooltipX = 0;
        }

        return { x: tooltipX, y: mouseY - cachedTooltipHeight / 2 + 20 };
    };

    const calculateMobileTooltipPosition = (mouseX: number) => {
        const tooltipWidth = 130;

        let tooltipX = mouseX - tooltipWidth / 2 + CHART_MARGIN.left;

        const highestY = yScale(highestValue);
        if (
            mouseX + tooltipWidth / 2 >
            cachedContainerWidth - CHART_MARGIN.left
        ) {
            tooltipX = cachedContainerWidth - tooltipWidth;
        }

        if (tooltipX < 0) {
            tooltipX = 0;
        }
        return { x: tooltipX, y: highestY };
    };

    const updateDesktopTooltipContent = (
        date: string,
        values: { [key: string]: number }
    ) => {
        if (!tooltipRef.current) return;

        const dateElement = tooltipRef.current.querySelector(
            '[data-tooltip-date]'
        );

        if (dateElement && dateElement.textContent !== date) {
            dateElement.textContent = date;
        }

        filteredSeries.forEach((seriesData) => {
            const value = values[seriesData.id];
            if (value === undefined) return;

            const valueElement = tooltipRef.current?.querySelector(
                `[data-tooltip-value="${seriesData.id}"]`
            );

            const formattedValue = formatValue
                ? formatValue(value)
                : parseMarketData(value);
            if (valueElement && valueElement.textContent !== formattedValue) {
                valueElement.textContent = formattedValue;
            }
        });
    };

    const updateMobileTooltipContent = (date: string) => {
        if (!tooltipRef.current) return;

        const dateElement = tooltipRef.current.querySelector(
            '[data-tooltip-date]'
        );
        if (dateElement && dateElement.textContent !== date) {
            dateElement.textContent = date;
        }
    };

    const updateMobileLegendContent = (values: { [key: string]: number }) => {
        if (!legendRef.current) return;

        filteredSeries.forEach((seriesData) => {
            const value = values[seriesData.id];
            if (value === undefined) return;

            const valueElement = legendRef.current?.querySelector(
                `[data-legend-value="${seriesData.id}"]`
            );

            if (valueElement) {
                const formattedValue = formatValue
                    ? formatValue(value)
                    : parseMarketData(value);
                valueElement.textContent = formattedValue;
            }
        });
    };

    const updateTooltipsStyles = (x: number, y: number) => {
        if (tooltipRef.current) {
            tooltipRef.current.style.opacity = '1';
            tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
    };

    const handleMouseMove = (event: MouseEvent | TouchEvent) => {
        const isTouchEvent = window.TouchEvent && event instanceof TouchEvent;
        const expectedEvent = isTouchEvent ? event.touches[0] : event;
        const [mouseX, mouseY] = d3.pointer(expectedEvent, g.node());

        const dataPoint = findClosestDataPoint(mouseX, xScale, combinedData);
        if (!dataPoint) return;

        const xPos = xScale(dataPoint.date);

        const formattedDate = d3.timeFormat('%b %d, %Y - %H:%M')(
            dataPoint.date
        );

        if (containerWidth > CHART_BREAKPOINTS.sm) {
            const desktopTooltipPosition = calculateDesktopTooltipPosition(
                mouseX,
                mouseY
            );

            updateTooltipsStyles(
                desktopTooltipPosition.x,
                desktopTooltipPosition.y
            );

            updateDesktopTooltipContent(formattedDate, dataPoint.values);
        } else {
            const mobileTooltipPosition =
                calculateMobileTooltipPosition(mouseX);

            updateTooltipsStyles(
                mobileTooltipPosition.x,
                mobileTooltipPosition.y
            );

            updateMobileTooltipContent(formattedDate);
            updateMobileLegendContent(dataPoint.values);
        }

        updateHoverLine(xPos);
        updateHoverDots(dataPoint, xPos);
    };

    const handleMouseLeave = () => {
        hoverLine
            .transition()
            .duration(150)
            .ease(d3.easeCubicOut)
            .attr('opacity', 0);
        isFirstHover = true;

        if (tooltipRef.current) {
            tooltipRef.current.style.opacity = '0';
        }

        hoverDots
            .selectAll('g')
            .transition()
            .duration(150)
            .ease(d3.easeBackIn)
            .style('opacity', 0)
            .attr('transform', (d, i, nodes) => {
                const g = d3.select(nodes[i]);
                const transform = g.attr('transform');
                const match = transform.match(
                    /translate\(([^,]+),\s*([^)]+)\)/
                );
                if (match) {
                    const x = parseFloat(match[1]);
                    const y = parseFloat(match[2]);
                    return `translate(${x}, ${y}) scale(0.3)`;
                }
                return transform;
            })
            .remove();
    };

    const resizeObserver = new ResizeObserver(() => {
        if (containerRef.current) {
            cachedContainerWidth =
                containerRef.current.getBoundingClientRect().width;
        }
    });

    if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
    }

    return {
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
    };
};
