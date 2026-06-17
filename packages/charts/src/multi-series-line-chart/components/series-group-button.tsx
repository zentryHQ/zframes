import React from "react";
import { cn } from "../../lib/utils";

interface SeriesGroupButtonProps {
  group: string;
  isVisible: boolean;
  onClick: () => void;
}

const SeriesGroupButtonComponent: React.FC<SeriesGroupButtonProps> = ({
  group,
  isVisible,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center justify-center gap-2 text-xs font-semibold",
        isVisible ? "text-white" : "text-white/30",
      )}
    >
      <div
        className={cn("h-3 w-3", isVisible ? "bg-white/80" : "bg-white/30")}
      />
      {group}
    </button>
  );
};

export const SeriesGroupButton = SeriesGroupButtonComponent;
