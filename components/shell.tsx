"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// The one layout every analysis renders into. Column positions and widths are
// controlled here, including the bounded, resizable detail column.
// The detail pane is a real column, not an overlay, so resizing it never
// covers the map.
export function Shell({ rail, map, detail, compact = false, showDetail = true }: { rail?: ReactNode; map?: ReactNode; detail?: ReactNode; compact?: boolean; showDetail?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [detailWidth, setDetailWidth] = useState(304);
  const [maximumWidth, setMaximumWidth] = useState(650);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === 0) return;
      const maximum = Math.max(280, Math.floor(entry.contentRect.width * 0.65));
      setMaximumWidth(maximum);
      setDetailWidth((width) => Math.max(280, Math.min(width, maximum)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const resize = (width: number) => setDetailWidth(Math.max(280, Math.min(width, maximumWidth)));
  return (
    <div ref={container} className="relative grid h-full min-h-0 flex-1" style={{ gridTemplateColumns: compact ? showDetail ? `minmax(0,1fr) min(${detailWidth}px,65%)` : "minmax(0,1fr)" : `11rem minmax(0,1fr) min(${detailWidth}px,65%)` }}>
      <nav aria-label="Categories" className={compact ? showDetail ? "category-disclosure" : "hidden" : "min-h-0 overflow-y-auto border-r border-line bg-surface"}>
        {compact ? <details><summary>Categories</summary><div className="category-menu">{rail}</div></details> : rail}
      </nav>
      <section aria-label="Workspace" className="relative min-h-0 min-w-0 bg-canvas">
        {map}
      </section>
      <aside aria-label="Details" className={showDetail ? "relative min-h-0 min-w-0 border-l border-line bg-surface" : "hidden"}>
        <div role="separator" aria-label="Resize details panel" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={maximumWidth} aria-valuenow={Math.round(detailWidth)} tabIndex={0} className="details-resize-handle"
          onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, width: event.currentTarget.parentElement?.getBoundingClientRect().width ?? detailWidth }; }}
          onPointerMove={(event) => { if (drag.current) resize(drag.current.width + drag.current.x - event.clientX); }}
          onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onLostPointerCapture={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resize(detailWidth + (event.key === "ArrowLeft" ? 24 : -24)); } }}
        />
        <div className="h-full min-w-0 overflow-y-auto">{detail}</div>
      </aside>
    </div>
  );
}
