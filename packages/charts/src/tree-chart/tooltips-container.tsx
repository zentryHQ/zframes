import React from 'react';

export const TooltipsContainer = ({
    children,
    tooltipRef,
    wrapperRef,
}: {
    tooltipRef: React.RefObject<HTMLDivElement | null>;
    wrapperRef: React.RefObject<HTMLDivElement | null>;
    children?: React.ReactNode;
}) => {
    return (
        <div
            ref={tooltipRef}
            className="pointer-events-none absolute left-0 top-0 z-50"
        >
            <div ref={wrapperRef} className="rounded-md bg-slate-700">
                {children}
            </div>
        </div>
    );
};
