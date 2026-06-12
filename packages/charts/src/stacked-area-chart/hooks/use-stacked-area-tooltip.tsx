import { useState, useRef, useCallback, useEffect } from 'react';
import * as d3 from 'd3';
import type { CombinedStackedDataPoint } from '../types';
import { findClosestDataPoint } from '../utils';

export interface UseStackedAreaTooltipOptions {
    dates: Date[];
    combinedData: CombinedStackedDataPoint[];
    xScale: d3.ScaleTime<number, number> | null;
    innerWidth: number;
    innerHeight: number;
    marginLeft: number;
    marginTop: number;
    onDateHover?: (
        date: Date | null,
        values: CombinedStackedDataPoint | null
    ) => void;
}

export interface StackedAreaTooltipState {
    visible: boolean;
    x: number;
    date: Date | null;
    data: CombinedStackedDataPoint | null;
}

export function useStackedAreaTooltip({
    dates,
    combinedData,
    xScale,
    innerWidth,
    innerHeight,
    marginLeft,
    marginTop,
    onDateHover,
}: UseStackedAreaTooltipOptions) {
    const [tooltipState, setTooltipState] = useState<StackedAreaTooltipState>({
        visible: false,
        x: 0,
        date: null,
        data: null,
    });

    const containerRef = useRef<HTMLDivElement>(null);
    const verticalLineRef = useRef<SVGLineElement | null>(null);

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<SVGRectElement>) => {
            if (!xScale || dates.length === 0) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;

            const closest = findClosestDataPoint(mouseX, xScale, dates);

            if (closest) {
                const x = xScale(closest.date);
                const data = combinedData[closest.index] || null;

                setTooltipState({
                    visible: true,
                    x: x + marginLeft,
                    date: closest.date,
                    data,
                });

                onDateHover?.(closest.date, data);
            }
        },
        [xScale, dates, combinedData, marginLeft, onDateHover]
    );

    const handleMouseLeave = useCallback(() => {
        setTooltipState({
            visible: false,
            x: 0,
            date: null,
            data: null,
        });
        onDateHover?.(null, null);
    }, [onDateHover]);

    // Update vertical line when tooltip state changes
    useEffect(() => {
        if (verticalLineRef.current) {
            if (tooltipState.visible) {
                verticalLineRef.current.setAttribute(
                    'transform',
                    `translate(${tooltipState.x - marginLeft}, 0)`
                );
                verticalLineRef.current.setAttribute('opacity', '1');
            } else {
                verticalLineRef.current.setAttribute('opacity', '0');
            }
        }
    }, [tooltipState.visible, tooltipState.x, marginLeft]);

    return {
        tooltipState,
        containerRef,
        verticalLineRef,
        handleMouseMove,
        handleMouseLeave,
        innerWidth,
        innerHeight,
        marginLeft,
        marginTop,
    };
}
