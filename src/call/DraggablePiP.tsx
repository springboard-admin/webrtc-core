import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { X, Video as VideoIcon } from "lucide-react";

interface DraggablePiPProps {
  children: ReactNode;
  /** Tailwind size classes for the tile, e.g. "w-28 sm:w-40 aspect-video". */
  sizeClassName: string;
  /** Margin from edges in px. */
  margin?: number;
  /** Stable storage key so position/dismissed state survive re-renders within a call. */
  storageId?: string;
  dismissible?: boolean;
}

/**
 * A floating, draggable, dismissible picture-in-picture tile. Keeps the video
 * element mounted (children are never remounted), so video refs stay stable.
 * Clamps within the viewport and re-clamps on resize/orientation change.
 */
export function DraggablePiP({
  children,
  sizeClassName,
  margin = 12,
  dismissible = true,
}: DraggablePiPProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const dragState = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  // Default to bottom-right, sitting above the controls bar.
  const placeDefault = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = window.innerWidth - r.width - margin;
    const y = window.innerHeight - r.height - margin - 76; // clear the controls bar
    setPos({ x: Math.max(margin, x), y: Math.max(margin, y) });
  }, [margin]);

  useEffect(() => {
    if (pos === null) placeDefault();
  }, [pos, placeDefault]);

  // Re-clamp inside the viewport on resize / orientation change.
  useEffect(() => {
    const onResize = () => {
      const el = boxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos((p) => {
        if (!p) return p;
        return {
          x: Math.min(Math.max(margin, p.x), window.innerWidth - r.width - margin),
          y: Math.min(Math.max(margin, p.y), window.innerHeight - r.height - margin),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [margin]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = boxRef.current;
    if (!el || !pos) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    const el = boxRef.current;
    if (!d || !el) return;
    d.moved = true;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(margin, e.clientX - d.dx), window.innerWidth - r.width - margin);
    const y = Math.min(Math.max(margin, e.clientY - d.dy), window.innerHeight - r.height - margin);
    setPos({ x, y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragState.current = null;
  };

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        style={{ left: pos?.x, top: pos?.y, position: "fixed" }}
        className="z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur hover:bg-black/80"
        title="Show video"
      >
        <VideoIcon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      ref={boxRef}
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        position: "fixed",
        visibility: pos ? "visible" : "hidden",
        touchAction: "none",
      }}
      className={`z-40 ${sizeClassName} overflow-hidden rounded-lg border-2 border-white/30 bg-black shadow-xl`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
      {dismissible && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          title="Hide video"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
