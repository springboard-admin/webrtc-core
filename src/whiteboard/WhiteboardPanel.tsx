import { lazy, Suspense, useCallback, useImperativeHandle, useRef, forwardRef, memo } from "react";
import { Button } from "../ui/button";
import { Download, Loader2 } from "lucide-react";
import "@excalidraw/excalidraw/index.css";
import { reconcileElements, restoreElements } from "@excalidraw/excalidraw";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw })),
);

export interface WhiteboardHandle {
  applyRemoteScene: (elements: any[], seq?: number) => void;
  applyRemotePointer: (p: { x: number; y: number; pointerId: string; button: "down" | "up" }) => void;
  getElementsSnapshot: () => any[];
  getVisibleElementsSnapshot: () => any[];
}

interface Props {
  onLocalChange: (elements: any[]) => void;
  onPointerUpdate?: (p: { x: number; y: number; button: "down" | "up" }) => void;
  /** Opaque role string for the remote collaborator's pointer label. */
  remoteRole: string;
  hideExport?: boolean;
}

const THROTTLE_MS = 30;
const ACTIVE_DRAW_THROTTLE_MS = 120;

const WhiteboardPanelInner = forwardRef<WhiteboardHandle, Props>(
  ({ onLocalChange, onPointerUpdate, remoteRole, hideExport }, ref) => {
    const apiRef = useRef<any>(null);
    const lastSentRef = useRef<number>(0);
    const pendingRef = useRef<any[] | null>(null);
    // Time (ms epoch) until which we treat onChange as a side-effect of a
    // remote-applied scene and should NOT re-emit it. Re-armed by each
    // applyRemoteSceneNow so bursts collapse into a single quiet window
    // instead of stacking up a counter that never drains.
    const suppressEmitUntilRef = useRef(0);
    const lastAppliedRemoteSigRef = useRef<string>("");
    const elementsRef = useRef<any[]>([]);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pointerDownRef = useRef(false);
    const localBusyElementIdRef = useRef<string | null>(null); // id of element currently being drawn/edited locally
    const lastRemoteSceneSeqRef = useRef(0);
    const lastQueuedLocalSigRef = useRef("");
    const didInitialCenterRef = useRef(false);
    const onLocalChangeRef = useRef(onLocalChange);
    const onPointerRef = useRef(onPointerUpdate);
    onLocalChangeRef.current = onLocalChange;
    onPointerRef.current = onPointerUpdate;

    const getSnapshot = useCallback(() => {
      const api = apiRef.current;
      if (api?.getSceneElementsIncludingDeleted) {
        return api.getSceneElementsIncludingDeleted() as any[];
      }
      return elementsRef.current;
    }, []);

    // Cheap signature of a scene: ids + versions. Used to detect that the
    // current onChange was triggered by our own updateScene(remote) and
    // should be ignored, without relying on timing windows.
    const sceneSignature = (els: readonly any[]) => {
      let s = "";
      for (const e of els) {
        if (!e) continue;
        s += e.id + ":" + (e.version ?? 0) + ":" + (e.isDeleted ? 1 : 0) + "|";
      }
      return s;
    };

    const flush = useCallback(() => {
      if (!pendingRef.current) return;
      lastSentRef.current = Date.now();
      const els = pendingRef.current;
      pendingRef.current = null;
      onLocalChangeRef.current(els);
    }, []);

    const handleChange = useCallback(
      (elements: readonly any[], appState?: any) => {
        elementsRef.current = getSnapshot() || (elements as any[]);
        // Track the id of any element being actively created/edited locally so
        // we can preserve it when merging remote updates (last-completed-edit-wins).
        const busy =
          appState?.editingTextElement?.id ||
          appState?.editingElement?.id ||
          appState?.newElement?.id ||
          null;
        localBusyElementIdRef.current = busy;
        // Skip emission if this onChange is the echo of a remote-applied scene.
        // We detect that by signature equality (cheap) and by a short time
        // window after applyRemoteSceneNow. Either alone is unreliable, but
        // together they collapse echoes without ever getting "stuck".
        const sig = sceneSignature(elementsRef.current);
        if (sig === lastAppliedRemoteSigRef.current) return;
        if (Date.now() < suppressEmitUntilRef.current) return;
        if (sig === lastQueuedLocalSigRef.current) return;
        pendingRef.current = elementsRef.current;
        lastQueuedLocalSigRef.current = sig;
        const now = Date.now();
        const dt = now - lastSentRef.current;
        const throttleMs = busy ? ACTIVE_DRAW_THROTTLE_MS : THROTTLE_MS;
        if (dt >= throttleMs) {
          flush();
        } else if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null;
            flush();
          }, throttleMs - dt);
        }
      },
      [flush, getSnapshot],
    );

    const handlePointer = useCallback((payload: any) => {
      const cb = onPointerRef.current;
      if (!payload?.pointer) return;
      const button: "down" | "up" = payload.button === "down" ? "down" : "up";
      pointerDownRef.current = button === "down";
      if (cb) cb({ x: payload.pointer.x, y: payload.pointer.y, button });
    }, []);

    const setApi = useCallback((a: any) => {
      apiRef.current = a;
    }, []);

    // Merge remote scene with any locally-in-progress element so the remote
    // update lands immediately without tearing down the local text editor or
    // an in-progress stroke. Last completed edit wins: once local commits,
    // the next onChange will send its version and overwrite remote.
    const applyRemoteSceneNow = useCallback((elements: any[], seq?: number) => {
      const a = apiRef.current;
      if (!a) return;
      if (typeof seq === "number") {
        if (seq <= lastRemoteSceneSeqRef.current) return;
        lastRemoteSceneSeqRef.current = seq;
      }
      const localEls = (getSnapshot() || []) as any[];
      const appState = a.getAppState?.();
      const restoredRemote = restoreElements(elements, localEls);
      let next = reconcileElements(localEls as any, restoredRemote as any, appState) as any[];
      const busyId = localBusyElementIdRef.current;
      if (busyId) {
        const localBusy = localEls.find((e: any) => e?.id === busyId);
        if (localBusy) {
          const filtered = next.filter((e: any) => e?.id !== busyId);
          next = [...filtered, localBusy];
        }
      }
      // Mark this scene as remote-originated for echo suppression in handleChange.
      lastAppliedRemoteSigRef.current = sceneSignature(next);
      // Belt-and-suspenders time window in case versions diverge after restore.
      suppressEmitUntilRef.current = Date.now() + 80;
      try {
        a.updateScene({ elements: next });
        elementsRef.current = next;
        // First time we receive real content, scroll/zoom the viewport to it so
        // it's centered — critical on mobile, where restored content otherwise
        // lands off-screen (the "Scroll back to content" blank-canvas case).
        if (!didInitialCenterRef.current) {
          const visible = next.filter((e: any) => e && !e.isDeleted);
          if (visible.length > 0) {
            didInitialCenterRef.current = true;
            try {
              a.scrollToContent(visible, { fitToContent: true, animate: false });
            } catch {
              try { a.scrollToContent(); } catch {}
            }
          }
        }
      } catch (err) {
        console.warn("[Whiteboard] updateScene failed", err);
      }
    }, [getSnapshot]);

    useImperativeHandle(ref, () => ({
      // Apply every remote scene immediately. Local in-progress element is
      // merged in by applyRemoteSceneNow so the editor/stroke is preserved.
      applyRemoteScene: (elements: any[], seq?: number) => {
        applyRemoteSceneNow(elements, seq);
      },
      applyRemotePointer: (p) => {
        const a = apiRef.current;
        if (!a) return;
        // Skip remote pointer updates only while the local user is mid-stroke
        // (pointer down) — that re-render can drop a freedraw stroke.
        // Text editing is safe because collaborators-only updates don't touch
        // the elements array.
        if (pointerDownRef.current) return;
        const collaborators = new Map();
        collaborators.set(remoteRole, {
          username: remoteRole,
          pointer: { x: p.x, y: p.y, tool: "pointer" },
          button: p.button,
        });
        try {
          a.updateScene({ collaborators });
        } catch {
          try { a.updateScene({ collaborators: Object.fromEntries(collaborators) as any }); } catch {}
        }
      },
      getElementsSnapshot: () => getSnapshot(),
      getVisibleElementsSnapshot: () => apiRef.current?.getSceneElements?.() || elementsRef.current.filter((e: any) => !e?.isDeleted),
    }), [remoteRole, applyRemoteSceneNow]);

    const handleExportPng = useCallback(async () => {
      const a = apiRef.current;
      if (!a) return;
      try {
        const { exportToBlob } = await import("@excalidraw/excalidraw");
        const elements = a.getSceneElements();
        const appState = a.getAppState();
        const files = a.getFiles();
        const blob = await exportToBlob({
          elements,
          mimeType: "image/png",
          appState: { ...appState, exportBackground: true, viewBackgroundColor: "#ffffff" },
          files,
        });
        const url = URL.createObjectURL(blob);
        const aEl = document.createElement("a");
        aEl.href = url;
        aEl.download = `whiteboard-${Date.now()}.png`;
        document.body.appendChild(aEl);
        aEl.click();
        aEl.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        console.error("Whiteboard PNG export failed:", err);
      }
    }, []);

    return (
      <div
        className="absolute inset-0 bg-background"
        style={{ touchAction: "none", userSelect: "none" }}
      >
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2 text-sm">Loading whiteboard…</span>
            </div>
          }
        >
          <Excalidraw
            excalidrawAPI={setApi}
            onChange={handleChange}
            onPointerUpdate={handlePointer}
            renderTopRightUI={() => null}
            UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, export: false } }}
          />
        </Suspense>
        {!hideExport && (
          <div className="absolute top-2 right-2 z-10 hidden sm:block">
            <Button size="sm" variant="secondary" onClick={handleExportPng} className="shadow-md">
              <Download className="h-4 w-4 mr-1" />
              Export PNG
            </Button>
          </div>
        )}
      </div>
    );
  },
);

WhiteboardPanelInner.displayName = "WhiteboardPanelInner";

export const WhiteboardPanel = memo(WhiteboardPanelInner);
