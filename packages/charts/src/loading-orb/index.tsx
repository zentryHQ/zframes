import "./loading-orb.css";
import { cn } from "../lib/utils";

export const LoadingOrb = ({ className }: { className?: string }) => {
  return (
    <div className={cn("relative size-8", className)}>
      <div className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <div className="relative h-6 w-full">
          {Array.from({ length: 5 }).map((_, index) => {
            return (
              <div
                key={`strand1-${index}`}
                className="absolute size-1.5 rounded-full will-change-transform"
                style={{
                  left: `${(index / 6) * 100}%`,
                  animation: `dnaStrand1Move 2s infinite ease-in-out ${-index * 0.2}s, dnaStrand1Scale 2s infinite ease-in-out ${-index * 0.2}s, dnaStrand1Color 2s infinite ease-in-out ${-index * 0.2}s`,
                }}
              ></div>
            );
          })}

          {Array.from({ length: 5 }).map((_, index) => {
            return (
              <div
                key={`strand2-${index}`}
                className="absolute size-1.5 rounded-full"
                style={{
                  left: `${(index / 6) * 100}%`,
                  animation: `dnaStrand2Move 2s infinite ease-in-out ${-index * 0.2}s, dnaStrand2Scale 2s infinite ease-in-out ${-index * 0.2}s, dnaStrand2Color 2s infinite ease-in-out ${-index * 0.2}s`,
                }}
              ></div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
