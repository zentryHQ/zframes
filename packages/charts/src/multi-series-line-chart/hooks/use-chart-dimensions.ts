import { useState, useLayoutEffect, RefObject } from 'react';
import * as d3 from 'd3';
import { CHART_MARGIN, CHART_DEFAULTS } from '../constants';
import { parseMarketData } from '../../lib/format';
import type { ChartDimensions } from '../types';

interface UseChartDimensionsProps {
    width?: number;
    height?: number;
    yDomain: [number, number];
    formatValue?: (value: number) => string;
    containerRef: RefObject<HTMLDivElement | null>;
    svgRef: RefObject<SVGSVGElement | null>;
}

export const useChartDimensions = ({
    width,
    height = CHART_DEFAULTS.height,
    yDomain,
    formatValue,
    containerRef,
    svgRef,
}: UseChartDimensionsProps): ChartDimensions => {
    const [containerWidth, setContainerWidth] = useState<number | undefined>(
        width
    );

    useLayoutEffect(() => {
        const updateWidth = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setContainerWidth(rect.width);
            }
        };

        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, [containerRef]);

    const calculateYAxisWidth = (
        yScale: d3.ScaleLinear<number, number, never>
    ): number => {
        const svg = d3.select(svgRef.current);
        if (!svg.node()) return CHART_MARGIN.left;

        const tempText = svg
            .append('text')
            .style('font-size', `${CHART_DEFAULTS.fontSize}px`)
            .style('font-family', 'var(--font-dmsans)')
            .style('font-weight', '700')
            .style('visibility', 'hidden');

        const [minValue, maxValue] = yScale.domain();
        const tickValues: number[] = [];
        const numTicks = 5;

        for (let i = 0; i < numTicks; i++) {
            const value =
                minValue + ((maxValue - minValue) / (numTicks - 1)) * i;
            tickValues.push(value);
        }

        let maxWidth = 0;

        tickValues.forEach((tick) => {
            const formattedValue = formatValue
                ? formatValue(tick)
                : parseMarketData(tick);
            tempText.text(formattedValue);
            const width =
                (tempText.node() as SVGTextElement)?.getBBox().width || 0;
            maxWidth = Math.max(maxWidth, width);
        });

        tempText.remove();

        return Math.ceil(maxWidth) + CHART_DEFAULTS.yAxisPadding;
    };

    let effectiveWidth: number | null = containerWidth ?? null;
    if (!effectiveWidth && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0) {
            effectiveWidth = rect.width;
        }
    }
    effectiveWidth = effectiveWidth || width || null;

    const innerHeight = height - CHART_MARGIN.top - CHART_MARGIN.bottom;

    const tempYScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

    const dynamicLeftMargin =
        effectiveWidth && effectiveWidth > 0
            ? calculateYAxisWidth(tempYScale)
            : null;

    const innerWidth =
        effectiveWidth &&
        effectiveWidth > 0 &&
        dynamicLeftMargin &&
        dynamicLeftMargin > 0
            ? effectiveWidth -
              dynamicLeftMargin -
              (effectiveWidth > 640 ? CHART_MARGIN.right : 20)
            : null;

    return {
        width: effectiveWidth,
        height,
        innerWidth,
        innerHeight,
        dynamicLeftMargin,
    };
};
