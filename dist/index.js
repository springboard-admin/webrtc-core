import * as React5 from 'react';
import { lazy, forwardRef, useRef, useCallback, useImperativeHandle, Suspense, memo, useState, useEffect } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsx, jsxs } from 'react/jsx-runtime';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { X, Loader2, Download, ChevronDown, ChevronUp, Check, Send, VideoOff, Wifi, MicOff, Mic, Video, MonitorOff, Monitor, SquarePen, PhoneOff, MessageSquare, Settings, Tablet, Minimize2, Maximize2, MoreVertical, Copy } from 'lucide-react';
import '@excalidraw/excalidraw/index.css';
import { restoreElements, reconcileElements } from '@excalidraw/excalidraw';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as LabelPrimitive from '@radix-ui/react-label';
import { QRCodeSVG } from 'qrcode.react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
var buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
var Button = React5.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return /* @__PURE__ */ jsx(Comp, { className: cn(buttonVariants({ variant, size, className })), ref, ...props });
  }
);
Button.displayName = "Button";
var TOAST_LIMIT = 1;
var TOAST_REMOVE_DELAY = 1e6;
var count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}
var toastTimeouts = /* @__PURE__ */ new Map();
var addToRemoveQueue = (toastId) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId
    });
  }, TOAST_REMOVE_DELAY);
  toastTimeouts.set(toastId, timeout);
};
var reducer = (state, action) => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT)
      };
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) => t.id === action.toast.id ? { ...t, ...action.toast } : t)
      };
    case "DISMISS_TOAST": {
      const { toastId } = action;
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast2) => {
          addToRemoveQueue(toast2.id);
        });
      }
      return {
        ...state,
        toasts: state.toasts.map(
          (t) => t.id === toastId || toastId === void 0 ? {
            ...t,
            open: false
          } : t
        )
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === void 0) {
        return {
          ...state,
          toasts: []
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId)
      };
  }
};
var listeners = [];
var memoryState = { toasts: [] };
function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}
function toast({ ...props }) {
  const id = genId();
  const update = (props2) => dispatch({
    type: "UPDATE_TOAST",
    toast: { ...props2, id }
  });
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });
  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      }
    }
  });
  return {
    id,
    dismiss,
    update
  };
}
function useToast() {
  const [state, setState] = React5.useState(memoryState);
  React5.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);
  return {
    ...state,
    toast,
    dismiss: (toastId) => dispatch({ type: "DISMISS_TOAST", toastId })
  };
}
var ToastProvider = ToastPrimitives.Provider;
var ToastViewport = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  ToastPrimitives.Viewport,
  {
    ref,
    className: cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className
    ),
    ...props
  }
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;
var toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive: "destructive group border-destructive bg-destructive text-destructive-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
var Toast = React5.forwardRef(({ className, variant, ...props }, ref) => {
  return /* @__PURE__ */ jsx(ToastPrimitives.Root, { ref, className: cn(toastVariants({ variant }), className), ...props });
});
Toast.displayName = ToastPrimitives.Root.displayName;
var ToastAction = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  ToastPrimitives.Action,
  {
    ref,
    className: cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors group-[.destructive]:border-muted/40 hover:bg-secondary group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 group-[.destructive]:focus:ring-destructive disabled:pointer-events-none disabled:opacity-50",
      className
    ),
    ...props
  }
));
ToastAction.displayName = ToastPrimitives.Action.displayName;
var ToastClose = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  ToastPrimitives.Close,
  {
    ref,
    className: cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 group-[.destructive]:text-red-300 hover:text-foreground group-[.destructive]:hover:text-red-50 focus:opacity-100 focus:outline-none focus:ring-2 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600",
      className
    ),
    "toast-close": "",
    ...props,
    children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4" })
  }
));
ToastClose.displayName = ToastPrimitives.Close.displayName;
var ToastTitle = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(ToastPrimitives.Title, { ref, className: cn("text-sm font-semibold", className), ...props }));
ToastTitle.displayName = ToastPrimitives.Title.displayName;
var ToastDescription = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(ToastPrimitives.Description, { ref, className: cn("text-sm opacity-90", className), ...props }));
ToastDescription.displayName = ToastPrimitives.Description.displayName;
function Toaster() {
  const { toasts } = useToast();
  return /* @__PURE__ */ jsxs(ToastProvider, { children: [
    toasts.map(function({ id, title, description, action, ...props }) {
      return /* @__PURE__ */ jsxs(Toast, { ...props, children: [
        /* @__PURE__ */ jsxs("div", { className: "grid gap-1", children: [
          title && /* @__PURE__ */ jsx(ToastTitle, { children: title }),
          description && /* @__PURE__ */ jsx(ToastDescription, { children: description })
        ] }),
        action,
        /* @__PURE__ */ jsx(ToastClose, {})
      ] }, id);
    }),
    /* @__PURE__ */ jsx(ToastViewport, {})
  ] });
}
var Excalidraw = lazy(
  () => import('@excalidraw/excalidraw').then((m) => ({ default: m.Excalidraw }))
);
var THROTTLE_MS = 30;
var ACTIVE_DRAW_THROTTLE_MS = 120;
var WhiteboardPanelInner = forwardRef(
  ({ onLocalChange, onPointerUpdate, remoteRole, hideExport }, ref) => {
    const apiRef = useRef(null);
    const lastSentRef = useRef(0);
    const pendingRef = useRef(null);
    const suppressEmitUntilRef = useRef(0);
    const lastAppliedRemoteSigRef = useRef("");
    const elementsRef = useRef([]);
    const flushTimerRef = useRef(null);
    const pointerDownRef = useRef(false);
    const localBusyElementIdRef = useRef(null);
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
        return api.getSceneElementsIncludingDeleted();
      }
      return elementsRef.current;
    }, []);
    const sceneSignature = (els) => {
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
      (elements, appState) => {
        elementsRef.current = getSnapshot() || elements;
        const busy = appState?.editingTextElement?.id || appState?.editingElement?.id || appState?.newElement?.id || null;
        localBusyElementIdRef.current = busy;
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
      [flush, getSnapshot]
    );
    const handlePointer = useCallback((payload) => {
      const cb = onPointerRef.current;
      if (!payload?.pointer) return;
      const button = payload.button === "down" ? "down" : "up";
      pointerDownRef.current = button === "down";
      if (cb) cb({ x: payload.pointer.x, y: payload.pointer.y, button });
    }, []);
    const setApi = useCallback((a) => {
      apiRef.current = a;
    }, []);
    const applyRemoteSceneNow = useCallback((elements, seq) => {
      const a = apiRef.current;
      if (!a) return;
      if (typeof seq === "number") {
        if (seq <= lastRemoteSceneSeqRef.current) return;
        lastRemoteSceneSeqRef.current = seq;
      }
      const localEls = getSnapshot() || [];
      const appState = a.getAppState?.();
      const restoredRemote = restoreElements(elements, localEls);
      let next = reconcileElements(localEls, restoredRemote, appState);
      const busyId = localBusyElementIdRef.current;
      if (busyId) {
        const localBusy = localEls.find((e) => e?.id === busyId);
        if (localBusy) {
          const filtered = next.filter((e) => e?.id !== busyId);
          next = [...filtered, localBusy];
        }
      }
      lastAppliedRemoteSigRef.current = sceneSignature(next);
      suppressEmitUntilRef.current = Date.now() + 80;
      try {
        a.updateScene({ elements: next });
        elementsRef.current = next;
        if (!didInitialCenterRef.current) {
          const visible = next.filter((e) => e && !e.isDeleted);
          if (visible.length > 0) {
            didInitialCenterRef.current = true;
            try {
              a.scrollToContent(visible, { fitToContent: true, animate: false });
            } catch {
              try {
                a.scrollToContent();
              } catch {
              }
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
      applyRemoteScene: (elements, seq) => {
        applyRemoteSceneNow(elements, seq);
      },
      applyRemotePointer: (p) => {
        const a = apiRef.current;
        if (!a) return;
        if (pointerDownRef.current) return;
        const collaborators = /* @__PURE__ */ new Map();
        collaborators.set(remoteRole, {
          username: remoteRole,
          pointer: { x: p.x, y: p.y, tool: "pointer" },
          button: p.button
        });
        try {
          a.updateScene({ collaborators });
        } catch {
          try {
            a.updateScene({ collaborators: Object.fromEntries(collaborators) });
          } catch {
          }
        }
      },
      getElementsSnapshot: () => getSnapshot(),
      getVisibleElementsSnapshot: () => apiRef.current?.getSceneElements?.() || elementsRef.current.filter((e) => !e?.isDeleted)
    }), [remoteRole, applyRemoteSceneNow]);
    const handleExportPng = useCallback(async () => {
      const a = apiRef.current;
      if (!a) return;
      try {
        const { exportToBlob } = await import('@excalidraw/excalidraw');
        const elements = a.getSceneElements();
        const appState = a.getAppState();
        const files = a.getFiles();
        const blob = await exportToBlob({
          elements,
          mimeType: "image/png",
          appState: { ...appState, exportBackground: true, viewBackgroundColor: "#ffffff" },
          files
        });
        const url = URL.createObjectURL(blob);
        const aEl = document.createElement("a");
        aEl.href = url;
        aEl.download = `whiteboard-${Date.now()}.png`;
        document.body.appendChild(aEl);
        aEl.click();
        aEl.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
      } catch (err) {
        console.error("Whiteboard PNG export failed:", err);
      }
    }, []);
    return /* @__PURE__ */ jsxs(
      "div",
      {
        className: "absolute inset-0 bg-background",
        style: { touchAction: "none", userSelect: "none" },
        children: [
          /* @__PURE__ */ jsx(
            Suspense,
            {
              fallback: /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex items-center justify-center text-muted-foreground", children: [
                /* @__PURE__ */ jsx(Loader2, { className: "h-6 w-6 animate-spin" }),
                /* @__PURE__ */ jsx("span", { className: "ml-2 text-sm", children: "Loading whiteboard\u2026" })
              ] }),
              children: /* @__PURE__ */ jsx(
                Excalidraw,
                {
                  excalidrawAPI: setApi,
                  onChange: handleChange,
                  onPointerUpdate: handlePointer,
                  renderTopRightUI: () => null,
                  UIOptions: { canvasActions: { saveToActiveFile: false, loadScene: false, export: false } }
                }
              )
            }
          ),
          !hideExport && /* @__PURE__ */ jsx("div", { className: "absolute top-2 right-2 z-10 hidden sm:block", children: /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", onClick: handleExportPng, className: "shadow-md", children: [
            /* @__PURE__ */ jsx(Download, { className: "h-4 w-4 mr-1" }),
            "Export PNG"
          ] }) })
        ]
      }
    );
  }
);
WhiteboardPanelInner.displayName = "WhiteboardPanelInner";
var WhiteboardPanel = memo(WhiteboardPanelInner);
var Popover = PopoverPrimitive.Root;
var PopoverTrigger = PopoverPrimitive.Trigger;
var PopoverContent = React5.forwardRef(({ className, align = "center", sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(PopoverPrimitive.Portal, { children: /* @__PURE__ */ jsx(
  PopoverPrimitive.Content,
  {
    ref,
    align,
    sideOffset,
    className: cn(
      "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    ),
    ...props
  }
) }));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
var Select = SelectPrimitive.Root;
var SelectValue = SelectPrimitive.Value;
var SelectTrigger = React5.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(
  SelectPrimitive.Trigger,
  {
    ref,
    className: cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    ),
    ...props,
    children: [
      children,
      /* @__PURE__ */ jsx(SelectPrimitive.Icon, { asChild: true, children: /* @__PURE__ */ jsx(ChevronDown, { className: "h-4 w-4 opacity-50" }) })
    ]
  }
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
var SelectScrollUpButton = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  SelectPrimitive.ScrollUpButton,
  {
    ref,
    className: cn("flex cursor-default items-center justify-center py-1", className),
    ...props,
    children: /* @__PURE__ */ jsx(ChevronUp, { className: "h-4 w-4" })
  }
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;
var SelectScrollDownButton = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  SelectPrimitive.ScrollDownButton,
  {
    ref,
    className: cn("flex cursor-default items-center justify-center py-1", className),
    ...props,
    children: /* @__PURE__ */ jsx(ChevronDown, { className: "h-4 w-4" })
  }
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;
var SelectContent = React5.forwardRef(({ className, children, position = "popper", ...props }, ref) => /* @__PURE__ */ jsx(SelectPrimitive.Portal, { children: /* @__PURE__ */ jsxs(
  SelectPrimitive.Content,
  {
    ref,
    className: cn(
      "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
      className
    ),
    position,
    ...props,
    children: [
      /* @__PURE__ */ jsx(SelectScrollUpButton, {}),
      /* @__PURE__ */ jsx(
        SelectPrimitive.Viewport,
        {
          className: cn(
            "p-1",
            position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
          ),
          children
        }
      ),
      /* @__PURE__ */ jsx(SelectScrollDownButton, {})
    ]
  }
) }));
SelectContent.displayName = SelectPrimitive.Content.displayName;
var SelectLabel = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(SelectPrimitive.Label, { ref, className: cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className), ...props }));
SelectLabel.displayName = SelectPrimitive.Label.displayName;
var SelectItem = React5.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(
  SelectPrimitive.Item,
  {
    ref,
    className: cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground",
      className
    ),
    ...props,
    children: [
      /* @__PURE__ */ jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ jsx(SelectPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(Check, { className: "h-4 w-4" }) }) }),
      /* @__PURE__ */ jsx(SelectPrimitive.ItemText, { children })
    ]
  }
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
var SelectSeparator = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(SelectPrimitive.Separator, { ref, className: cn("-mx-1 my-1 h-px bg-muted", className), ...props }));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;
var labelVariants = cva("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70");
var Label2 = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(LabelPrimitive.Root, { ref, className: cn(labelVariants(), className), ...props }));
Label2.displayName = LabelPrimitive.Root.displayName;

// src/lib/webrtcDiagnostics.ts
var MAX_EVENTS = 200;
var NO_MEDIA_TIMEOUT_MS = 3e4;
var isValidUUID = (s) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
var safeCall = (fn) => {
  try {
    fn();
  } catch {
  }
};
var WebRTCDiagnostics = class {
  constructor(pc, participantId, participantRole, cfg) {
    __publicField(this, "events", []);
    __publicField(this, "startTime", Date.now());
    __publicField(this, "callId", null);
    __publicField(this, "participantId");
    __publicField(this, "participantRole");
    __publicField(this, "pc");
    __publicField(this, "cfg");
    __publicField(this, "firstConnectedAt", null);
    __publicField(this, "gotRemoteTrack", false);
    __publicField(this, "noMediaTimer", null);
    __publicField(this, "flushed", false);
    __publicField(this, "candidateTypesSeen", /* @__PURE__ */ new Set());
    __publicField(this, "remoteCandidateTypesSeen", /* @__PURE__ */ new Set());
    __publicField(this, "selectedCandidatePair", {});
    this.pc = pc;
    this.participantId = participantId;
    this.participantRole = participantRole;
    this.cfg = cfg;
    this.attachListeners();
    this.startNoMediaTimer();
  }
  setCallId(callId) {
    if (isValidUUID(callId)) {
      this.callId = callId;
    }
  }
  push(type, data) {
    safeCall(() => {
      if (this.events.length >= MAX_EVENTS) return;
      this.events.push({
        t: Date.now() - this.startTime,
        type,
        data
      });
    });
  }
  attachListeners() {
    safeCall(() => {
      const pc = this.pc;
      pc.addEventListener("iceconnectionstatechange", () => {
        const state = pc.iceConnectionState;
        this.push("ice_connection_state", { state });
        if ((state === "connected" || state === "completed") && !this.firstConnectedAt) {
          this.firstConnectedAt = Date.now() - this.startTime;
        }
      });
      pc.addEventListener("icegatheringstatechange", () => {
        this.push("ice_gathering_state", { state: pc.iceGatheringState });
      });
      pc.addEventListener("signalingstatechange", () => {
        this.push("signaling_state", { state: pc.signalingState });
      });
      pc.addEventListener("connectionstatechange", () => {
        this.push("connection_state", { state: pc.connectionState });
      });
      pc.addEventListener("icecandidate", (e) => {
        if (e.candidate) {
          const c = e.candidate;
          if (c.type) this.candidateTypesSeen.add(c.type);
          this.push("local_ice_candidate", {
            type: c.type,
            protocol: c.protocol,
            address: c.address,
            port: c.port,
            relatedAddress: c.relatedAddress,
            relatedPort: c.relatedPort,
            relayProtocol: c.relayProtocol
          });
        } else {
          this.push("local_ice_candidate_end");
        }
      });
      pc.addEventListener("icecandidateerror", (e) => {
        this.push("ice_candidate_error", {
          errorCode: e.errorCode,
          errorText: e.errorText,
          url: e.url,
          hostCandidate: e.hostCandidate ? "[present]" : void 0
        });
      });
      pc.addEventListener("track", (e) => {
        this.gotRemoteTrack = true;
        this.push("remote_track", {
          kind: e.track?.kind,
          readyState: e.track?.readyState,
          muted: e.track?.muted
        });
        this.clearNoMediaTimer();
      });
      pc.addEventListener("negotiationneeded", () => {
        this.push("negotiation_needed");
      });
    });
  }
  /** Note remote ICE candidate types (called when receiving via signaling). */
  noteRemoteCandidate(candidateInit) {
    safeCall(() => {
      const match = candidateInit.candidate?.match(/typ (\w+)/);
      if (match) {
        this.remoteCandidateTypesSeen.add(match[1]);
      }
    });
  }
  startNoMediaTimer() {
    safeCall(() => {
      this.noMediaTimer = setTimeout(() => {
        if (!this.gotRemoteTrack && !this.flushed) {
          this.push("no_media_timeout", { afterMs: NO_MEDIA_TIMEOUT_MS });
          this.flush("no_media");
        }
      }, NO_MEDIA_TIMEOUT_MS);
    });
  }
  clearNoMediaTimer() {
    if (this.noMediaTimer) {
      clearTimeout(this.noMediaTimer);
      this.noMediaTimer = null;
    }
  }
  async collectStatsSnapshot() {
    const snapshot = {};
    try {
      const stats = await this.pc.getStats();
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
          const local = stats.get(report.localCandidateId);
          const remote = stats.get(report.remoteCandidateId);
          this.selectedCandidatePair = {
            local: local?.candidateType,
            remote: remote?.candidateType,
            protocol: local?.protocol
          };
          snapshot.selected_local_type = local?.candidateType;
          snapshot.selected_remote_type = remote?.candidateType;
          snapshot.selected_protocol = local?.protocol;
          snapshot.selected_relay_protocol = local?.relayProtocol;
          snapshot.current_rtt_ms = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1e3) : null;
          snapshot.bytes_sent = report.bytesSent;
          snapshot.bytes_received = report.bytesReceived;
        }
      });
    } catch {
    }
    return snapshot;
  }
  getBrowserFingerprint() {
    try {
      const KEY = "webrtc_browser_fingerprint";
      let fp = localStorage.getItem(KEY);
      if (!fp) {
        fp = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(KEY, fp);
      }
      return fp;
    } catch {
      return void 0;
    }
  }
  getEnvironment() {
    const env = {};
    safeCall(() => {
      env.userAgent = navigator.userAgent;
      env.platform = navigator.platform;
      env.language = navigator.language;
      const conn = navigator.connection;
      if (conn) {
        env.effectiveType = conn.effectiveType;
        env.downlink = conn.downlink;
        env.rtt = conn.rtt;
      }
      env.onLine = navigator.onLine;
      env.host = window.location.hostname;
      env.browser_fingerprint = this.getBrowserFingerprint();
      if (this.cfg.appVersion) env.app_version = this.cfg.appVersion;
    });
    return env;
  }
  /**
   * Check whether the *other* participant has joined the call.
   * Role-agnostic: any participant in `call_participants` for this call whose
   * id differs from ours and who has a joined_at. Fail-safe to false.
   */
  async didOtherPartyJoin() {
    try {
      if (!isValidUUID(this.callId)) return false;
      const { data, error } = await this.cfg.supabase.from("call_participants").select("participant_id, joined_at").eq("call_id", this.callId);
      if (error || !data) return false;
      return data.some((p) => p.participant_id !== this.participantId && !!p.joined_at);
    } catch {
      return false;
    }
  }
  /**
   * Flush diagnostics to DB. Fire-and-forget — never blocks.
   * Safe to call multiple times; only first call writes.
   */
  flush(outcome) {
    void this.flushAsync(outcome);
  }
  /**
   * Flush via fetch keepalive so the browser guarantees delivery even when
   * the page is being unloaded (e.g. user closes the tab). Use this in
   * pagehide/beforeunload handlers instead of flush().
   */
  flushBeacon(outcome) {
    try {
      if (this.flushed) return;
      if (!isValidUUID(this.callId)) return;
      this.flushed = true;
      this.clearNoMediaTimer();
      const usedRelay = this.selectedCandidatePair.local === "relay" || this.selectedCandidatePair.remote === "relay";
      const summary = {
        outcome,
        got_remote_track: this.gotRemoteTrack,
        time_to_connect_ms: this.firstConnectedAt,
        total_duration_ms: Date.now() - this.startTime,
        final_ice_state: this.safeGet(() => this.pc.iceConnectionState),
        final_connection_state: this.safeGet(() => this.pc.connectionState),
        final_signaling_state: this.safeGet(() => this.pc.signalingState),
        local_candidate_types: Array.from(this.candidateTypesSeen),
        remote_candidate_types: Array.from(this.remoteCandidateTypesSeen),
        selected_pair: this.selectedCandidatePair,
        turn_relay_used: usedRelay,
        environment: this.getEnvironment()
      };
      fetch(`${this.cfg.restUrl}/rest/v1/webrtc_diagnostics`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "apikey": this.cfg.restKey,
          "Authorization": `Bearer ${this.cfg.restKey}`,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          call_id: this.callId,
          participant_id: this.participantId,
          participant_role: this.participantRole,
          outcome,
          events: this.events,
          summary
        })
      }).catch(() => {
      });
    } catch {
    }
  }
  /**
   * Awaitable flush. Resolves once the DB insert completes (or is silently dropped).
   * Safe to call multiple times; only first call writes. Never throws.
   */
  async flushAsync(outcome) {
    if (this.flushed) return;
    this.flushed = true;
    this.clearNoMediaTimer();
    try {
      if (!isValidUUID(this.callId)) {
        return;
      }
      if (outcome === "no_media") {
        const otherJoined = await this.didOtherPartyJoin();
        if (!otherJoined) return;
      }
      const statsSnapshot = await this.collectStatsSnapshot();
      const usedRelay = this.selectedCandidatePair.local === "relay" || this.selectedCandidatePair.remote === "relay";
      const summary = {
        outcome,
        got_remote_track: this.gotRemoteTrack,
        time_to_connect_ms: this.firstConnectedAt,
        total_duration_ms: Date.now() - this.startTime,
        final_ice_state: this.safeGet(() => this.pc.iceConnectionState),
        final_connection_state: this.safeGet(() => this.pc.connectionState),
        final_signaling_state: this.safeGet(() => this.pc.signalingState),
        local_candidate_types: Array.from(this.candidateTypesSeen),
        remote_candidate_types: Array.from(this.remoteCandidateTypesSeen),
        selected_pair: this.selectedCandidatePair,
        turn_relay_used: usedRelay,
        environment: this.getEnvironment(),
        ...statsSnapshot
      };
      await this.cfg.supabase.from("webrtc_diagnostics").insert({
        call_id: this.callId,
        participant_id: this.participantId,
        participant_role: this.participantRole,
        outcome,
        events: this.events,
        summary
      });
    } catch {
    }
  }
  safeGet(fn) {
    try {
      return fn();
    } catch {
      return null;
    }
  }
  /** Detach (no-op for passive listeners; pc.close() removes them). */
  destroy() {
    this.clearNoMediaTimer();
  }
};

// src/lib/rtcPayload.ts
var decoder = new TextDecoder();
async function encodeRtcPayload(payload, _options) {
  return JSON.stringify(payload);
}
async function decodeRtcPayload(data) {
  if (typeof data === "string") return JSON.parse(data);
  const text = data instanceof Blob ? await data.text() : decoder.decode(data);
  return JSON.parse(text);
}
function chunkEncodedRtcPayload(messageId, encoded, chunkSize = 8e3) {
  const total = Math.max(1, Math.ceil(encoded.length / chunkSize));
  return Array.from({ length: total }, (_, index) => ({
    messageId,
    index,
    total,
    payloadType: "text",
    data: encoded.slice(index * chunkSize, (index + 1) * chunkSize)
  }));
}
async function decodeChunkedRtcPayload(chunks) {
  if (!chunks.length) throw new Error("Missing RTC payload chunks");
  const ordered = [...chunks].sort((a, b) => a.index - b.index);
  return decodeRtcPayload(ordered.map((chunk) => chunk.data).join(""));
}

// src/lib/canvasBridge.ts
function generateBridgeKey() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
function bridgeChannelName(sessionId, role, key) {
  return `bridge-${sessionId}-${role}-${key}`;
}

// src/lib/rtcHealthPoll.ts
var POLL_INTERVAL_MS = 5e3;
function getCandidatePairStats(report) {
  for (const [, stat] of report) {
    if (stat.type === "candidate-pair" && stat.nominated) {
      return stat;
    }
  }
  for (const [, stat] of report) {
    if (stat.type === "candidate-pair" && stat.state === "succeeded") {
      return stat;
    }
  }
  return null;
}
function getCandidateType(report, candidateId) {
  if (!candidateId) return "unknown";
  const c = report.get(candidateId);
  return c?.candidateType ?? "unknown";
}
function getTransportStats(report) {
  for (const [, stat] of report) {
    if (stat.type === "transport") return stat;
  }
  return null;
}
function getInboundVideo(report) {
  for (const [, stat] of report) {
    if (stat.type === "inbound-rtp" && stat.kind === "video") return stat;
  }
  return null;
}
function getOutboundVideo(report) {
  for (const [, stat] of report) {
    if (stat.type === "outbound-rtp" && stat.kind === "video") return stat;
  }
  return null;
}
function startRtcHealthPoll(opts) {
  const { supabase, callId, participantId, participantRole, label, pc, dcRef } = opts;
  let prevBytesSent = 0;
  let prevBytesRecv = 0;
  let prevTimestamp = Date.now();
  let stopped = false;
  let seq = 0;
  const poll = async () => {
    if (stopped) return;
    try {
      const report = await pc.getStats();
      const pair = getCandidatePairStats(report);
      const transport = getTransportStats(report);
      const inVideo = getInboundVideo(report);
      const outVideo = getOutboundVideo(report);
      const now = Date.now();
      const elapsed = (now - prevTimestamp) / 1e3;
      const localType = pair ? getCandidateType(report, pair.localCandidateId) : "none";
      const remoteType = pair ? getCandidateType(report, pair.remoteCandidateId) : "none";
      const bytesSent = pair?.bytesSent ?? 0;
      const bytesRecv = pair?.bytesReceived ?? 0;
      const sendRate = elapsed > 0 ? Math.round((bytesSent - prevBytesSent) / elapsed) : 0;
      const recvRate = elapsed > 0 ? Math.round((bytesRecv - prevBytesRecv) / elapsed) : 0;
      prevBytesSent = bytesSent;
      prevBytesRecv = bytesRecv;
      prevTimestamp = now;
      seq++;
      const row = {
        seq,
        label,
        iceState: pc.iceConnectionState,
        connState: pc.connectionState,
        sigState: pc.signalingState,
        localCandidateType: localType,
        remoteCandidateType: remoteType,
        rttMs: pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1e3) : null,
        packetsLost: pair?.packetsLost ?? null,
        packetsSent: pair?.packetsSent ?? null,
        sendBps: sendRate,
        recvBps: recvRate,
        dtlsState: transport?.dtlsState ?? null,
        // Inbound video: framesDecoded climbing => remote video is decoding.
        // Stuck at 0 with packetsReceived>0 => arriving but not decodable.
        inVidFramesDecoded: inVideo?.framesDecoded ?? null,
        inVidFramesReceived: inVideo?.framesReceived ?? null,
        inVidPacketsReceived: inVideo?.packetsReceived ?? null,
        inVidW: inVideo?.frameWidth ?? null,
        inVidH: inVideo?.frameHeight ?? null,
        // Outbound video: framesSent climbing => we are actually sending video.
        outVidFramesSent: outVideo?.framesSent ?? null,
        outVidFramesEncoded: outVideo?.framesEncoded ?? null
      };
      if (dcRef) {
        const dc = dcRef.current;
        row.dcState = dc ? dc.readyState : "null";
        row.dcBuffered = dc?.bufferedAmount ?? null;
      }
      supabase.from("call_telemetry").insert({
        call_id: callId,
        participant_id: participantId,
        participant_role: participantRole,
        event_type: `rtc_health_${label}`,
        metadata: row
      }).then(({ error }) => {
        if (error) console.warn(`[rtcHealth:${label}] insert failed`, error.message);
      });
    } catch {
    }
  };
  const id = setInterval(poll, POLL_INTERVAL_MS);
  poll();
  return () => {
    stopped = true;
    clearInterval(id);
  };
}

// src/whiteboard/useBridgeHost.ts
function bridgeLog(supabase, sessionId, role, event, meta) {
  if (!sessionId) return;
  supabase.from("call_telemetry").insert({
    call_id: sessionId,
    participant_id: `bridge-host-${role}`,
    participant_role: role,
    event_type: `bridge_host_${event}`,
    metadata: meta ?? null
  }).then(({ error }) => {
    if (error) console.warn("[BridgeHost] telemetry insert failed", error.message);
  });
}
var CHUNK_SIZE = 8e3;
function useBridgeHost({
  supabase,
  sessionId,
  participantRole,
  bridgeKey,
  whiteboardOpen,
  wbHandle,
  getIceServers: getIceServers2,
  onBridgeData
}) {
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const channelRef = useRef(null);
  const connectedRef = useRef(false);
  const suppressEchoUntilRef = useRef(0);
  const whiteboardOpenRef = useRef(whiteboardOpen);
  const wbHandleRef = useRef(wbHandle);
  const onBridgeDataRef = useRef(onBridgeData);
  const chunkAssembliesRef = useRef(/* @__PURE__ */ new Map());
  const msgIdRef = useRef(0);
  const iceCandidateBufferRef = useRef([]);
  const teardownCalledRef = useRef(false);
  const stopHealthPollRef = useRef(null);
  const effectMountIdRef = useRef(0);
  whiteboardOpenRef.current = whiteboardOpen;
  wbHandleRef.current = wbHandle;
  onBridgeDataRef.current = onBridgeData;
  const sendRaw = useCallback((dc, payload) => {
    if (dc.readyState !== "open") return;
    const encoded = JSON.stringify(payload);
    if (encoded.length <= CHUNK_SIZE) {
      dc.send(encoded);
      return;
    }
    msgIdRef.current += 1;
    const messageId = `bridge-${participantRole}-${Date.now()}-${msgIdRef.current}`;
    const chunks = chunkEncodedRtcPayload(messageId, encoded, CHUNK_SIZE);
    for (const chunk of chunks) {
      dc.send(JSON.stringify({ kind: "chunk", ...chunk }));
    }
  }, [participantRole]);
  const sendToBridge = useCallback((payload) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    if (Date.now() < suppressEchoUntilRef.current) return;
    try {
      sendRaw(dc, payload);
    } catch (err) {
      bridgeLog(supabase, sessionId, participantRole, "send_error", {
        kind: payload?.kind,
        error: err?.message || String(err),
        bufferedAmount: dc.bufferedAmount
      });
    }
  }, [supabase, sendRaw, sessionId, participantRole]);
  const closeBridgePC = useCallback(() => {
    if (stopHealthPollRef.current) {
      stopHealthPollRef.current();
      stopHealthPollRef.current = null;
    }
    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch {
      }
      dcRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
      }
      pcRef.current = null;
    }
    connectedRef.current = false;
    iceCandidateBufferRef.current = [];
    chunkAssembliesRef.current.clear();
  }, []);
  const handleBridgeMessage = useCallback(async (rawData) => {
    const msg = await decodeRtcPayload(rawData);
    if (msg?.kind === "chunk") {
      const { messageId, index, total, payloadType, data } = msg;
      if (!messageId || typeof index !== "number" || typeof total !== "number" || !data) return;
      const existing = chunkAssembliesRef.current.get(messageId) || {
        chunks: Array.from({ length: total }),
        total
      };
      existing.chunks[index] = { messageId, index, total, payloadType: payloadType || "text", data };
      chunkAssembliesRef.current.set(messageId, existing);
      if (existing.chunks.filter(Boolean).length !== existing.total) return;
      chunkAssembliesRef.current.delete(messageId);
      const decoded = await decodeChunkedRtcPayload(existing.chunks);
      handleBridgeMessage(JSON.stringify(decoded));
      return;
    }
    if (msg?.kind === "scene" || msg?.kind === "scene-delta" || msg?.kind === "pointer") {
      bridgeLog(supabase, sessionId, participantRole, "recv_from_ipad", {
        kind: msg.kind,
        elementCount: msg.elements?.length ?? 0
      });
      suppressEchoUntilRef.current = Date.now() + 100;
      onBridgeDataRef.current(msg);
    }
  }, [supabase, sessionId, participantRole]);
  const createBridgePC = useCallback(async (sigChannel) => {
    closeBridgePC();
    const iceServers = await getIceServers2();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sigChannel.send({
          type: "broadcast",
          event: "bridge-ice",
          payload: { candidate: e.candidate.toJSON(), from: "laptop" }
        });
      }
    };
    pc.oniceconnectionstatechange = () => {
      bridgeLog(supabase, sessionId, participantRole, "ice_state", { state: pc.iceConnectionState });
    };
    pc.onconnectionstatechange = () => {
      bridgeLog(supabase, sessionId, participantRole, "conn_state", { state: pc.connectionState });
    };
    if (sessionId) {
      stopHealthPollRef.current = startRtcHealthPoll({
        supabase,
        callId: sessionId,
        participantId: `bridge-host-${participantRole}`,
        participantRole,
        label: "bridge-host",
        pc,
        dcRef
      });
    }
    const dc = pc.createDataChannel("canvas", { ordered: true });
    dcRef.current = dc;
    dc.onopen = () => {
      connectedRef.current = true;
      const handle = wbHandleRef.current;
      const wbOpen = whiteboardOpenRef.current;
      bridgeLog(supabase, sessionId, participantRole, "dc_open", {
        hasWbHandle: !!handle,
        whiteboardOpen: wbOpen
      });
      if (wbOpen) {
        sendRaw(dc, { kind: "toggle", open: true });
        const snap = handle?.getElementsSnapshot();
        if (snap?.length) {
          sendRaw(dc, { kind: "scene", elements: snap });
        }
      } else {
        sendRaw(dc, { kind: "toggle", open: false });
      }
    };
    dc.onclose = () => {
      connectedRef.current = false;
      bridgeLog(supabase, sessionId, participantRole, "dc_close");
    };
    dc.onmessage = (e) => {
      handleBridgeMessage(e.data).catch((err) => {
        bridgeLog(supabase, sessionId, participantRole, "recv_error", { error: String(err) });
        console.error(err);
      });
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sigChannel.send({
      type: "broadcast",
      event: "bridge-offer",
      payload: { sdp: pc.localDescription }
    });
  }, [supabase, closeBridgePC, getIceServers2, sendRaw, handleBridgeMessage, sessionId, participantRole]);
  useEffect(() => {
    if (!sessionId || !bridgeKey) return;
    teardownCalledRef.current = false;
    effectMountIdRef.current += 1;
    const mountId = effectMountIdRef.current;
    bridgeLog(supabase, sessionId, participantRole, "effect_mount", { mountId });
    const channelName = bridgeChannelName(sessionId, participantRole, bridgeKey);
    const sigChannel = supabase.channel(channelName);
    channelRef.current = sigChannel;
    sigChannel.on("broadcast", { event: "bridge-join" }, () => {
      void createBridgePC(sigChannel);
    }).on("broadcast", { event: "bridge-answer" }, async ({ payload }) => {
      const pc = pcRef.current;
      if (!pc || !payload?.sdp) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        for (const c of iceCandidateBufferRef.current) {
          await pc.addIceCandidate(c).catch(() => {
          });
        }
        iceCandidateBufferRef.current = [];
      } catch (err) {
        console.error("[BridgeHost] Failed to set remote description:", err);
      }
    }).on("broadcast", { event: "bridge-ice" }, async ({ payload }) => {
      if (payload?.from === "laptop") return;
      const pc = pcRef.current;
      if (!pc) return;
      const candidate = new RTCIceCandidate(payload.candidate);
      if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate).catch(() => {
        });
      } else {
        iceCandidateBufferRef.current.push(candidate);
      }
    }).subscribe();
    return () => {
      bridgeLog(supabase, sessionId, participantRole, "effect_unmount", { mountId });
      if (!teardownCalledRef.current) {
        closeBridgePC();
      }
      supabase.removeChannel(sigChannel);
      channelRef.current = null;
    };
  }, [supabase, sessionId, bridgeKey, participantRole, createBridgePC, closeBridgePC]);
  useEffect(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    if (whiteboardOpen) {
      sendRaw(dc, { kind: "toggle", open: true });
      const handle = wbHandleRef.current;
      if (handle) {
        const snap = handle.getElementsSnapshot();
        if (snap?.length) {
          sendRaw(dc, { kind: "scene", elements: snap });
        }
      }
    } else {
      sendRaw(dc, { kind: "toggle", open: false });
    }
  }, [whiteboardOpen, sendRaw]);
  const teardown = useCallback(() => {
    teardownCalledRef.current = true;
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      try {
        sendRaw(dc, { kind: "session-ended" });
      } catch {
      }
    }
    closeBridgePC();
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [supabase, closeBridgePC, sendRaw]);
  return {
    bridgeConnected: connectedRef.current,
    sendToBridge,
    teardown
  };
}
function DraggablePiP({
  children,
  sizeClassName,
  margin = 12,
  dismissible = true
}) {
  const boxRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const dragState = useRef(null);
  const placeDefault = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = window.innerWidth - r.width - margin;
    const y = window.innerHeight - r.height - margin - 76;
    setPos({ x: Math.max(margin, x), y: Math.max(margin, y) });
  }, [margin]);
  useEffect(() => {
    if (pos === null) placeDefault();
  }, [pos, placeDefault]);
  useEffect(() => {
    const onResize = () => {
      const el = boxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos((p) => {
        if (!p) return p;
        return {
          x: Math.min(Math.max(margin, p.x), window.innerWidth - r.width - margin),
          y: Math.min(Math.max(margin, p.y), window.innerHeight - r.height - margin)
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [margin]);
  const onPointerDown = (e) => {
    const el = boxRef.current;
    if (!el || !pos) return;
    e.target.setPointerCapture?.(e.pointerId);
    dragState.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false };
  };
  const onPointerMove = (e) => {
    const d = dragState.current;
    const el = boxRef.current;
    if (!d || !el) return;
    d.moved = true;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(margin, e.clientX - d.dx), window.innerWidth - r.width - margin);
    const y = Math.min(Math.max(margin, e.clientY - d.dy), window.innerHeight - r.height - margin);
    setPos({ x, y });
  };
  const onPointerUp = (e) => {
    e.target.releasePointerCapture?.(e.pointerId);
    dragState.current = null;
  };
  if (dismissed) {
    return /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => setDismissed(false),
        style: { left: pos?.x, top: pos?.y, position: "fixed" },
        className: "z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur hover:bg-black/80",
        title: "Show video",
        children: /* @__PURE__ */ jsx(Video, { className: "h-4 w-4" })
      }
    );
  }
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: boxRef,
      style: {
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        position: "fixed",
        visibility: pos ? "visible" : "hidden",
        touchAction: "none"
      },
      className: `z-40 ${sizeClassName} overflow-hidden rounded-lg border-2 border-white/30 bg-black shadow-xl`,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      children: [
        children,
        dismissible && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setDismissed(true),
            onPointerDown: (e) => e.stopPropagation(),
            className: "absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80",
            title: "Hide video",
            children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" })
          }
        )
      ]
    }
  );
}
var Dialog = DialogPrimitive.Root;
var DialogPortal = DialogPrimitive.Portal;
var DialogOverlay = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DialogPrimitive.Overlay,
  {
    ref,
    className: cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    ),
    ...props
  }
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
var DialogContent = React5.forwardRef(({ className, children, hideClose, ...props }, ref) => /* @__PURE__ */ jsxs(DialogPortal, { children: [
  /* @__PURE__ */ jsx(DialogOverlay, {}),
  /* @__PURE__ */ jsxs(
    DialogPrimitive.Content,
    {
      ref,
      className: cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      ),
      ...props,
      children: [
        children,
        !hideClose && /* @__PURE__ */ jsxs(DialogPrimitive.Close, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none", children: [
          /* @__PURE__ */ jsx(X, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close" })
        ] })
      ]
    }
  )
] }));
DialogContent.displayName = DialogPrimitive.Content.displayName;
var DialogHeader = ({ className, ...props }) => /* @__PURE__ */ jsx("div", { className: cn("flex flex-col space-y-1.5 text-center sm:text-left", className), ...props });
DialogHeader.displayName = "DialogHeader";
var DialogTitle = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DialogPrimitive.Title,
  {
    ref,
    className: cn("text-lg font-semibold leading-none tracking-tight", className),
    ...props
  }
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;
var DialogDescription = React5.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DialogPrimitive.Description, { ref, className: cn("text-sm text-muted-foreground", className), ...props }));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
function ShareToDeviceModal({ open, onClose, url }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2e3);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2e3);
    }
  }, [url]);
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange: (o) => {
    if (!o) onClose();
  }, children: /* @__PURE__ */ jsxs(DialogContent, { className: "w-[calc(100vw-2rem)] max-w-sm p-6 bg-white text-gray-900 border border-gray-200 shadow-xl !grid-cols-1", style: { gridTemplateColumns: "1fr" }, children: [
    /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { className: "text-center text-gray-900", children: "Open whiteboard on another device" }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4 pt-2", children: [
      /* @__PURE__ */ jsx("div", { className: "shrink-0 bg-white p-3 rounded-lg shadow-sm", children: /* @__PURE__ */ jsx(QRCodeSVG, { value: url, size: 180, level: "M" }) }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 text-center leading-snug", children: "Scan this QR code or copy the link below to open the whiteboard on your iPad or tablet." }),
      /* @__PURE__ */ jsxs("div", { className: "flex w-full items-center gap-2", children: [
        /* @__PURE__ */ jsx("code", { className: "flex-1 min-w-0 text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-md truncate block", children: url }),
        /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: handleCopy, className: "shrink-0", children: copied ? /* @__PURE__ */ jsx(Check, { className: "h-4 w-4" }) : /* @__PURE__ */ jsx(Copy, { className: "h-4 w-4" }) })
      ] })
    ] })
  ] }) });
}
var MOBILE_BREAKPOINT = 768;
function useIsMobile() {
  const [isMobile, setIsMobile] = React5.useState(void 0);
  React5.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return !!isMobile;
}
var CHAT_TTL_MS = 48 * 60 * 60 * 1e3;
var CHAT_MAX_LEN = 2e3;
var CHAT_SYSTEM_PREFIX = "sys";
var makeSystemMessage = (text) => `${CHAT_SYSTEM_PREFIX}${text}`;
var isSystemMessage = (body) => body.startsWith(CHAT_SYSTEM_PREFIX);
var systemMessageText = (body) => body.startsWith(CHAT_SYSTEM_PREFIX) ? body.slice(CHAT_SYSTEM_PREFIX.length) : body;
var cutoffIso = () => new Date(Date.now() - CHAT_TTL_MS).toISOString();
var lastReadKey = (roomId, role) => `chat_lastread_${roomId}_${role}`;
var sharedAudioCtx = null;
var lastBlipAt = 0;
var playBubble = () => {
  const t = Date.now();
  if (t - lastBlipAt < 1500) return;
  lastBlipAt = t;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {
    });
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(1e-4, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(1e-4, now + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  } catch {
  }
};
function usePairChat(supabase, roomId, selfRole, selfId) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const activeRef = useRef(false);
  const [active, setActiveState] = useState(false);
  const instanceIdRef = useRef("");
  if (!instanceIdRef.current) instanceIdRef.current = Math.random().toString(36).slice(2);
  const upsertMessages = useCallback((incoming) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, []);
  const markRead = useCallback(() => {
    try {
      localStorage.setItem(lastReadKey(roomId, selfRole), (/* @__PURE__ */ new Date()).toISOString());
    } catch {
    }
    setUnread(false);
  }, [roomId, selfRole]);
  const loadHistory = useCallback(async () => {
    setLoading(true);
    supabase.from("chat_messages").delete().eq("pair_id", roomId).lt("created_at", cutoffIso()).then(({ error }) => {
      if (error) console.error("Chat cleanup failed:", error);
    });
    const { data } = await supabase.from("chat_messages").select("*").eq("pair_id", roomId).gt("created_at", cutoffIso()).order("created_at", { ascending: true });
    upsertMessages(data ?? []);
    setLoading(false);
  }, [supabase, roomId, upsertMessages]);
  useEffect(() => {
    if (!roomId) return;
    let active2 = true;
    (async () => {
      const { data } = await supabase.from("chat_messages").select("created_at, sender_role").eq("pair_id", roomId).gt("created_at", cutoffIso()).order("created_at", { ascending: false }).limit(1);
      if (!active2) return;
      const latest = data?.[0];
      if (!latest || latest.sender_role === selfRole) return;
      const lastRead = localStorage.getItem(lastReadKey(roomId, selfRole));
      if (!lastRead || new Date(latest.created_at).getTime() > new Date(lastRead).getTime()) {
        setUnread(true);
      }
    })();
    const channel = supabase.channel(`chat-${roomId}-${selfRole}-${instanceIdRef.current}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages", filter: `pair_id=eq.${roomId}` },
      (payload) => {
        const m = payload.new;
        if (activeRef.current) upsertMessages([m]);
        if (m.sender_role === selfRole) return;
        if (!activeRef.current) setUnread(true);
        playBubble();
      }
    ).subscribe();
    return () => {
      active2 = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, selfRole, upsertMessages]);
  const setActive = useCallback(
    (next) => {
      activeRef.current = next;
      setActiveState(next);
      if (next) loadHistory();
    },
    [loadHistory]
  );
  useEffect(() => {
    if (active) markRead();
  }, [active, messages, markRead]);
  const send = useCallback(
    async (text) => {
      const body = text.trim();
      if (!body) return false;
      const { data, error } = await supabase.from("chat_messages").insert({ pair_id: roomId, sender_role: selfRole, sender_id: selfId, body: body.slice(0, CHAT_MAX_LEN) }).select().single();
      if (error) return false;
      if (data) upsertMessages([data]);
      return true;
    },
    [supabase, roomId, selfRole, selfId, upsertMessages]
  );
  return { messages, unread, loading, setActive, markRead, send };
}
var Input = React5.forwardRef(
  ({ className, type, ...props }, ref) => {
    return /* @__PURE__ */ jsx(
      "input",
      {
        type,
        className: cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Input.displayName = "Input";
var fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function PairChatThread({ messages, selfRole, loading, onSend, compact }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);
  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await onSend(t);
    setSending(false);
    if (ok) setText("");
    else toast({ title: "Couldn't send message", variant: "destructive" });
  };
  const bubble = compact ? "text-xs px-3 py-1.5 rounded-lg" : "text-sm px-3 py-2 rounded-2xl";
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col flex-1 min-h-0", children: [
    /* @__PURE__ */ jsx("div", { ref: scrollRef, className: "flex-1 overflow-y-auto space-y-2 py-2 min-h-0", children: loading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground text-center py-8", children: "Loading\u2026" }) : messages.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground text-center py-8", children: "No messages yet. Say hello \u{1F44B}" }) : messages.map((m) => {
      if (isSystemMessage(m.body)) {
        return /* @__PURE__ */ jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsx("p", { className: "text-[11px] text-muted-foreground italic py-1 text-center", children: systemMessageText(m.body) }) }, m.id);
      }
      const mine = m.sender_role === selfRole;
      return /* @__PURE__ */ jsx("div", { className: `flex ${mine ? "justify-end" : "justify-start"}`, children: /* @__PURE__ */ jsxs(
        "div",
        {
          className: `max-w-[80%] ${bubble} ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`,
          children: [
            /* @__PURE__ */ jsx("p", { className: "whitespace-pre-wrap break-words", children: m.body }),
            /* @__PURE__ */ jsx("p", { className: `text-[10px] mt-0.5 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`, children: fmtTime(m.created_at) })
          ]
        }
      ) }, m.id);
    }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 pt-2 border-t", children: [
      /* @__PURE__ */ jsx(
        Input,
        {
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          },
          placeholder: "Type a message\u2026",
          maxLength: CHAT_MAX_LEN,
          className: compact ? "h-8 text-xs" : "",
          autoFocus: true
        }
      ),
      /* @__PURE__ */ jsx(
        Button,
        {
          size: "icon",
          variant: compact ? "ghost" : "default",
          className: compact ? "h-8 w-8 shrink-0" : "",
          onClick: submit,
          disabled: sending || !text.trim(),
          children: /* @__PURE__ */ jsx(Send, { className: compact ? "h-3.5 w-3.5" : "h-4 w-4" })
        }
      )
    ] })
  ] });
}
var log = (role, ...args) => {
  console.log(`[WebRTC][${role}][${(/* @__PURE__ */ new Date()).toISOString()}]`, ...args);
};
var isValidUUID2 = (s) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
var tuneOpusSdp = (sdp) => {
  if (!sdp) return sdp || "";
  try {
    const pt = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i)?.[1];
    if (!pt) return sdp;
    const fmtpLine = new RegExp(`a=fmtp:${pt}\\s.*`, "i");
    const desired = `a=fmtp:${pt} minptime=10;useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=48000`;
    if (fmtpLine.test(sdp)) return sdp.replace(fmtpLine, desired);
    return sdp.replace(new RegExp(`(a=rtpmap:${pt}\\s+opus/48000[^\\n]*\\n)`, "i"), `$1${desired}\r
`);
  } catch {
    return sdp;
  }
};
var setupVideoEl = (el, stream, muted) => {
  if (!el) return;
  el.autoplay = true;
  el.playsInline = true;
  el.muted = muted;
  if (stream && el.srcObject !== stream) {
    el.srcObject = stream;
  } else if (!stream && el.srcObject) {
    el.srcObject = null;
  }
  el.play().catch(() => {
  });
};
var FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  // OpenRelay TURN (free, community-maintained)
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
];
var cachedIceServers = null;
var cachedAt = 0;
var ICE_CACHE_MS = 50 * 60 * 1e3;
async function getIceServers(supabase) {
  if (cachedIceServers && Date.now() - cachedAt < ICE_CACHE_MS) return cachedIceServers;
  try {
    const { data, error } = await supabase.functions.invoke("get-turn-credentials");
    if (error) throw error;
    const cf = data?.iceServers;
    if (!cf) throw new Error("No iceServers in response");
    const cfArr = Array.isArray(cf) ? cf : [cf];
    cachedIceServers = [
      { urls: "stun:stun.cloudflare.com:3478" },
      ...cfArr
    ];
    cachedAt = Date.now();
    return cachedIceServers;
  } catch (err) {
    console.warn("[TURN] Cloudflare fetch failed, using fallback:", err);
    return FALLBACK_ICE_SERVERS;
  }
}
var CONNECTION_TIMEOUT_MS = 15e3;
var HEALTH_CHECK_INTERVAL_MS = 5e3;
var DISCONNECT_THRESHOLD_MS = 25e3;
var CONNECTING_THRESHOLD_MS = 2e4;
var SIGNALING_RECOVERY_MS = 45e3;
var MAX_SIGNALING_RECOVERY = 3;
var STRENGTH_BITRATE_RED_BPS = 3e4;
var STRENGTH_LOSS_RED = 0.05;
var STRENGTH_LOSS_YELLOW = 0.02;
var STRENGTH_RTT_RED_S = 0.3;
var STRENGTH_RTT_YELLOW_S = 0.15;
var STRENGTH_RANK = { green: 0, yellow: 1, red: 2 };
var worseStrength = (a, b) => STRENGTH_RANK[a] >= STRENGTH_RANK[b] ? a : b;
var RtcCall = ({
  supabase,
  roomId,
  self,
  peerRole,
  signalingRole,
  selfName,
  peerName,
  appVersion,
  features,
  slots,
  buildBridgeUrl,
  onLifecycle,
  onTelemetry,
  onCallEnd
}) => {
  const pairId = roomId;
  const participantId = self.id;
  const participantRole = self.role;
  const isInitiator = signalingRole === "initiator";
  const featureWhiteboard = features?.whiteboard !== false;
  const featureScreenShare = features?.screenShare !== false;
  const featureChat = features?.chat !== false;
  const featureBridge = features?.bridge !== false;
  const emitLifecycle = useCallback((e) => {
    try {
      onLifecycle?.(e);
    } catch (err) {
      console.error("onLifecycle handler threw:", err);
    }
  }, [onLifecycle]);
  const onCallEndRef = useRef(onCallEnd);
  useEffect(() => {
    onCallEndRef.current = onCallEnd;
  }, [onCallEnd]);
  useEffect(() => {
    void getIceServers(supabase);
  }, []);
  const callEndFiredRef = useRef(false);
  const fireCallEndOnce = (sid, connected, reason) => {
    if (callEndFiredRef.current) return;
    callEndFiredRef.current = true;
    console.warn(`[RtcCall][${participantRole}] fireCallEnd reason=${reason} connected=${connected}`);
    emitLifecycle({ type: "ended", at: Date.now(), wasConnected: connected, reason });
    try {
      onCallEndRef.current?.({ wasConnected: connected });
    } catch (e) {
      console.error("onCallEnd handler threw:", e);
    }
  };
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const isCameraOffRef = useRef(isCameraOff);
  isCameraOffRef.current = isCameraOff;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showNoShowPrompt, setShowNoShowPrompt] = useState(false);
  const [weakNetworkDismissed, setWeakNetworkDismissed] = useState(false);
  const [peerDisconnected, setPeerDisconnected] = useState(false);
  const [peerOnPage, setPeerOnPage] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionStalled, setConnectionStalled] = useState(false);
  const [connStrength, setConnStrength] = useState("green");
  const [reconnectEscalated, setReconnectEscalated] = useState(false);
  const [peerCameraOff, setPeerCameraOff] = useState(false);
  const isMobile = useIsMobile();
  const [audioOnly, setAudioOnly] = useState(false);
  const [myUplinkBad, setMyUplinkBad] = useState(false);
  const [myDownlinkBad, setMyDownlinkBad] = useState(false);
  const [peerUplinkBad, setPeerUplinkBad] = useState(false);
  const [peerDownlinkBad, setPeerDownlinkBad] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [studentDetailsOpen, setStudentDetailsOpen] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const dataChannelRef = useRef(null);
  const pairChat = usePairChat(supabase, featureChat ? pairId : "", participantRole, participantId);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const wbDataChannelRef = useRef(null);
  const wbHandleRef = useRef(null);
  const wbPointerLastSendRef = useRef(0);
  const wbSceneSeqRef = useRef(0);
  const wbLastAckedRemoteSeqRef = useRef(0);
  const wbLastAppliedLocalSeqRef = useRef(0);
  const wbPendingSceneRef = useRef(null);
  const wbLastSentVersionsRef = useRef(/* @__PURE__ */ new Map());
  const wbFlushScheduledRef = useRef(false);
  const wbDrainPollRef = useRef(null);
  const wbChunkAssembliesRef = useRef(/* @__PURE__ */ new Map());
  const wbChunkCleanupRef = useRef(null);
  const wbMessageIdRef = useRef(0);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [bridgeKey, setBridgeKey] = useState(null);
  const [bridgeSessionId, setBridgeSessionId] = useState(null);
  const bridgeDataHandlerRef = useRef(() => {
  });
  const stopHealthPollRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const channelRef = useRef(null);
  const containerRef = useRef(null);
  const waitingTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);
  const joinIntervalRef = useRef(null);
  const videoAttachRetryRef = useRef(null);
  const healthCheckRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const recoveryTimerRef = useRef(null);
  const recoveryAttemptsRef = useRef(0);
  const peerJoinSeenRef = useRef(false);
  const sessionIdRef = useRef(null);
  const myJoinedAtRef = useRef(null);
  const bothConnectedAtRef = useRef(null);
  const connectedAtWrittenRef = useRef(false);
  const creatingSessionRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const elapsedTimerStartedRef = useRef(false);
  const makingOfferRef = useRef(false);
  const retryCountRef = useRef(0);
  const iceRestartAttemptedRef = useRef(false);
  const disconnectedAtRef = useRef(null);
  const peerDisconnectedTimerRef = useRef(null);
  const connectingAtRef = useRef(null);
  const networkStatsRef = useRef(null);
  const prevStatsRef = useRef(null);
  useRef(25e5);
  useRef(1);
  useRef(0);
  useRef(0);
  const uplinkBadCountRef = useRef(0);
  const downlinkBadCountRef = useRef(0);
  const uplinkLoggedRef = useRef(false);
  const downlinkLoggedRef = useRef(false);
  const netQualityChannelRef = useRef(null);
  const noShowSnoozedAtRef = useRef(null);
  const offerSentRef = useRef(false);
  const iceCandidateBufferRef = useRef([]);
  const needsRestartRef = useRef(false);
  const lastPeerJoinAtRef = useRef(0);
  const channelHealthyRef = useRef(false);
  const lastChannelSubAtRef = useRef(0);
  const localStrengthRef = useRef("green");
  const peerStrengthRef = useRef("green");
  const strengthCandidateRef = useRef("green");
  const strengthStableCountRef = useRef(0);
  const loggedStrengthRef = useRef("");
  const reconnectFnRef = useRef(null);
  const manualReconnectAtRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectEscalateTimerRef = useRef(null);
  const startReconnectRef = useRef(null);
  const recoveryReasonRef = useRef("");
  const relayOnlyRef = useRef(false);
  const stopReconnectRef = useRef(null);
  const peerMediaReadyRef = useRef(false);
  const mediaReadyTimerRef = useRef(null);
  const myEpochRef = useRef("");
  const remoteEpochRef = useRef(null);
  const frozenStreakRef = useRef(0);
  useRef(false);
  const remotePlayRetryRef = useRef(null);
  const remoteGestureHookedRef = useRef(false);
  const pendingRemoteSceneRef = useRef(null);
  const videoRampCompleteRef = useRef(false);
  const videoRampTimerRef = useRef(null);
  const whiteboardOpenRef = useRef(false);
  const diagnosticsRef = useRef(null);
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };
  const pendingTelemetryRef = useRef([]);
  const logTelemetry = async (eventType, metadata) => {
    try {
      onTelemetry?.(eventType, metadata);
    } catch {
    }
    if (!isValidUUID2(sessionIdRef.current)) {
      pendingTelemetryRef.current.push({ eventType, metadata });
      return;
    }
    await supabase.from("call_telemetry").insert({
      call_id: sessionIdRef.current,
      participant_id: participantId,
      participant_role: participantRole,
      event_type: eventType,
      metadata: metadata || null
    });
  };
  const flushPendingTelemetry = () => {
    if (!isValidUUID2(sessionIdRef.current) || pendingTelemetryRef.current.length === 0) return;
    const queued = pendingTelemetryRef.current;
    pendingTelemetryRef.current = [];
    for (const ev of queued) {
      void supabase.from("call_telemetry").insert({
        call_id: sessionIdRef.current,
        participant_id: participantId,
        participant_role: participantRole,
        event_type: ev.eventType,
        metadata: ev.metadata || null
      });
    }
  };
  const hookRemoteResumeGesture = useCallback(() => {
    if (remoteGestureHookedRef.current) return;
    remoteGestureHookedRef.current = true;
    const resume = () => {
      const el = remoteVideoRef.current;
      if (el) {
        el.muted = false;
        el.play().catch(() => {
        });
      }
      remoteGestureHookedRef.current = false;
    };
    ["pointerdown", "keydown", "touchstart"].forEach(
      (ev) => document.addEventListener(ev, resume, { once: true, capture: true })
    );
  }, []);
  const ensureRemotePlaying = useCallback(() => {
    if (remotePlayRetryRef.current) return;
    let attempts = 0;
    remotePlayRetryRef.current = setInterval(async () => {
      const el = remoteVideoRef.current;
      if (!el || !el.srcObject) return;
      if (!el.paused && el.readyState >= 2) {
        if (remotePlayRetryRef.current) {
          clearInterval(remotePlayRetryRef.current);
          remotePlayRetryRef.current = null;
        }
        return;
      }
      attempts++;
      try {
        await el.play();
      } catch {
        try {
          el.muted = true;
          await el.play();
          el.muted = false;
          await el.play();
        } catch {
          el.muted = true;
          el.play().catch(() => {
          });
          hookRemoteResumeGesture();
        }
      }
      if (attempts > 40 && remotePlayRetryRef.current) {
        clearInterval(remotePlayRetryRef.current);
        remotePlayRetryRef.current = null;
      }
    }, 400);
  }, [hookRemoteResumeGesture]);
  const attachRemoteStream = useCallback(() => {
    const stream = remoteStreamRef.current;
    const videoEl = remoteVideoRef.current;
    if (!stream || !videoEl) {
      log(participantRole, "attachRemoteStream: missing stream or video element, will retry");
      return false;
    }
    setupVideoEl(videoEl, stream, false);
    log(participantRole, "attachRemoteStream: srcObject set, tracks:", stream.getTracks().map((t) => `${t.kind}:${t.readyState}:enabled=${t.enabled}`));
    ensureRemotePlaying();
    return true;
  }, [participantRole, ensureRemotePlaying]);
  const startVideoAttachRetry = useCallback(() => {
    if (videoAttachRetryRef.current) return;
    let attempts = 0;
    videoAttachRetryRef.current = setInterval(() => {
      attempts++;
      if (attachRemoteStream() || attempts > 20) {
        if (attempts > 20) log(participantRole, "\u26A0\uFE0F Gave up retrying video attach after 20 attempts");
        clearInterval(videoAttachRetryRef.current);
        videoAttachRetryRef.current = null;
      }
    }, 250);
  }, [attachRemoteStream, participantRole]);
  const setRemoteVideoEl = useCallback((el) => {
    remoteVideoRef.current = el;
    if (el && remoteStreamRef.current) {
      setupVideoEl(el, remoteStreamRef.current, false);
      ensureRemotePlaying();
    }
  }, [ensureRemotePlaying]);
  const setLocalVideoEl = useCallback((el) => {
    localVideoRef.current = el;
    if (!el) return;
    const activeStream = screenStreamRef.current ?? localStreamRef.current;
    setupVideoEl(el, activeStream, true);
  }, []);
  const applyVideoMaxBitrate = useCallback((bps) => {
    const pc = pcRef.current;
    const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0] = { ...params.encodings[0], maxBitrate: bps };
      sender.setParameters(params).catch((e) => log(participantRole, "applyVideoMaxBitrate failed:", e));
      log(participantRole, "applyVideoMaxBitrate \u2192", bps);
    } catch (e) {
      log(participantRole, "applyVideoMaxBitrate error:", e);
    }
  }, [participantRole]);
  const attachLocalVideoWatchers = useCallback((track) => {
    track.onmute = () => {
      log(participantRole, "Local video track muted (OS suspend?)");
      if (!isCameraOffRef.current) {
        channelRef.current?.send({
          type: "broadcast",
          event: "camera-toggle",
          payload: { from: participantRole, cameraOff: true }
        });
        logTelemetry("camera_toggle", { camera_off: true, source: "os_suspend" });
      }
    };
    track.onunmute = () => {
      log(participantRole, "Local video track unmuted");
      if (!isCameraOffRef.current) {
        channelRef.current?.send({
          type: "broadcast",
          event: "camera-toggle",
          payload: { from: participantRole, cameraOff: false }
        });
      }
    };
    track.onended = () => log(participantRole, "Local video track ended (OS suspend?)");
  }, [participantRole]);
  const recoveringTracksRef = useRef(false);
  const recoverSuspendedTracks = useCallback(async () => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream || recoveringTracksRef.current) return;
    const oldVideo = stream.getVideoTracks()[0];
    const oldAudio = stream.getAudioTracks()[0];
    const videoDead = !!oldVideo && oldVideo.readyState === "ended";
    const audioDead = !!oldAudio && oldAudio.readyState === "ended";
    if (!videoDead && !audioDead) {
      if (!oldVideo?.muted && !oldAudio?.muted) return;
      if (oldVideo) oldVideo.enabled = !isCameraOffRef.current;
      if (oldAudio) oldAudio.enabled = !isMutedRef.current;
      channelRef.current?.send({
        type: "broadcast",
        event: "camera-toggle",
        payload: { from: participantRole, cameraOff: isCameraOffRef.current }
      });
      return;
    }
    recoveringTracksRef.current = true;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: videoDead ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } : false,
        audio: audioDead ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false
      });
      if (videoDead) {
        const nv = fresh.getVideoTracks()[0];
        if (nv) {
          nv.enabled = !isCameraOffRef.current;
          await pc.getSenders().find((s) => s.track?.kind === "video")?.replaceTrack(nv);
          try {
            oldVideo.stop();
          } catch {
          }
          stream.removeTrack(oldVideo);
          stream.addTrack(nv);
          attachLocalVideoWatchers(nv);
        }
      }
      if (audioDead) {
        const na = fresh.getAudioTracks()[0];
        if (na) {
          na.enabled = !isMutedRef.current;
          await pc.getSenders().find((s) => s.track?.kind === "audio")?.replaceTrack(na);
          try {
            oldAudio.stop();
          } catch {
          }
          stream.removeTrack(oldAudio);
          stream.addTrack(na);
        }
      }
      setupVideoEl(localVideoRef.current, stream, true);
      channelRef.current?.send({
        type: "broadcast",
        event: "camera-toggle",
        payload: { from: participantRole, cameraOff: isCameraOffRef.current }
      });
      logTelemetry("media_recover", { video: videoDead, audio: audioDead, outcome: "recovered" });
      log(participantRole, "Recovered OS-suspended tracks", { videoDead, audioDead });
    } catch (e) {
      logTelemetry("media_recover", { outcome: "failed", error_name: e?.name ?? null });
      log(participantRole, "Track recovery failed:", e);
    } finally {
      recoveringTracksRef.current = false;
    }
  }, [participantRole, attachLocalVideoWatchers]);
  useEffect(() => {
    whiteboardOpenRef.current = whiteboardOpen;
  }, [whiteboardOpen]);
  useEffect(() => {
    if (!whiteboardOpen) return;
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      if (wbHandleRef.current && pendingRemoteSceneRef.current) {
        wbHandleRef.current.applyRemoteScene(pendingRemoteSceneRef.current, void 0);
        pendingRemoteSceneRef.current = null;
        clearInterval(id);
      } else if (tries > 30) {
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [whiteboardOpen]);
  useEffect(() => {
    return;
  }, [pairId, participantRole]);
  const bridgeHost = useBridgeHost({
    supabase,
    sessionId: bridgeSessionId,
    participantRole,
    bridgeKey,
    whiteboardOpen,
    wbHandle: wbHandleRef.current,
    getIceServers: () => getIceServers(supabase),
    onBridgeData: (msg) => bridgeDataHandlerRef.current(msg)
  });
  const bridgeSendRef = useRef(bridgeHost.sendToBridge);
  bridgeSendRef.current = bridgeHost.sendToBridge;
  const createCallSession = async () => {
    if (creatingSessionRef.current || sessionIdRef.current) return;
    creatingSessionRef.current = true;
    const myJoinedAt = myJoinedAtRef.current?.toISOString() || (/* @__PURE__ */ new Date()).toISOString();
    const callId = pairId;
    sessionIdRef.current = callId;
    diagnosticsRef.current?.setCallId(callId);
    await supabase.from("call_participants").upsert(
      { call_id: callId, participant_id: participantId, role: participantRole, joined_at: myJoinedAt },
      { onConflict: "call_id,participant_id" }
    );
    emitLifecycle({ type: "joined", at: Date.now() });
    channelRef.current?.send({
      type: "broadcast",
      event: "session-created",
      payload: { sessionId: callId }
    });
    creatingSessionRef.current = false;
  };
  const endCallSession = async () => {
    if (!sessionIdRef.current) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await supabase.from("call_participants").update({ left_at: now }).eq("call_id", sessionIdRef.current).eq("participant_id", participantId);
  };
  const recordPeerLeft = async () => {
    if (!sessionIdRef.current) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await supabase.from("call_participants").update({ left_at: now }).eq("call_id", sessionIdRef.current).eq("role", peerRole).is("left_at", null);
  };
  const startElapsedTimer = useCallback(() => {
    if (elapsedTimerStartedRef.current) return;
    elapsedTimerStartedRef.current = true;
    if (waitingTimerRef.current) {
      clearInterval(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
    setShowNoShowPrompt(false);
    const startTime = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1e3));
    }, 500);
  }, []);
  const flushIceCandidateBuffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const buffered = iceCandidateBufferRef.current.splice(0);
    if (buffered.length > 0) {
      log(participantRole, `Flushing ${buffered.length} buffered ICE candidates`);
    }
    for (const candidate of buffered) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        log(participantRole, "Error flushing buffered ICE candidate:", err);
      }
    }
  }, [participantRole]);
  const createPeerConnection = useCallback(() => {
    log(participantRole, "createPeerConnection called");
    if (pcRef.current) {
      log(participantRole, "Closing existing PC, state:", pcRef.current.signalingState);
      if (stopHealthPollRef.current) {
        stopHealthPollRef.current();
        stopHealthPollRef.current = null;
      }
      pcRef.current.close();
      pcRef.current = null;
    }
    offerSentRef.current = false;
    iceCandidateBufferRef.current = [];
    needsRestartRef.current = false;
    remoteStreamRef.current = null;
    iceRestartAttemptedRef.current = false;
    disconnectedAtRef.current = null;
    connectingAtRef.current = null;
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    const iceServers = cachedIceServers || FALLBACK_ICE_SERVERS;
    const hasTurn = iceServers.some((s) => {
      const u = s.urls;
      const arr = Array.isArray(u) ? u : [u];
      return arr.some((x) => typeof x === "string" && x.toLowerCase().startsWith("turn"));
    });
    const useRelayOnly = relayOnlyRef.current && hasTurn;
    if (useRelayOnly) log(participantRole, "\u{1F6F0}\uFE0F building PC relay-only (TURN failover)");
    const pc = new RTCPeerConnection({
      iceServers,
      ...useRelayOnly ? { iceTransportPolicy: "relay" } : {}
    });
    void getIceServers(supabase);
    try {
      diagnosticsRef.current?.destroy();
      diagnosticsRef.current = new WebRTCDiagnostics(pc, participantId, participantRole, {
        supabase,
        restUrl: supabase.supabaseUrl ?? "",
        restKey: supabase.supabaseKey ?? "",
        appVersion
      });
      if (sessionIdRef.current) diagnosticsRef.current.setCallId(sessionIdRef.current);
    } catch {
    }
    const wireChatChannel = (dc) => {
      dataChannelRef.current = dc;
    };
    const startWbChunkCleanup = () => {
      if (wbChunkCleanupRef.current) return;
      wbChunkCleanupRef.current = setInterval(() => {
        const now = Date.now();
        for (const [messageId, assembly] of wbChunkAssembliesRef.current.entries()) {
          if (now - assembly.updatedAt > 15e3) wbChunkAssembliesRef.current.delete(messageId);
        }
        if (!wbChunkAssembliesRef.current.size && wbChunkCleanupRef.current) {
          clearInterval(wbChunkCleanupRef.current);
          wbChunkCleanupRef.current = null;
        }
      }, 5e3);
    };
    const applyWhiteboardMessage = (msg) => {
      if (msg.kind === "toggle") {
        setWhiteboardOpen(!!msg.open);
      } else if (msg.kind === "scene") {
        wbLastAckedRemoteSeqRef.current = Math.max(wbLastAckedRemoteSeqRef.current, typeof msg.seq === "number" ? msg.seq : 0);
        if (!wbHandleRef.current) {
          pendingRemoteSceneRef.current = msg.elements || [];
        } else {
          wbHandleRef.current.applyRemoteScene(msg.elements || [], typeof msg.seq === "number" ? msg.seq : void 0);
        }
        bridgeSendRef.current({ kind: "scene", elements: msg.elements || [] });
      } else if (msg.kind === "scene-delta") {
        wbHandleRef.current?.applyRemoteScene(msg.elements || [], void 0);
        bridgeSendRef.current({ kind: "scene-delta", elements: msg.elements || [] });
      } else if (msg.kind === "pointer") {
        wbHandleRef.current?.applyRemotePointer(msg);
      }
    };
    const handleWhiteboardChannelMessage = async (rawData) => {
      const msg = await decodeRtcPayload(rawData);
      if (msg?.kind !== "chunk") {
        applyWhiteboardMessage(msg);
        return;
      }
      if (!msg.messageId || typeof msg.index !== "number" || typeof msg.total !== "number" || !msg.payloadType || typeof msg.data !== "string") {
        return;
      }
      const existing = wbChunkAssembliesRef.current.get(msg.messageId) || {
        chunks: Array.from({ length: msg.total }),
        total: msg.total,
        updatedAt: Date.now()
      };
      existing.total = msg.total;
      existing.updatedAt = Date.now();
      existing.chunks[msg.index] = {
        messageId: msg.messageId,
        index: msg.index,
        total: msg.total,
        payloadType: msg.payloadType,
        data: msg.data
      };
      wbChunkAssembliesRef.current.set(msg.messageId, existing);
      startWbChunkCleanup();
      if (existing.chunks.filter(Boolean).length !== existing.total) return;
      wbChunkAssembliesRef.current.delete(msg.messageId);
      const decoded = await decodeChunkedRtcPayload(existing.chunks);
      applyWhiteboardMessage(decoded);
    };
    const wireWhiteboardChannel = (dc) => {
      dc.bufferedAmountLowThreshold = 24e3;
      dc.onopen = () => {
        log(participantRole, "Whiteboard data channel open");
        wbLastSentVersionsRef.current.clear();
        if (whiteboardOpenRef.current) {
          void sendWb({ kind: "toggle", open: true });
        }
        const snap = wbHandleRef.current?.getElementsSnapshot?.();
        if (snap && snap.length > 0) {
          for (const e of snap) {
            if (e?.id) wbLastSentVersionsRef.current.set(e.id, e.version ?? 0);
          }
          void sendWb({ kind: "scene", seq: wbSceneSeqRef.current, elements: snap }, { coalesceScene: true });
        }
      };
      dc.onclose = () => {
        if (wbDrainPollRef.current) {
          clearInterval(wbDrainPollRef.current);
          wbDrainPollRef.current = null;
        }
        wbFlushScheduledRef.current = false;
      };
      dc.onerror = () => {
        if (wbDrainPollRef.current) {
          clearInterval(wbDrainPollRef.current);
          wbDrainPollRef.current = null;
        }
      };
      dc.onbufferedamountlow = () => {
        if (!wbFlushScheduledRef.current) return;
        wbFlushScheduledRef.current = false;
        const pending = wbPendingSceneRef.current;
        if (!pending) return;
        wbPendingSceneRef.current = null;
        void sendWb({ kind: "scene", seq: pending.seq, elements: pending.elements }, { coalesceScene: true });
      };
      dc.onmessage = (e) => {
        void handleWhiteboardChannelMessage(e.data).catch(() => {
        });
      };
      wbDataChannelRef.current = dc;
    };
    const wireNetQualityChannel = (dc) => {
      dc.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.kind === "netq") {
            setPeerUplinkBad(!!msg.myUplinkBad);
            setPeerDownlinkBad(!!msg.myDownlinkBad);
            if (msg.strength === "green" || msg.strength === "yellow" || msg.strength === "red") {
              peerStrengthRef.current = msg.strength;
              setConnStrength(worseStrength(localStrengthRef.current, peerStrengthRef.current));
            }
          }
        } catch {
        }
      };
      netQualityChannelRef.current = dc;
    };
    if (isInitiator) {
      const chatDc = pc.createDataChannel("chat", { ordered: true, priority: "medium" });
      chatDc.onopen = () => log(participantRole, "Data channel open");
      wireChatChannel(chatDc);
      const wbDc = pc.createDataChannel("whiteboard", { ordered: true, priority: "high" });
      wireWhiteboardChannel(wbDc);
      const nqDc = pc.createDataChannel("netquality", { ordered: false, maxRetransmits: 0 });
      wireNetQualityChannel(nqDc);
    }
    pc.ondatachannel = (e) => {
      log(participantRole, "Remote data channel received:", e.channel.label);
      if (e.channel.label === "whiteboard") {
        wireWhiteboardChannel(e.channel);
      } else if (e.channel.label === "netquality") {
        wireNetQualityChannel(e.channel);
      } else {
        wireChatChannel(e.channel);
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: { candidate: e.candidate.toJSON(), from: participantRole, epoch: myEpochRef.current }
        });
      }
    };
    pc.onicegatheringstatechange = () => {
      log(participantRole, "ICE gathering state:", pc.iceGatheringState);
    };
    pc.oniceconnectionstatechange = () => {
      log(participantRole, "ICE connection state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        startReconnectRef.current?.("ice-failed");
      }
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        iceRestartAttemptedRef.current = false;
        disconnectedAtRef.current = null;
        connectingAtRef.current = null;
      }
      if (pc.iceConnectionState === "disconnected") {
        if (!disconnectedAtRef.current) {
          disconnectedAtRef.current = Date.now();
        }
      }
    };
    pc.onsignalingstatechange = () => {
      log(participantRole, "Signaling state:", pc.signalingState);
    };
    pc.ontrack = (e) => {
      log(participantRole, "\u{1F3A5} ontrack \u2014 kind:", e.track.kind, "readyState:", e.track.readyState);
      let stream;
      if (e.streams[0]) {
        stream = e.streams[0];
      } else {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(e.track);
        stream = remoteStreamRef.current;
      }
      remoteStreamRef.current = stream;
      e.track.onended = () => log(participantRole, "Remote track ended:", e.track.kind);
      e.track.onmute = () => {
        log(participantRole, "Remote track muted:", e.track.kind);
      };
      e.track.onunmute = () => {
        log(participantRole, "Remote track unmuted:", e.track.kind);
        if (e.track.kind === "video") setPeerCameraOff(false);
      };
      if (e.track.kind === "video") setPeerCameraOff(e.track.muted);
      try {
        const r = e.receiver;
        if (r && "jitterBufferTarget" in r) {
          r.jitterBufferTarget = e.track.kind === "video" ? 120 : 80;
        }
      } catch {
      }
      const attached = attachRemoteStream();
      if (!attached) startVideoAttachRetry();
      if (!wasConnectedRef.current) {
        log(participantRole, "\u2705 PEER CONNECTED");
        setIsConnected(true);
        setPeerDisconnected(false);
        setIsReconnecting(false);
        setConnectionStalled(false);
        wasConnectedRef.current = true;
        bothConnectedAtRef.current = /* @__PURE__ */ new Date();
        emitLifecycle({ type: "peerConnected", at: Date.now() });
        emitLifecycle({ type: "connected", at: Date.now() });
        if (!connectedAtWrittenRef.current && sessionIdRef.current) {
          connectedAtWrittenRef.current = true;
          void supabase.from("call_participants").update({ connected_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("call_id", sessionIdRef.current).eq("participant_id", participantId);
        }
        startElapsedTimer();
        logTelemetry("peer_connected");
        if (joinIntervalRef.current) {
          clearInterval(joinIntervalRef.current);
          joinIntervalRef.current = null;
        }
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        if (recoveryTimerRef.current) {
          clearTimeout(recoveryTimerRef.current);
          recoveryTimerRef.current = null;
        }
        retryCountRef.current = 0;
      } else if (peerDisconnected) {
        log(participantRole, "\u2705 PEER RECONNECTED");
        setIsConnected(true);
        setPeerDisconnected(false);
        setIsReconnecting(false);
        setConnectionStalled(false);
        stopReconnectRef.current?.();
        if (joinIntervalRef.current) {
          clearInterval(joinIntervalRef.current);
          joinIntervalRef.current = null;
        }
      }
    };
    pc.onconnectionstatechange = () => {
      log(participantRole, "Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setIsConnected(true);
        setPeerDisconnected(false);
        setIsReconnecting(false);
        setConnectionStalled(false);
        stopReconnectRef.current?.();
        if (peerDisconnectedTimerRef.current) {
          clearTimeout(peerDisconnectedTimerRef.current);
          peerDisconnectedTimerRef.current = null;
        }
        disconnectedAtRef.current = null;
        connectingAtRef.current = null;
        if (remoteStreamRef.current) attachRemoteStream();
        if (videoRampTimerRef.current) clearTimeout(videoRampTimerRef.current);
        videoRampCompleteRef.current = false;
        videoRampTimerRef.current = setTimeout(() => {
          videoRampTimerRef.current = null;
          const cur = pcRef.current;
          if (!cur || cur.connectionState !== "connected") return;
          videoRampCompleteRef.current = true;
          if (!whiteboardOpenRef.current) {
            applyVideoMaxBitrate(25e5);
          }
        }, 1e4);
      }
      if (pc.connectionState === "connecting") {
        if (!connectingAtRef.current) connectingAtRef.current = Date.now();
      }
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        if (videoRampTimerRef.current) {
          clearTimeout(videoRampTimerRef.current);
          videoRampTimerRef.current = null;
        }
        videoRampCompleteRef.current = false;
        if (pc.connectionState === "failed") {
          setIsConnected(false);
          if (wasConnectedRef.current) {
            logTelemetry("peer_disconnected", { connectionState: pc.connectionState });
            startReconnectRef.current?.("conn-failed");
          }
        } else if (wasConnectedRef.current && !peerDisconnectedTimerRef.current) {
          peerDisconnectedTimerRef.current = setTimeout(() => {
            peerDisconnectedTimerRef.current = null;
            const cur = pcRef.current;
            if (!cur) return;
            if (cur.connectionState !== "connected") {
              setIsConnected(false);
              logTelemetry("peer_disconnected", { connectionState: cur.connectionState });
              startReconnectRef.current?.("disconnected");
            }
          }, 5e3);
        }
      }
    };
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      log(participantRole, "Adding", tracks.length, "local tracks to PC");
      const senders = tracks.map((track) => pc.addTrack(track, localStreamRef.current));
      const videoSender = senders.find((s) => s.track?.kind === "video");
      if (videoSender && videoSender.track) {
        try {
          videoSender.track.contentHint = "motion";
        } catch {
        }
        try {
          const params = videoSender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0] = {
            ...params.encodings[0],
            maxBitrate: 1e6,
            maxFramerate: 30,
            scaleResolutionDownBy: 1,
            networkPriority: "low",
            priority: "low"
          };
          params.degradationPreference = "maintain-framerate";
          videoSender.setParameters(params).catch((e) => log(participantRole, "video setParameters failed:", e));
        } catch (e) {
          log(participantRole, "video params error:", e);
        }
      }
      const audioSender = senders.find((s) => s.track?.kind === "audio");
      if (audioSender) {
        try {
          const params = audioSender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0] = {
            ...params.encodings[0],
            maxBitrate: 48e3,
            networkPriority: "high",
            priority: "high"
          };
          audioSender.setParameters(params).catch((e) => log(participantRole, "audio setParameters failed:", e));
        } catch (e) {
          log(participantRole, "audio params error:", e);
        }
      }
      try {
        const RtpRx = window.RTCRtpReceiver;
        const caps = RtpRx?.getCapabilities?.("video");
        if (caps?.codecs?.length) {
          const order = ["video/VP9", "video/VP8", "video/H264"];
          const sorted = [...caps.codecs].sort((a, b) => {
            const ai = order.indexOf(a.mimeType);
            const bi = order.indexOf(b.mimeType);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          });
          const videoTx = pc.getTransceivers().find((t) => t.sender === videoSender);
          if (videoTx && videoTx.setCodecPreferences) {
            videoTx.setCodecPreferences(sorted);
          }
        }
      } catch (e) {
        log(participantRole, "codec pref error:", e);
      }
    } else {
      log(participantRole, "\u26A0\uFE0F No local stream when creating PC!");
    }
    pcRef.current = pc;
    if (stopHealthPollRef.current) stopHealthPollRef.current();
    if (sessionIdRef.current) {
      stopHealthPollRef.current = startRtcHealthPoll({
        supabase,
        callId: sessionIdRef.current,
        participantId,
        participantRole,
        label: "main",
        pc
      });
    }
    return pc;
  }, [pairId, participantId, participantRole, startElapsedTimer, attachRemoteStream, startVideoAttachRetry, applyVideoMaxBitrate]);
  const sendOffer = useCallback(async () => {
    let pc = pcRef.current;
    if (pc && isInitiator && !makingOfferRef.current && pc.signalingState === "have-local-offer" && pc.connectionState !== "connecting" && pc.connectionState !== "connected") {
      log(participantRole, "sendOffer: offerer wedged in have-local-offer \u2014 rebuilding PC");
      createPeerConnection();
      pc = pcRef.current;
    }
    if (!pc || offerSentRef.current || makingOfferRef.current || pc.signalingState === "closed") return;
    log(participantRole, "sendOffer: creating offer");
    makingOfferRef.current = true;
    try {
      const offer = await pc.createOffer({ iceRestart: iceRestartAttemptedRef.current });
      if (pc.signalingState !== "stable") {
        makingOfferRef.current = false;
        return;
      }
      await pc.setLocalDescription({ type: offer.type, sdp: tuneOpusSdp(offer.sdp) });
      offerSentRef.current = true;
      iceRestartAttemptedRef.current = false;
      log(participantRole, "\u{1F4E4} Offer sent");
      logTelemetry("signaling_offer_sent");
      channelRef.current?.send({
        type: "broadcast",
        event: "sdp-offer",
        payload: { sdp: pc.localDescription, from: participantRole, epoch: myEpochRef.current }
      });
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = setTimeout(() => {
        if (wasConnectedRef.current) return;
        if (pcRef.current?.connectionState !== "connected") {
          startReconnectRef.current?.("stuck-connecting");
        }
      }, CONNECTION_TIMEOUT_MS);
    } catch (err) {
      log(participantRole, "\u274C Offer error:", err);
      offerSentRef.current = false;
    } finally {
      makingOfferRef.current = false;
    }
  }, [participantRole, createPeerConnection]);
  const manualReconnect = () => {
    const now = Date.now();
    if (now - manualReconnectAtRef.current < 3e3) return;
    manualReconnectAtRef.current = now;
    setConnectionStalled(false);
    setIsReconnecting(true);
    retryCountRef.current = 0;
    recoveryAttemptsRef.current = 0;
    iceRestartAttemptedRef.current = true;
    logTelemetry("manual_reconnect_clicked");
    reconnectFnRef.current?.();
    window.setTimeout(() => setIsReconnecting(false), 12e3);
  };
  const revertScreenShareOnReconnect = useCallback(() => {
    if (isScreenSharing && screenStreamRef.current) {
      log(participantRole, "Reverting screen share to camera on reconnection");
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      setupVideoEl(localVideoRef.current, localStreamRef.current, true);
    }
  }, [isScreenSharing, participantRole]);
  const onPeerEpoch = useCallback((epoch) => {
    if (!epoch) return;
    const prev = remoteEpochRef.current;
    if (prev === epoch) return;
    remoteEpochRef.current = epoch;
    if (prev === null) return;
    const pc = pcRef.current;
    if (!pc || pc.remoteDescription == null) return;
    log(participantRole, `\u{1F504} peer epoch changed (${prev} \u2192 ${epoch}) \u2014 recover`);
    logTelemetry("peer_epoch_changed", { role: participantRole });
    peerMediaReadyRef.current = false;
    startReconnectRef.current?.("peer-restart");
  }, [participantRole]);
  const RECONNECT_BACKOFF_MS = [3e3, 5e3, 8e3, 12e3];
  const RECONNECT_ESCALATE_MS = 3e5;
  const stopReconnect = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (reconnectEscalateTimerRef.current) {
      clearTimeout(reconnectEscalateTimerRef.current);
      reconnectEscalateTimerRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    recoveryReasonRef.current = "";
    setReconnectEscalated(false);
  };
  const rebuildAndRenegotiate = () => {
    needsRestartRef.current = true;
    iceRestartAttemptedRef.current = true;
    offerSentRef.current = false;
    revertScreenShareOnReconnect();
    createPeerConnection();
    if (isInitiator) setTimeout(() => sendOffer(), 300);
    else channelRef.current?.send({ type: "broadcast", event: "join", payload: { from: participantRole, epoch: myEpochRef.current } });
  };
  const runReconnectAttempt = () => {
    const pc = pcRef.current;
    if (!pc) {
      stopReconnect();
      return;
    }
    const reason = recoveryReasonRef.current;
    reconnectAttemptRef.current++;
    const attempt = reconnectAttemptRef.current;
    const forceRebuild = reason === "peer-restart" && attempt === 1 || attempt > 2;
    if (attempt >= 3) relayOnlyRef.current = true;
    logTelemetry("reconnect_attempt", { attempt, reason, role: participantRole, connectionState: pc.connectionState, relayOnly: relayOnlyRef.current });
    if (isInitiator) {
      if (!forceRebuild && pc.signalingState !== "closed") {
        iceRestartAttemptedRef.current = true;
        try {
          pc.restartIce();
        } catch {
        }
        offerSentRef.current = false;
        sendOffer();
      } else {
        rebuildAndRenegotiate();
      }
    } else {
      if (forceRebuild || pc.signalingState === "closed") {
        rebuildAndRenegotiate();
      } else {
        channelRef.current?.send({ type: "broadcast", event: "join", payload: { from: participantRole, epoch: myEpochRef.current } });
      }
    }
    if (pcRef.current && pcRef.current.connectionState !== "connected") {
      const delay = RECONNECT_BACKOFF_MS[Math.min(attempt - 1, RECONNECT_BACKOFF_MS.length - 1)];
      reconnectTimerRef.current = setTimeout(runReconnectAttempt, delay);
    } else {
      reconnectTimerRef.current = null;
      reconnectAttemptRef.current = 0;
      recoveryReasonRef.current = "";
      setPeerDisconnected(false);
      setIsReconnecting(false);
    }
  };
  const startReconnect = (reason = "recover") => {
    const connected = pcRef.current?.connectionState === "connected";
    const overrideConnected = reason === "peer-restart" || reason === "frozen";
    if (connected && !overrideConnected) return;
    const peerHere = wasConnectedRef.current || Date.now() - lastPeerJoinAtRef.current < 6e3;
    if (!peerHere) return;
    if (reconnectTimerRef.current) return;
    recoveryReasonRef.current = reason;
    if (wasConnectedRef.current) {
      setPeerDisconnected(true);
      setIsReconnecting(true);
      emitLifecycle({ type: "reconnecting", at: Date.now() });
    }
    reconnectAttemptRef.current = 0;
    if (reconnectEscalateTimerRef.current) clearTimeout(reconnectEscalateTimerRef.current);
    setReconnectEscalated(false);
    reconnectEscalateTimerRef.current = setTimeout(() => setReconnectEscalated(true), RECONNECT_ESCALATE_MS);
    logTelemetry("reconnect_started", { reason, role: participantRole });
    runReconnectAttempt();
  };
  startReconnectRef.current = startReconnect;
  stopReconnectRef.current = stopReconnect;
  const startHealthCheck = useCallback(() => {
    if (healthCheckRef.current) return;
    healthCheckRef.current = setInterval(() => {
      const pc = pcRef.current;
      if (pc?.connectionState !== "connected" && Date.now() - lastPeerJoinAtRef.current > 6e3) {
        setPeerPresent(false);
      }
      if (!pc) return;
      if (connectingAtRef.current && pc.connectionState === "connecting") {
        const elapsed = Date.now() - connectingAtRef.current;
        if (elapsed > CONNECTING_THRESHOLD_MS) {
          connectingAtRef.current = null;
          startReconnectRef.current?.("stuck-connecting");
        }
      }
      if (disconnectedAtRef.current && (pc.connectionState === "disconnected" || pc.iceConnectionState === "disconnected")) {
        const elapsed = Date.now() - disconnectedAtRef.current;
        if (elapsed > DISCONNECT_THRESHOLD_MS && pc.iceConnectionState === "failed") {
          disconnectedAtRef.current = null;
          startReconnectRef.current?.("disconnected");
        } else if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          disconnectedAtRef.current = null;
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }, [participantRole, createPeerConnection, sendOffer, revertScreenShareOnReconnect]);
  const startNetworkQualityMonitor = useCallback(() => {
    if (networkStatsRef.current) return;
    networkStatsRef.current = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc || pc.connectionState !== "connected") return;
      try {
        const stats = await pc.getStats();
        let recvBytes = 0;
        let recvPackets = 0;
        let recvPacketsLost = 0;
        let recvJitter = 0;
        let recvFramesDecoded = 0;
        let rtt = 0;
        let sentBytes = 0;
        let sentPackets = 0;
        let remoteLost = 0;
        let remoteRtt = null;
        let remoteFractionLost = null;
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated !== false) {
            if (report.currentRoundTripTime != null) rtt = report.currentRoundTripTime;
          }
          if (report.type === "inbound-rtp" && report.kind === "video") {
            recvBytes += report.bytesReceived || 0;
            recvPackets += report.packetsReceived || 0;
            recvPacketsLost += report.packetsLost || 0;
            if (report.jitter != null) recvJitter = Math.max(recvJitter, report.jitter);
            if (report.framesDecoded != null) recvFramesDecoded += report.framesDecoded;
          }
          if (report.type === "outbound-rtp" && report.kind === "video") {
            sentBytes += report.bytesSent || 0;
            sentPackets += report.packetsSent || 0;
          }
          if (report.type === "remote-inbound-rtp" && report.kind === "video") {
            remoteLost += report.packetsLost || 0;
            if (report.roundTripTime != null) remoteRtt = report.roundTripTime;
            if (report.fractionLost != null) remoteFractionLost = report.fractionLost;
          }
        });
        const now = Date.now();
        const prev = prevStatsRef.current;
        if (prev) {
          const elapsed = (now - prev.ts) / 1e3;
          if (elapsed > 0) {
            const dRecvBytes = Math.max(0, recvBytes - prev.recvBytes);
            const dRecvPkts = Math.max(0, recvPackets - prev.recvPackets);
            const dRecvLost = Math.max(0, recvPacketsLost - prev.recvPacketsLost);
            const recvBitrate = dRecvBytes * 8 / elapsed;
            const hasActiveLocalVideo = !!localStreamRef.current?.getVideoTracks().some((t) => t.enabled && t.readyState === "live");
            const hasActiveRemoteVideo = dRecvPkts > 5;
            const downLoss = dRecvPkts + dRecvLost > 0 ? dRecvLost / (dRecvPkts + dRecvLost) : 0;
            const downBitrateLow = hasActiveRemoteVideo && recvBitrate > 0 && recvBitrate < 5e4;
            const downBad = downLoss > 0.05 || downBitrateLow || rtt > 0.3 && dRecvPkts > 0;
            const dFramesDecoded = prev.framesDecoded != null ? Math.max(0, recvFramesDecoded - prev.framesDecoded) : null;
            const peerSendingVideo = hasActiveRemoteVideo;
            const frozen = peerSendingVideo && dFramesDecoded === 0;
            if (frozen && pc.connectionState === "connected") {
              frozenStreakRef.current++;
              if (frozenStreakRef.current >= 3) {
                frozenStreakRef.current = 0;
                log(participantRole, "\u{1F9CA} sustained frozen frames \u2014 recover");
                logTelemetry("frozen_recovery_triggered", { role: participantRole });
                startReconnectRef.current?.("frozen");
              }
            } else {
              frozenStreakRef.current = 0;
            }
            const collapsed = peerSendingVideo && recvBitrate > 0 && recvBitrate < STRENGTH_BITRATE_RED_BPS;
            let rawStrength = "green";
            if (frozen || collapsed || downLoss > STRENGTH_LOSS_RED || rtt > STRENGTH_RTT_RED_S && dRecvPkts > 0) {
              rawStrength = "red";
            } else if (downLoss > STRENGTH_LOSS_YELLOW || rtt > STRENGTH_RTT_YELLOW_S) {
              rawStrength = "yellow";
            }
            if (rawStrength === strengthCandidateRef.current) {
              strengthStableCountRef.current++;
            } else {
              strengthCandidateRef.current = rawStrength;
              strengthStableCountRef.current = 1;
            }
            if (strengthStableCountRef.current >= 2 && localStrengthRef.current !== rawStrength) {
              localStrengthRef.current = rawStrength;
              if (loggedStrengthRef.current !== rawStrength) {
                loggedStrengthRef.current = rawStrength;
                logTelemetry("connection_strength", {
                  state: rawStrength,
                  recv_bitrate_bps: Math.round(recvBitrate),
                  frames_advancing: dFramesDecoded == null ? null : dFramesDecoded > 0,
                  loss_pct: +(downLoss * 100).toFixed(2),
                  rtt_ms: Math.round(rtt * 1e3)
                });
              }
              setConnStrength(worseStrength(localStrengthRef.current, peerStrengthRef.current));
            }
            const dSentBytes = Math.max(0, sentBytes - prev.sentBytes);
            const dSentPkts = Math.max(0, sentPackets - prev.sentPackets);
            const dRemoteLost = Math.max(0, remoteLost - prev.remoteLost);
            const sendBitrate = dSentBytes * 8 / elapsed;
            const upLossFromFraction = remoteFractionLost ?? -1;
            const upLossFromDelta = dSentPkts + dRemoteLost > 0 ? dRemoteLost / (dSentPkts + dRemoteLost) : 0;
            const upLoss = upLossFromFraction >= 0 ? upLossFromFraction : upLossFromDelta;
            const upRtt = remoteRtt ?? rtt;
            const upBitrateLow = hasActiveLocalVideo && dSentPkts > 5 && sendBitrate > 0 && sendBitrate < 5e4;
            const upBad = hasActiveLocalVideo && (dSentPkts > 0 || remoteRtt != null) && (upLoss > 0.05 || upBitrateLow && upRtt > 0.3);
            const applyVerdict = (isBad, counterRef, setter, loggedRef, direction, meta) => {
              if (isBad) {
                counterRef.current++;
                if (counterRef.current >= 3) {
                  setter(true);
                  if (!loggedRef.current) {
                    loggedRef.current = true;
                    logTelemetry("weak_network_shown", { direction, attributed_to: "self", ...meta });
                  }
                }
              } else {
                counterRef.current = Math.max(0, counterRef.current - 1);
                if (counterRef.current === 0) setter(false);
              }
            };
            applyVerdict(downBad, downlinkBadCountRef, setMyDownlinkBad, downlinkLoggedRef, "downlink", {
              recv_bitrate_bps: Math.round(recvBitrate),
              loss_pct: +(downLoss * 100).toFixed(2),
              rtt_ms: Math.round(rtt * 1e3)
            });
            applyVerdict(upBad, uplinkBadCountRef, setMyUplinkBad, uplinkLoggedRef, "uplink", {
              loss_pct: +(upLoss * 100).toFixed(2),
              rtt_ms: Math.round(upRtt * 1e3),
              send_bitrate_bps: Math.round(sendBitrate)
            });
            const dc = netQualityChannelRef.current;
            if (dc && dc.readyState === "open") {
              try {
                dc.send(JSON.stringify({
                  kind: "netq",
                  myUplinkBad: uplinkBadCountRef.current >= 3,
                  myDownlinkBad: downlinkBadCountRef.current >= 3,
                  strength: localStrengthRef.current
                }));
              } catch {
              }
            }
          }
        }
        prevStatsRef.current = {
          ts: now,
          recvBytes,
          recvPackets,
          recvPacketsLost,
          framesDecoded: recvFramesDecoded,
          sentBytes,
          sentPackets,
          remoteLost
        };
      } catch (err) {
      }
    }, 5e3);
  }, []);
  useEffect(() => {
    if (!myUplinkBad && !peerUplinkBad) {
      setWeakNetworkDismissed(false);
    }
  }, [myUplinkBad, peerUplinkBad]);
  useEffect(() => {
    const onPageHide = () => {
      try {
        const outcome = wasConnectedRef.current ? "success" : "disconnected";
        diagnosticsRef.current?.flushBeacon(outcome);
      } catch {
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === "visible") recoverSuspendedTracks();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
    };
  }, [recoverSuspendedTracks]);
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      log(participantRole, "=== INIT START ===");
      myEpochRef.current = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${participantRole}-${Math.floor(Math.random() * 1e9)}`;
      let stream;
      try {
        log(participantRole, "Requesting media (default video + audio)...");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        logTelemetry("media_acquire", { outcome: "video_audio" });
      } catch (err) {
        log(participantRole, "\u26A0\uFE0F video+audio failed, trying audio only:", err);
        logTelemetry("media_acquire", {
          outcome: "video_audio_failed",
          error_name: err?.name ?? null,
          error_message: err?.message ?? null
        });
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          setAudioOnly(true);
          logTelemetry("media_acquire", { outcome: "audio_only_fallback" });
          toast({ title: "Camera unavailable", description: "Joining with audio only.", variant: "default" });
        } catch (audioErr) {
          log(participantRole, "\u274C All media failed:", audioErr);
          logTelemetry("media_acquire", {
            outcome: "all_media_failed",
            error_name: audioErr?.name ?? null,
            error_message: audioErr?.message ?? null
          });
          toast({ title: "Camera/mic error", description: "Please allow camera and microphone access.", variant: "destructive" });
          try {
            await createCallSession();
          } catch (e) {
            log(participantRole, "createCallSession on media-fail error:", e);
          }
          flushPendingTelemetry();
          return;
        }
      }
      if (!mounted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      stream.getVideoTracks().forEach((t) => {
        t.enabled = true;
      });
      localStreamRef.current = stream;
      myJoinedAtRef.current = /* @__PURE__ */ new Date();
      setupVideoEl(localVideoRef.current, stream, true);
      const initialVideoTrack = stream.getVideoTracks()[0];
      if (initialVideoTrack) attachLocalVideoWatchers(initialVideoTrack);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter((d) => d.kind === "audioinput"));
        setVideoDevices(devices.filter((d) => d.kind === "videoinput"));
        setAudioOutputDevices(devices.filter((d) => d.kind === "audiooutput"));
        const activeAudioTrack = stream.getAudioTracks()[0];
        if (activeAudioTrack) setSelectedMic(activeAudioTrack.getSettings().deviceId || "");
        const activeVideoTrack = stream.getVideoTracks()[0];
        if (activeVideoTrack) setSelectedSpeaker("");
      } catch (e) {
        log(participantRole, "Device enumeration error:", e);
      }
      await createCallSession();
      flushPendingTelemetry();
      try {
        await getIceServers(supabase);
      } catch {
      }
      createPeerConnection();
      startHealthCheck();
      startNetworkQualityMonitor();
      await logTelemetry(`${participantRole}_joined`);
      const waitingStart = Date.now();
      waitingTimerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - waitingStart) / 1e3);
        setWaitingSeconds(elapsed);
        if (elapsed >= 300) {
          const snoozedAt = noShowSnoozedAtRef.current;
          if (!snoozedAt || now - snoozedAt >= 3e5) {
            setShowNoShowPrompt(true);
          }
        }
      }, 500);
      const connectSignaling = () => {
        const channel = supabase.channel(`call-${pairId}`);
        channelRef.current = channel;
        channel.on("broadcast", { event: "sdp-offer" }, async ({ payload }) => {
          if (payload.from === participantRole) return;
          onPeerEpoch(payload.epoch);
          log(participantRole, "\u{1F4E5} Received SDP offer from", payload.from);
          logTelemetry("signaling_offer_received", { from: payload.from });
          const curPc = pcRef.current;
          const pcHealthy = curPc && curPc.connectionState === "connected" && curPc.signalingState !== "closed";
          if (!pcHealthy && (needsRestartRef.current || !curPc || curPc.signalingState === "closed")) {
            log(participantRole, "Recreating PC for incoming offer");
            revertScreenShareOnReconnect();
            createPeerConnection();
          }
          const pc = pcRef.current;
          try {
            const offerCollision = payload.sdp.type === "offer" && (makingOfferRef.current || pc.signalingState !== "stable");
            const isPolite = !isInitiator;
            if (offerCollision && !isPolite) return;
            if (offerCollision && isPolite) {
              await pc.setLocalDescription({ type: "rollback" });
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } else {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            }
            await flushIceCandidateBuffer();
            if (payload.sdp.type === "offer") {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription({ type: answer.type, sdp: tuneOpusSdp(answer.sdp) });
              logTelemetry("signaling_answer_sent");
              channel.send({
                type: "broadcast",
                event: "sdp-answer",
                payload: { sdp: pc.localDescription, from: participantRole, epoch: myEpochRef.current }
              });
            }
          } catch (err) {
            log(participantRole, "\u274C SDP offer handling error:", err);
          }
        }).on("broadcast", { event: "sdp-answer" }, async ({ payload }) => {
          if (payload.from === participantRole) return;
          onPeerEpoch(payload.epoch);
          try {
            logTelemetry("signaling_answer_received", { from: payload.from });
            const currentPc = pcRef.current;
            if (!currentPc || currentPc.signalingState === "stable" || currentPc.signalingState === "closed") return;
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await flushIceCandidateBuffer();
          } catch (err) {
            log(participantRole, "\u274C SDP answer error:", err);
          }
        }).on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
          if (payload.from === participantRole) return;
          if (payload.epoch && remoteEpochRef.current && payload.epoch !== remoteEpochRef.current) return;
          try {
            try {
              diagnosticsRef.current?.noteRemoteCandidate(payload.candidate);
            } catch {
            }
            const pc = pcRef.current;
            if (pc && pc.remoteDescription && pc.signalingState !== "closed") {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              iceCandidateBufferRef.current.push(payload.candidate);
            }
          } catch (err) {
            log(participantRole, "ICE candidate error:", err);
          }
        }).on("broadcast", { event: "call-ended" }, () => {
          handleEndCall(false);
        }).on("broadcast", { event: "session-created" }, ({ payload }) => {
          if (payload.sessionId && !sessionIdRef.current) {
            sessionIdRef.current = payload.sessionId;
            diagnosticsRef.current?.setCallId(payload.sessionId);
            flushPendingTelemetry();
          }
        }).on("broadcast", { event: "join" }, async ({ payload }) => {
          if (payload.from === participantRole) return;
          onPeerEpoch(payload.epoch);
          log(participantRole, "\u{1F4E5} JOIN from", payload.from);
          lastPeerJoinAtRef.current = Date.now();
          setPeerPresent(true);
          setConnectionStalled(false);
          if (!peerJoinSeenRef.current) {
            peerJoinSeenRef.current = true;
            logTelemetry("signaling_join_received", { from: payload.from });
            retryCountRef.current = 0;
            recoveryAttemptsRef.current = 0;
            if (pcRef.current?.connectionState !== "connected") {
              armSignalingRecovery();
            }
          }
          if (pcRef.current?.connectionState === "connected") return;
          if (needsRestartRef.current) {
            revertScreenShareOnReconnect();
            createPeerConnection();
            setPeerDisconnected(false);
          }
          if (isInitiator) {
            offerSentRef.current = false;
            setTimeout(() => sendOffer(), 50);
          }
        }).on("broadcast", { event: "camera-toggle" }, ({ payload }) => {
          if (payload.from === participantRole) return;
          setPeerCameraOff(payload.cameraOff);
        }).on("broadcast", { event: "audio-only-request" }, ({ payload }) => {
          if (payload?.from === participantRole) return;
          turnOffLocalCameraForAudioOnly("audio_only_switch_peer");
          setWeakNetworkDismissed(true);
          toast({
            title: "Switched to audio only",
            description: "Cameras turned off to improve the connection."
          });
        }).on("broadcast", { event: "media-ready" }, ({ payload }) => {
          if (payload?.from === participantRole) return;
          onPeerEpoch(payload.epoch);
          if (peerMediaReadyRef.current) return;
          log(participantRole, "\u{1F4E5} Peer media-ready received");
          peerMediaReadyRef.current = true;
          if (mediaReadyTimerRef.current) {
            clearTimeout(mediaReadyTimerRef.current);
            mediaReadyTimerRef.current = null;
          }
          if (isInitiator && !offerSentRef.current) {
            setTimeout(() => sendOffer(), 0);
          }
        }).subscribe(async (status) => {
          log(participantRole, "Channel status:", status);
          logTelemetry("signaling_channel_status", { status });
          channelHealthyRef.current = status === "SUBSCRIBED";
          if (status === "SUBSCRIBED") {
            lastChannelSubAtRef.current = Date.now();
            armSignalingRecovery();
            channel.send({
              type: "broadcast",
              event: "join",
              payload: { from: participantRole, epoch: myEpochRef.current }
            });
            channel.send({
              type: "broadcast",
              event: "media-ready",
              payload: { from: participantRole, epoch: myEpochRef.current }
            });
            if (isInitiator) {
              if (peerMediaReadyRef.current) {
                setTimeout(() => sendOffer(), 0);
              } else {
                if (mediaReadyTimerRef.current) clearTimeout(mediaReadyTimerRef.current);
                mediaReadyTimerRef.current = setTimeout(() => {
                  mediaReadyTimerRef.current = null;
                  if (!offerSentRef.current) {
                    log(participantRole, "\u23F1\uFE0F media-ready timeout \u2014 sending offer anyway");
                    sendOffer();
                  }
                }, 1e4);
              }
            }
            joinIntervalRef.current = setInterval(() => {
              if (pcRef.current?.connectionState === "connected") {
                if (joinIntervalRef.current) {
                  clearInterval(joinIntervalRef.current);
                  joinIntervalRef.current = null;
                }
                return;
              }
              channel.send({
                type: "broadcast",
                event: "join",
                payload: { from: participantRole, epoch: myEpochRef.current }
              });
            }, 1e3);
          }
        });
      };
      const teardownAndReconnect = async () => {
        if (joinIntervalRef.current) {
          clearInterval(joinIntervalRef.current);
          joinIntervalRef.current = null;
        }
        try {
          if (channelRef.current) supabase.removeChannel(channelRef.current);
        } catch {
        }
        channelRef.current = null;
        channelHealthyRef.current = false;
        peerJoinSeenRef.current = false;
        offerSentRef.current = false;
        try {
          await getIceServers(supabase);
        } catch {
        }
        if (isInitiator) {
          needsRestartRef.current = true;
          revertScreenShareOnReconnect();
          createPeerConnection();
        } else {
          const cur = pcRef.current;
          if (!cur || cur.signalingState === "closed") {
            needsRestartRef.current = true;
            revertScreenShareOnReconnect();
            createPeerConnection();
          }
        }
        connectSignaling();
      };
      const armSignalingRecovery = () => {
        if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = setTimeout(() => {
          recoveryTimerRef.current = null;
          const pc = pcRef.current;
          if (wasConnectedRef.current || pc?.connectionState === "connected") return;
          const peerHere = Date.now() - lastPeerJoinAtRef.current < 6e3;
          if (!peerHere) {
            setIsReconnecting(false);
            const channelDead = !channelHealthyRef.current || !channelRef.current;
            const channelStale = Date.now() - lastChannelSubAtRef.current > 18e4;
            if (channelDead || channelStale) {
              logTelemetry("signaling_keepalive_resubscribe", { reason: channelDead ? "channel_dead" : "periodic" });
              try {
                if (channelRef.current) supabase.removeChannel(channelRef.current);
              } catch {
              }
              channelRef.current = null;
              lastChannelSubAtRef.current = Date.now();
              connectSignaling();
            }
            armSignalingRecovery();
            return;
          }
          if (recoveryAttemptsRef.current >= MAX_SIGNALING_RECOVERY) {
            logTelemetry("signaling_recovery_exhausted", {
              attempts: recoveryAttemptsRef.current,
              connectionState: pc?.connectionState,
              signalingState: pc?.signalingState
            });
            setConnectionStalled(true);
            setIsReconnecting(false);
            return;
          }
          recoveryAttemptsRef.current++;
          setIsReconnecting(true);
          logTelemetry("signaling_recovery_fired", {
            attempt: recoveryAttemptsRef.current,
            connectionState: pc?.connectionState,
            signalingState: pc?.signalingState
          });
          void teardownAndReconnect();
        }, SIGNALING_RECOVERY_MS);
      };
      reconnectFnRef.current = () => {
        void teardownAndReconnect();
      };
      connectSignaling();
    };
    init();
    return () => {
      mounted = false;
      cleanup();
      fireCallEndOnce(sessionIdRef.current, wasConnectedRef.current, "unmount");
    };
  }, []);
  const cleanup = () => {
    log(participantRole, "=== CLEANUP ===");
    if (waitingTimerRef.current) clearInterval(waitingTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (joinIntervalRef.current) clearInterval(joinIntervalRef.current);
    if (videoAttachRetryRef.current) clearInterval(videoAttachRetryRef.current);
    if (remotePlayRetryRef.current) {
      clearInterval(remotePlayRetryRef.current);
      remotePlayRetryRef.current = null;
    }
    if (healthCheckRef.current) clearInterval(healthCheckRef.current);
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (reconnectEscalateTimerRef.current) {
      clearTimeout(reconnectEscalateTimerRef.current);
      reconnectEscalateTimerRef.current = null;
    }
    if (networkStatsRef.current) clearInterval(networkStatsRef.current);
    if (wbDrainPollRef.current) clearInterval(wbDrainPollRef.current);
    if (peerDisconnectedTimerRef.current) {
      clearTimeout(peerDisconnectedTimerRef.current);
      peerDisconnectedTimerRef.current = null;
    }
    if (mediaReadyTimerRef.current) {
      clearTimeout(mediaReadyTimerRef.current);
      mediaReadyTimerRef.current = null;
    }
    if (videoRampTimerRef.current) {
      clearTimeout(videoRampTimerRef.current);
      videoRampTimerRef.current = null;
    }
    if (wbChunkCleanupRef.current) clearInterval(wbChunkCleanupRef.current);
    wbChunkCleanupRef.current = null;
    wbChunkAssembliesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    try {
      diagnosticsRef.current?.destroy();
    } catch {
    }
    bridgeHost.teardown();
  };
  const handleEndCall = async (broadcast = true) => {
    await logTelemetry(`${participantRole}_left`);
    try {
      const outcome = wasConnectedRef.current ? "success" : pcRef.current?.iceConnectionState === "failed" ? "failed" : "disconnected";
      await diagnosticsRef.current?.flushAsync(outcome);
    } catch {
    }
    if (sessionIdRef.current) {
      if (broadcast) {
        await endCallSession();
      } else {
        await recordPeerLeft();
        await endCallSession();
      }
    }
    if (broadcast && channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "call-ended", payload: { from: participantRole } });
    }
    const sid = sessionIdRef.current;
    const connected = wasConnectedRef.current;
    cleanup();
    fireCallEndOnce(sid, connected, broadcast ? "hangup" : "peer-ended");
  };
  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };
  const toggleCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const newCameraOff = !videoTrack.enabled;
      setIsCameraOff(newCameraOff);
      channelRef.current?.send({
        type: "broadcast",
        event: "camera-toggle",
        payload: { from: participantRole, cameraOff: newCameraOff }
      });
      logTelemetry("camera_toggle", { camera_off: newCameraOff, source: "manual" });
    }
  };
  const turnOffLocalCameraForAudioOnly = (source) => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack && videoTrack.enabled) {
      videoTrack.enabled = false;
      setIsCameraOff(true);
      channelRef.current?.send({
        type: "broadcast",
        event: "camera-toggle",
        payload: { from: participantRole, cameraOff: true }
      });
      logTelemetry("camera_toggle", { camera_off: true, source });
    }
  };
  const switchToAudioOnly = () => {
    turnOffLocalCameraForAudioOnly("audio_only_switch");
    channelRef.current?.send({
      type: "broadcast",
      event: "audio-only-request",
      payload: { from: participantRole }
    });
    logTelemetry("audio_only_switch", { initiated_by: participantRole });
    setWeakNetworkDismissed(true);
    toast({
      title: "Switched to audio only",
      description: "Cameras turned off to improve the connection."
    });
  };
  const stopScreenShare = async () => {
    const pc = pcRef.current;
    if (!pc || !screenStreamRef.current) return;
    screenStreamRef.current.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(cameraTrack);
      }
    }
    setIsScreenSharing(false);
    setupVideoEl(localVideoRef.current, localStreamRef.current, true);
    if (isInitiator) {
      offerSentRef.current = false;
      setTimeout(() => sendOffer(), 300);
    }
    logTelemetry("screen_share_stopped");
    toast({ title: "Screen sharing stopped" });
  };
  const startScreenShare = async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(screenTrack);
      }
      setIsScreenSharing(true);
      setupVideoEl(localVideoRef.current, screenStream, true);
      if (isInitiator) {
        offerSentRef.current = false;
        setTimeout(() => sendOffer(), 300);
      }
      screenTrack.onended = () => {
        stopScreenShare();
      };
      logTelemetry("screen_share_started");
    } catch (err) {
      console.log("Screen share cancelled or error:", err);
    }
  };
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      if (whiteboardOpen) {
        setWhiteboardOpen(false);
        sendWb({ kind: "toggle", open: false });
        logTelemetry("whiteboard_closed", { initiator: participantRole, reason: "screen_share_started" });
        toast({ title: "Stopped whiteboard to start screen sharing" });
      }
      await startScreenShare();
    }
  };
  const switchMicrophone = async (deviceId) => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
      const newAudioTrack = newStream.getAudioTracks()[0];
      const oldStream = localStreamRef.current;
      if (oldStream) {
        const oldAudioTrack = oldStream.getAudioTracks()[0];
        if (oldAudioTrack) {
          const wasMuted = !oldAudioTrack.enabled;
          oldStream.removeTrack(oldAudioTrack);
          oldAudioTrack.stop();
          oldStream.addTrack(newAudioTrack);
          newAudioTrack.enabled = !wasMuted;
          const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "audio");
          if (sender) await sender.replaceTrack(newAudioTrack);
        }
      }
      setSelectedMic(deviceId);
      toast({ title: "Microphone changed", description: newAudioTrack.label || "New microphone" });
    } catch (err) {
      log(participantRole, "Mic switch error:", err);
      toast({ title: "Could not switch microphone", variant: "destructive" });
    }
  };
  const switchSpeaker = async (deviceId) => {
    const videoEl = remoteVideoRef.current;
    if (videoEl && typeof videoEl.setSinkId === "function") {
      try {
        await videoEl.setSinkId(deviceId);
        setSelectedSpeaker(deviceId);
        toast({ title: "Speaker changed" });
      } catch (err) {
        log(participantRole, "Speaker switch error:", err);
        toast({ title: "Could not switch speaker", variant: "destructive" });
      }
    } else {
      toast({ title: "Speaker selection not supported in this browser", variant: "destructive" });
    }
  };
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };
  const sendWb = async (payload, options) => {
    const dc = wbDataChannelRef.current;
    if (!dc || dc.readyState !== "open") return;
    try {
      const ensureWbDrainPolling = () => {
        if (wbDrainPollRef.current) return;
        wbDrainPollRef.current = setInterval(() => {
          const currentDc = wbDataChannelRef.current;
          if (!currentDc || currentDc.readyState !== "open") {
            if (wbDrainPollRef.current) {
              clearInterval(wbDrainPollRef.current);
              wbDrainPollRef.current = null;
            }
            return;
          }
          if (currentDc.bufferedAmount <= 24e3 && wbFlushScheduledRef.current) {
            if (wbDrainPollRef.current) {
              clearInterval(wbDrainPollRef.current);
              wbDrainPollRef.current = null;
            }
            wbFlushScheduledRef.current = false;
            const pending = wbPendingSceneRef.current;
            if (!pending) return;
            wbPendingSceneRef.current = null;
            void sendWb({ kind: "scene", seq: pending.seq, elements: pending.elements }, { coalesceScene: true });
          }
        }, 150);
      };
      if (options?.coalesceScene && payload?.kind === "scene" && dc.bufferedAmount > 48e3) {
        wbPendingSceneRef.current = { seq: payload.seq, elements: payload.elements };
        wbFlushScheduledRef.current = true;
        ensureWbDrainPolling();
        return;
      }
      const encoded = await encodeRtcPayload(payload, { compress: options?.compress, thresholdBytes: 4e3 });
      const size = encoded.length;
      if (size > 2e5) console.warn("[Whiteboard] large message", size);
      if (size > 8e3) {
        if (dc.bufferedAmount > 24e3 && options?.coalesceScene && payload?.kind === "scene") {
          wbPendingSceneRef.current = { seq: payload.seq, elements: payload.elements };
          wbFlushScheduledRef.current = true;
          ensureWbDrainPolling();
          return;
        }
        const messageId = `${participantRole}-${Date.now()}-${++wbMessageIdRef.current}`;
        const chunks = chunkEncodedRtcPayload(messageId, encoded, 8e3);
        for (const chunk of chunks) {
          if (!wbDataChannelRef.current || wbDataChannelRef.current.readyState !== "open") break;
          if (dc.bufferedAmount > 48e3 && options?.coalesceScene && payload?.kind === "scene") {
            wbPendingSceneRef.current = { seq: payload.seq, elements: payload.elements };
            wbFlushScheduledRef.current = true;
            ensureWbDrainPolling();
            return;
          }
          dc.send(JSON.stringify({ kind: "chunk", ...chunk }));
        }
        return;
      }
      dc.send(encoded);
    } catch (err) {
      console.warn("[Whiteboard] send failed", err);
    }
  };
  bridgeDataHandlerRef.current = (msg) => {
    if (msg.kind === "scene" || msg.kind === "scene-delta") {
      wbHandleRef.current?.applyRemoteScene(msg.elements || [], void 0);
      void sendWb(msg);
    }
  };
  const toggleWhiteboard = async () => {
    const next = !whiteboardOpen;
    if (next && isScreenSharing) {
      await stopScreenShare();
      toast({ title: "Stopped screen sharing to open whiteboard" });
    }
    setWhiteboardOpen(next);
    sendWb({ kind: "toggle", open: next });
    if (next) {
      applyVideoMaxBitrate(5e5);
    } else {
      applyVideoMaxBitrate(videoRampCompleteRef.current ? 25e5 : 1e6);
    }
    logTelemetry(next ? "whiteboard_opened" : "whiteboard_closed", { initiator: participantRole });
  };
  const handleWbLocalChange = useCallback((elements) => {
    const fullSnapshot = wbHandleRef.current?.getElementsSnapshot?.() || elements;
    const versions = wbLastSentVersionsRef.current;
    const delta = [];
    for (const e of fullSnapshot) {
      if (!e || !e.id) continue;
      const v = e.version ?? 0;
      if (versions.get(e.id) !== v) delta.push(e);
    }
    if (delta.length === 0) return;
    for (const e of fullSnapshot) {
      if (e?.id) versions.set(e.id, e.version ?? 0);
    }
    wbSceneSeqRef.current += 1;
    wbLastAppliedLocalSeqRef.current = wbSceneSeqRef.current;
    void sendWb({ kind: "scene-delta", seq: wbSceneSeqRef.current, elements: delta });
    bridgeSendRef.current({ kind: "scene-delta", elements: delta });
  }, []);
  const handleWbPointer = useCallback((p) => {
    const now = Date.now();
    if (now - wbPointerLastSendRef.current < 50) return;
    wbPointerLastSendRef.current = now;
    void sendWb({ kind: "pointer", ...p });
  }, []);
  const peerLabel = peerRole;
  const peerDisplayName = peerName && peerName.trim() ? peerName.trim() : peerLabel.charAt(0).toUpperCase() + peerLabel.slice(1);
  return /* @__PURE__ */ jsxs("div", { ref: containerRef, "data-in-call": "true", className: "fixed inset-0 z-50 bg-foreground/95 overflow-hidden flex flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex-1 min-h-0 flex", children: [
      /* @__PURE__ */ jsxs("div", { className: `relative bg-black ${studentDetailsOpen ? "flex-1 min-w-0" : "flex-1"}`, children: [
        whiteboardOpen ? /* @__PURE__ */ jsx(DraggablePiP, { sizeClassName: "w-28 sm:w-44 aspect-video", children: /* @__PURE__ */ jsx("video", { ref: setRemoteVideoEl, autoPlay: true, playsInline: true, className: "w-full h-full object-contain pointer-events-none" }) }) : /* @__PURE__ */ jsx("div", { className: "absolute inset-0", children: /* @__PURE__ */ jsx("video", { ref: setRemoteVideoEl, autoPlay: true, playsInline: true, className: "w-full h-full object-contain" }) }),
        whiteboardOpen && /* @__PURE__ */ jsx(
          WhiteboardPanel,
          {
            ref: wbHandleRef,
            onLocalChange: handleWbLocalChange,
            onPointerUpdate: handleWbPointer,
            remoteRole: peerLabel
          }
        ),
        isConnected && peerCameraOff && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center bg-black/80", children: /* @__PURE__ */ jsxs("div", { className: "text-center text-white/70", children: [
          /* @__PURE__ */ jsx(VideoOff, { className: "h-10 w-10 mx-auto mb-2 opacity-50" }),
          /* @__PURE__ */ jsxs("p", { className: "text-sm", children: [
            peerLabel.charAt(0).toUpperCase() + peerLabel.slice(1),
            " has their camera off"
          ] })
        ] }) }),
        !isConnected && !peerDisconnected && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "text-center text-white/80", children: [
          /* @__PURE__ */ jsx("div", { className: "animate-pulse text-lg mb-2", children: connectionStalled ? `Having trouble connecting to ${peerDisplayName}. Tap Reconnect to try again.` : isReconnecting ? `Reconnecting to ${peerDisplayName}\u2026` : peerPresent ? `${peerDisplayName} has joined \u2014 setting up your connection` : `Waiting for ${peerDisplayName} to join...` }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-white/50", children: formatTime(waitingSeconds) }),
          !connectionStalled && !isReconnecting && !peerPresent && /* @__PURE__ */ jsxs("p", { className: "text-xs text-white/40 mt-2", children: [
            "We\u2019ll connect you automatically as soon as ",
            peerDisplayName,
            " joins \u2014 no need to refresh."
          ] }),
          connectionStalled && /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              disabled: isReconnecting,
              onClick: manualReconnect,
              className: "mt-3 rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60",
              children: isReconnecting ? "Reconnecting\u2026" : "Reconnect"
            }
          )
        ] }) }),
        !whiteboardOpen && /* @__PURE__ */ jsx(DraggablePiP, { sizeClassName: "w-24 sm:w-36 aspect-video", children: /* @__PURE__ */ jsx(
          "video",
          {
            ref: setLocalVideoEl,
            autoPlay: true,
            playsInline: true,
            muted: true,
            className: "w-full h-full object-cover pointer-events-none",
            style: { transform: isScreenSharing ? "none" : "scaleX(-1)" }
          }
        ) }),
        isConnected && /* @__PURE__ */ jsx("div", { className: "absolute top-3 left-3 bg-black/60 text-white text-xs px-3 py-1 rounded-full", children: formatTime(elapsedSeconds) }),
        isScreenSharing && /* @__PURE__ */ jsx("div", { className: "absolute top-3 right-3 bg-blue-600 text-white text-xs px-3 py-1 rounded-full", children: "Sharing Screen" }),
        audioOnly && !isConnected && /* @__PURE__ */ jsx("div", { className: "absolute bottom-12 left-3 bg-yellow-600 text-white text-xs px-3 py-1 rounded-full", children: "Audio Only" }),
        (() => {
          if (!isConnected || weakNetworkDismissed) return null;
          const selfWeak = myUplinkBad;
          const partnerWeak = peerUplinkBad;
          if (!selfWeak && !partnerWeak) return null;
          const partnerLabel = `your ${peerRole}`;
          let message;
          if (selfWeak && partnerWeak) {
            message = `Both connections look weak. Turning off cameras on both sides will improve audio quality.`;
          } else if (selfWeak) {
            message = `Your internet looks weak. Consider turning off your camera so ${partnerLabel} can still hear you clearly.`;
          } else {
            message = `Your ${peerRole}'s internet looks weak. Ask them to turn off their camera, or turn off yours, for clearer audio.`;
          }
          return /* @__PURE__ */ jsxs("div", { className: "absolute bottom-12 left-3 right-3 flex items-center gap-2 bg-yellow-600/90 text-white text-xs px-3 py-2 rounded-lg", children: [
            /* @__PURE__ */ jsx(Wifi, { className: "h-3.5 w-3.5 flex-shrink-0" }),
            /* @__PURE__ */ jsx("span", { className: "flex-1", children: message }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: switchToAudioOnly,
                className: "ml-1 flex-shrink-0 rounded-md bg-white/20 hover:bg-white/30 px-2 py-1 font-medium whitespace-nowrap",
                children: "Switch to audio only"
              }
            ),
            /* @__PURE__ */ jsx("button", { onClick: () => setWeakNetworkDismissed(true), className: "ml-1 hover:opacity-80", children: /* @__PURE__ */ jsx(X, { className: "h-3.5 w-3.5" }) })
          ] });
        })(),
        featureChat && chatOpen && /* @__PURE__ */ jsxs("div", { className: "absolute top-0 right-0 bottom-0 w-full sm:w-72 bg-card/95 backdrop-blur border-l flex flex-col z-40 px-3 pb-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between py-2 border-b", children: [
            /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-card-foreground", children: "Chat" }),
            /* @__PURE__ */ jsx("button", { onClick: () => {
              setChatOpen(false);
              pairChat.setActive(false);
            }, className: "text-muted-foreground hover:text-foreground", children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4" }) })
          ] }),
          /* @__PURE__ */ jsx(
            PairChatThread,
            {
              messages: pairChat.messages,
              selfRole: participantRole,
              loading: pairChat.loading,
              onSend: pairChat.send,
              compact: true
            }
          )
        ] }),
        sidePanelOpen && slots?.sidePanel && /* @__PURE__ */ jsx("div", { className: "absolute top-0 right-0 bottom-0 w-full sm:w-72 bg-card/95 backdrop-blur border-l flex flex-col z-40 px-3 pb-2", children: slots.sidePanel({ close: () => setSidePanelOpen(false) }) })
      ] }),
      studentDetailsOpen && slots?.peerInfo && !isMobile && /* @__PURE__ */ jsxs("div", { className: "w-[380px] shrink-0 bg-white overflow-y-auto flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-gray-200", children: [
          /* @__PURE__ */ jsx("h3", { className: "text-sm font-semibold text-gray-900", children: slots?.peerInfoTitle ?? "Details" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setStudentDetailsOpen(false),
              className: "inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 h-7 w-7 transition-colors",
              "aria-label": "Close details",
              children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4" })
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 overflow-y-auto", children: slots.peerInfo })
      ] })
    ] }),
    !isMobile && /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-center gap-2 sm:gap-3 p-2 sm:p-3 bg-black/80", children: [
      /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", className: `rounded-full ${isMuted ? "bg-destructive text-white" : "text-white hover:bg-white/20"}`, onClick: toggleMute, children: isMuted ? /* @__PURE__ */ jsx(MicOff, { className: "h-5 w-5" }) : /* @__PURE__ */ jsx(Mic, { className: "h-5 w-5" }) }),
      !audioOnly && /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", className: `rounded-full ${isCameraOff ? "bg-destructive text-white" : "text-white hover:bg-white/20"}`, onClick: toggleCamera, children: isCameraOff ? /* @__PURE__ */ jsx(VideoOff, { className: "h-5 w-5" }) : /* @__PURE__ */ jsx(Video, { className: "h-5 w-5" }) }),
      featureScreenShare && /* @__PURE__ */ jsx(
        Button,
        {
          variant: "ghost",
          size: "icon",
          className: `rounded-full ${isScreenSharing ? "bg-blue-600 text-white" : "text-white hover:bg-white/20"}`,
          onClick: toggleScreenShare,
          title: isScreenSharing ? "Stop sharing" : "Share screen",
          children: isScreenSharing ? /* @__PURE__ */ jsx(MonitorOff, { className: "h-5 w-5" }) : /* @__PURE__ */ jsx(Monitor, { className: "h-5 w-5" })
        }
      ),
      featureWhiteboard && /* @__PURE__ */ jsx(
        Button,
        {
          variant: "ghost",
          size: "icon",
          className: `rounded-full ${whiteboardOpen ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`,
          onClick: toggleWhiteboard,
          title: whiteboardOpen ? "Close Whiteboard" : "Whiteboard",
          children: /* @__PURE__ */ jsx(SquarePen, { className: "h-5 w-5" })
        }
      ),
      /* @__PURE__ */ jsx(Button, { variant: "destructive", size: "icon", className: "rounded-full", onClick: () => handleEndCall(), children: /* @__PURE__ */ jsx(PhoneOff, { className: "h-5 w-5" }) }),
      featureChat && /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "ghost",
            size: "icon",
            className: `rounded-full ${chatOpen ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`,
            onClick: () => {
              const next = !chatOpen;
              setChatOpen(next);
              if (next) setSidePanelOpen(false);
              pairChat.setActive(next);
            },
            title: "Chat",
            children: /* @__PURE__ */ jsx(MessageSquare, { className: "h-5 w-5" })
          }
        ),
        pairChat.unread && !chatOpen && /* @__PURE__ */ jsx("span", { className: "absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" })
      ] }),
      slots?.sidePanel && slots?.sidePanelButton && /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "ghost",
            size: "icon",
            className: `rounded-full ${sidePanelOpen ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`,
            onClick: () => {
              const next = !sidePanelOpen;
              setSidePanelOpen(next);
              if (next) {
                setChatOpen(false);
                pairChat.setActive(false);
              }
            },
            title: slots.sidePanelButton.title,
            children: slots.sidePanelButton.icon
          }
        ),
        slots.sidePanelButton.showBadge && !sidePanelOpen && /* @__PURE__ */ jsx("span", { className: "absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" })
      ] }),
      /* @__PURE__ */ jsxs(Popover, { open: showDevicePicker, onOpenChange: setShowDevicePicker, children: [
        /* @__PURE__ */ jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", className: "rounded-full text-white hover:bg-white/20", title: "Audio & Video Settings", children: /* @__PURE__ */ jsx(Settings, { className: "h-5 w-5" }) }) }),
        /* @__PURE__ */ jsx(PopoverContent, { className: "w-72 p-4", side: "top", align: "center", children: /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx("h4", { className: "text-sm font-semibold", children: "Audio & Video Settings" }),
          audioDevices.length > 0 && /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label2, { className: "text-xs text-muted-foreground", children: "Microphone" }),
            /* @__PURE__ */ jsxs(Select, { value: selectedMic, onValueChange: switchMicrophone, children: [
              /* @__PURE__ */ jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select microphone" }) }),
              /* @__PURE__ */ jsx(SelectContent, { children: audioDevices.map((d) => /* @__PURE__ */ jsx(SelectItem, { value: d.deviceId, className: "text-xs", children: d.label || `Microphone ${audioDevices.indexOf(d) + 1}` }, d.deviceId)) })
            ] })
          ] }),
          audioOutputDevices.length > 0 && /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label2, { className: "text-xs text-muted-foreground", children: "Speaker" }),
            /* @__PURE__ */ jsxs(Select, { value: selectedSpeaker, onValueChange: switchSpeaker, children: [
              /* @__PURE__ */ jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select speaker" }) }),
              /* @__PURE__ */ jsx(SelectContent, { children: audioOutputDevices.map((d) => /* @__PURE__ */ jsx(SelectItem, { value: d.deviceId, className: "text-xs", children: d.label || `Speaker ${audioOutputDevices.indexOf(d) + 1}` }, d.deviceId)) })
            ] })
          ] }),
          audioDevices.length === 0 && audioOutputDevices.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "No audio devices found." }),
          slots?.peerInfo && !isMobile && /* @__PURE__ */ jsx("div", { className: "pt-2 border-t border-border", children: /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "ghost",
              size: "sm",
              className: "w-full justify-start text-xs h-8",
              onClick: () => {
                setStudentDetailsOpen(!studentDetailsOpen);
                setShowDevicePicker(false);
              },
              children: [
                /* @__PURE__ */ jsx("span", { className: "mr-2 inline-flex", children: slots?.peerInfoIcon ?? /* @__PURE__ */ jsx(Settings, { className: "h-3.5 w-3.5" }) }),
                studentDetailsOpen ? `Hide ${(slots?.peerInfoTitle ?? "details").toLowerCase()}` : slots?.peerInfoTitle ?? "Details"
              ]
            }
          ) }),
          featureBridge && whiteboardOpen && /* @__PURE__ */ jsx("div", { className: `pt-2 ${slots?.peerInfo ? "" : "border-t border-border"}`, children: /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "ghost",
              size: "sm",
              className: "w-full justify-start text-xs h-8",
              onClick: () => {
                if (!bridgeKey) {
                  const key = generateBridgeKey();
                  setBridgeKey(key);
                  setBridgeSessionId(sessionIdRef.current);
                }
                setShareModalOpen(true);
                setShowDevicePicker(false);
              },
              children: [
                /* @__PURE__ */ jsx(Tablet, { className: "h-3.5 w-3.5 mr-2" }),
                "Connect another screen"
              ]
            }
          ) })
        ] }) })
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", className: "rounded-full text-white hover:bg-white/20", onClick: toggleFullscreen, children: isFullscreen ? /* @__PURE__ */ jsx(Minimize2, { className: "h-5 w-5" }) : /* @__PURE__ */ jsx(Maximize2, { className: "h-5 w-5" }) })
    ] }),
    isMobile && /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-center gap-2 sm:gap-3 p-2 sm:p-3 bg-black/80", children: [
      /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", className: `rounded-full ${isMuted ? "bg-destructive text-white" : "text-white hover:bg-white/20"}`, onClick: toggleMute, children: isMuted ? /* @__PURE__ */ jsx(MicOff, { className: "h-5 w-5" }) : /* @__PURE__ */ jsx(Mic, { className: "h-5 w-5" }) }),
      !audioOnly && /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", className: `rounded-full ${isCameraOff ? "bg-destructive text-white" : "text-white hover:bg-white/20"}`, onClick: toggleCamera, children: isCameraOff ? /* @__PURE__ */ jsx(VideoOff, { className: "h-5 w-5" }) : /* @__PURE__ */ jsx(Video, { className: "h-5 w-5" }) }),
      featureChat && /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "ghost",
            size: "icon",
            className: `rounded-full ${chatOpen ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`,
            onClick: () => {
              const next = !chatOpen;
              setChatOpen(next);
              if (next) setSidePanelOpen(false);
              pairChat.setActive(next);
            },
            title: "Chat",
            children: /* @__PURE__ */ jsx(MessageSquare, { className: "h-5 w-5" })
          }
        ),
        pairChat.unread && !chatOpen && /* @__PURE__ */ jsx("span", { className: "absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" })
      ] }),
      slots?.sidePanel && slots?.sidePanelButton && /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "ghost",
            size: "icon",
            className: `rounded-full ${sidePanelOpen ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`,
            onClick: () => {
              const next = !sidePanelOpen;
              setSidePanelOpen(next);
              if (next) {
                setChatOpen(false);
                pairChat.setActive(false);
              }
            },
            title: slots.sidePanelButton.title,
            children: slots.sidePanelButton.icon
          }
        ),
        slots.sidePanelButton.showBadge && !sidePanelOpen && /* @__PURE__ */ jsx("span", { className: "absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" })
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "destructive", size: "icon", className: "rounded-full", onClick: () => handleEndCall(), children: /* @__PURE__ */ jsx(PhoneOff, { className: "h-5 w-5" }) }),
      /* @__PURE__ */ jsxs(Popover, { open: showDevicePicker, onOpenChange: setShowDevicePicker, children: [
        /* @__PURE__ */ jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", className: "rounded-full text-white hover:bg-white/20", title: "More options", children: /* @__PURE__ */ jsx(MoreVertical, { className: "h-5 w-5" }) }) }),
        /* @__PURE__ */ jsx(PopoverContent, { className: "w-64 p-2", side: "top", align: "center", children: /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          featureScreenShare && /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "ghost",
              size: "sm",
              className: `w-full justify-start text-xs h-9 ${isScreenSharing ? "text-blue-600" : ""}`,
              onClick: () => {
                toggleScreenShare();
                setShowDevicePicker(false);
              },
              children: [
                isScreenSharing ? /* @__PURE__ */ jsx(MonitorOff, { className: "h-4 w-4 mr-2" }) : /* @__PURE__ */ jsx(Monitor, { className: "h-4 w-4 mr-2" }),
                isScreenSharing ? "Stop sharing" : "Share screen"
              ]
            }
          ),
          featureWhiteboard && /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "ghost",
              size: "sm",
              className: `w-full justify-start text-xs h-9 ${whiteboardOpen ? "text-primary" : ""}`,
              onClick: () => {
                toggleWhiteboard();
                setShowDevicePicker(false);
              },
              children: [
                /* @__PURE__ */ jsx(SquarePen, { className: "h-4 w-4 mr-2" }),
                whiteboardOpen ? "Close Whiteboard" : "Whiteboard"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "ghost",
              size: "sm",
              className: "w-full justify-start text-xs h-9",
              onClick: () => {
                toggleFullscreen();
                setShowDevicePicker(false);
              },
              children: [
                isFullscreen ? /* @__PURE__ */ jsx(Minimize2, { className: "h-4 w-4 mr-2" }) : /* @__PURE__ */ jsx(Maximize2, { className: "h-4 w-4 mr-2" }),
                isFullscreen ? "Exit fullscreen" : "Fullscreen"
              ]
            }
          ),
          featureBridge && whiteboardOpen && /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "ghost",
              size: "sm",
              className: "w-full justify-start text-xs h-9",
              onClick: () => {
                if (!bridgeKey) {
                  const key = generateBridgeKey();
                  setBridgeKey(key);
                  setBridgeSessionId(sessionIdRef.current);
                }
                setShareModalOpen(true);
                setShowDevicePicker(false);
              },
              children: [
                /* @__PURE__ */ jsx(Tablet, { className: "h-4 w-4 mr-2" }),
                "Connect another screen"
              ]
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "pt-2 mt-1 border-t border-border space-y-2", children: [
            /* @__PURE__ */ jsx("h4", { className: "text-xs font-semibold px-1", children: "Audio & Video" }),
            audioDevices.length > 0 && /* @__PURE__ */ jsxs("div", { className: "space-y-1.5 px-1", children: [
              /* @__PURE__ */ jsx(Label2, { className: "text-xs text-muted-foreground", children: "Microphone" }),
              /* @__PURE__ */ jsxs(Select, { value: selectedMic, onValueChange: switchMicrophone, children: [
                /* @__PURE__ */ jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select microphone" }) }),
                /* @__PURE__ */ jsx(SelectContent, { children: audioDevices.map((d) => /* @__PURE__ */ jsx(SelectItem, { value: d.deviceId, className: "text-xs", children: d.label || `Microphone ${audioDevices.indexOf(d) + 1}` }, d.deviceId)) })
              ] })
            ] }),
            audioOutputDevices.length > 0 && /* @__PURE__ */ jsxs("div", { className: "space-y-1.5 px-1", children: [
              /* @__PURE__ */ jsx(Label2, { className: "text-xs text-muted-foreground", children: "Speaker" }),
              /* @__PURE__ */ jsxs(Select, { value: selectedSpeaker, onValueChange: switchSpeaker, children: [
                /* @__PURE__ */ jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select speaker" }) }),
                /* @__PURE__ */ jsx(SelectContent, { children: audioOutputDevices.map((d) => /* @__PURE__ */ jsx(SelectItem, { value: d.deviceId, className: "text-xs", children: d.label || `Speaker ${audioOutputDevices.indexOf(d) + 1}` }, d.deviceId)) })
              ] })
            ] }),
            audioDevices.length === 0 && audioOutputDevices.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground px-1", children: "No audio devices found." })
          ] })
        ] }) })
      ] })
    ] }),
    peerDisconnected && !isConnected && /* @__PURE__ */ jsxs("div", { className: "absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-black/80 text-white text-sm px-4 py-2 rounded-full shadow-lg max-w-[92%]", children: [
      /* @__PURE__ */ jsx("span", { className: "h-2 w-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" }),
      /* @__PURE__ */ jsx("span", { children: reconnectEscalated ? `Still trying to reconnect to ${peerLabel} \u2014 this may be your or their internet.` : `Reconnecting to ${peerLabel}\u2026` }),
      reconnectEscalated && /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => handleEndCall(),
          className: "flex-shrink-0 rounded-md border border-white/30 bg-white/15 px-3 py-1 text-xs font-medium text-white hover:bg-white/25",
          children: "End & rejoin"
        }
      )
    ] }),
    isConnected && (() => {
      const color = connStrength === "red" ? "#ef4444" : connStrength === "yellow" ? "#f59e0b" : "#10b981";
      const label = connStrength === "red" ? "Poor connection" : connStrength === "yellow" ? "Fair connection" : "Good connection";
      return /* @__PURE__ */ jsx(
        "div",
        {
          className: "absolute bottom-3 left-3 z-20 flex items-end gap-[2px]",
          role: "img",
          "aria-label": label,
          title: label,
          children: [6, 9, 12].map((h) => /* @__PURE__ */ jsx(
            "span",
            {
              className: "w-[3px] rounded-full",
              style: { height: h, backgroundColor: color, filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.55))" }
            },
            h
          ))
        }
      );
    })(),
    showNoShowPrompt && !isConnected && !peerDisconnected && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center bg-black/70 z-10", children: /* @__PURE__ */ jsxs("div", { className: "bg-card rounded-xl p-6 shadow-2xl border max-w-sm text-center", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-card-foreground mb-1", children: "Still waiting..." }),
      /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground mb-4", children: [
        "Your ",
        peerLabel,
        " hasn't joined yet. Would you like to keep waiting?"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3 justify-center", children: [
        /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: () => {
          setShowNoShowPrompt(false);
          noShowSnoozedAtRef.current = Date.now();
        }, children: "Keep Waiting" }),
        /* @__PURE__ */ jsx(Button, { variant: "destructive", onClick: () => handleEndCall(), children: "End Call" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(
      ShareToDeviceModal,
      {
        open: shareModalOpen,
        onClose: () => setShareModalOpen(false),
        url: bridgeKey && bridgeSessionId && buildBridgeUrl ? buildBridgeUrl({ sessionId: bridgeSessionId, role: participantRole, bridgeKey }) : ""
      }
    ),
    /* @__PURE__ */ jsx(Toaster, {})
  ] });
};
var CHUNK_SIZE2 = 8e3;
var MAX_RECONNECT_ATTEMPTS = 5;
var RECONNECT_DELAY_MS = 2e3;
function bridgeLog2(supabase, sessionId, role, event, meta) {
  supabase.from("call_telemetry").insert({
    call_id: sessionId,
    participant_id: `bridge-ipad-${role}`,
    participant_role: role,
    event_type: `bridge_ipad_${event}`,
    metadata: meta ?? null
  }).then(({ error }) => {
    if (error) console.warn("[BridgeCanvas] telemetry insert failed", error.message);
  });
}
var FALLBACK_ICE_SERVERS2 = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
];
async function fetchIceServers(supabase) {
  try {
    const { data, error } = await supabase.functions.invoke("get-turn-credentials");
    if (error) throw error;
    const cf = data?.iceServers;
    if (!cf) throw new Error("No iceServers in response");
    const cfArr = Array.isArray(cf) ? cf : [cf];
    return [{ urls: "stun:stun.cloudflare.com:3478" }, ...cfArr];
  } catch {
    return FALLBACK_ICE_SERVERS2;
  }
}
function useBridgeCanvas({ supabase, sessionId, role, bridgeKey, wbHandle }) {
  const [status, setStatus] = useState("connecting");
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const channelRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const chunkAssembliesRef = useRef(/* @__PURE__ */ new Map());
  const msgIdRef = useRef(0);
  const iceCandidateBufferRef = useRef([]);
  const wbHandleRef = useRef(wbHandle);
  const sessionEndedRef = useRef(false);
  const stopHealthPollRef = useRef(null);
  const effectMountIdRef = useRef(0);
  wbHandleRef.current = wbHandle;
  const sendRaw = useCallback((payload) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") {
      bridgeLog2(supabase, sessionId, role, "send_drop", {
        reason: !dc ? "no_dc" : `state_${dc.readyState}`,
        kind: payload?.kind
      });
      return;
    }
    try {
      const encoded = JSON.stringify(payload);
      if (encoded.length <= CHUNK_SIZE2) {
        dc.send(encoded);
        return;
      }
      msgIdRef.current += 1;
      const messageId = `bridge-ipad-${Date.now()}-${msgIdRef.current}`;
      const chunks = chunkEncodedRtcPayload(messageId, encoded, CHUNK_SIZE2);
      for (const chunk of chunks) {
        dc.send(JSON.stringify({ kind: "chunk", ...chunk }));
      }
    } catch (err) {
      bridgeLog2(supabase, sessionId, role, "send_error", {
        kind: payload?.kind,
        error: err?.message || String(err),
        bufferedAmount: dc.bufferedAmount
      });
    }
  }, [supabase, sessionId, role]);
  const sendDelta = useCallback((elements) => {
    bridgeLog2(supabase, sessionId, role, "send_delta", { elementCount: elements.length });
    sendRaw({ kind: "scene-delta", elements });
  }, [supabase, sendRaw, sessionId, role]);
  const sendPointer = useCallback((p) => {
    sendRaw({ kind: "pointer", ...p });
  }, [sendRaw]);
  const closePC = useCallback(() => {
    if (stopHealthPollRef.current) {
      stopHealthPollRef.current();
      stopHealthPollRef.current = null;
    }
    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch {
      }
      dcRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
      }
      pcRef.current = null;
    }
    iceCandidateBufferRef.current = [];
    chunkAssembliesRef.current.clear();
  }, []);
  const handleMessage = useCallback(async (rawData) => {
    const msg = await decodeRtcPayload(rawData);
    if (msg?.kind === "chunk") {
      const { messageId, index, total, payloadType, data } = msg;
      if (!messageId || typeof index !== "number" || typeof total !== "number" || !data) return;
      const existing = chunkAssembliesRef.current.get(messageId) || {
        chunks: Array.from({ length: total }),
        total
      };
      existing.chunks[index] = { messageId, index, total, payloadType: payloadType || "text", data };
      chunkAssembliesRef.current.set(messageId, existing);
      if (existing.chunks.filter(Boolean).length !== existing.total) return;
      chunkAssembliesRef.current.delete(messageId);
      const decoded = await decodeChunkedRtcPayload(existing.chunks);
      handleMessage(JSON.stringify(decoded));
      return;
    }
    if (msg?.kind === "toggle") {
      bridgeLog2(supabase, sessionId, role, "recv_toggle", { open: msg.open });
      if (msg.open) {
        setStatus("connected");
      } else {
        setStatus("whiteboard-closed");
      }
    } else if (msg?.kind === "scene" || msg?.kind === "scene-delta") {
      bridgeLog2(supabase, sessionId, role, "recv_scene", { kind: msg.kind, elementCount: msg.elements?.length ?? 0 });
      setStatus("connected");
      wbHandleRef.current?.applyRemoteScene(msg.elements || [], void 0);
    } else if (msg?.kind === "pointer") {
      wbHandleRef.current?.applyRemotePointer({ ...msg, pointerId: "bridge-laptop" });
    } else if (msg?.kind === "session-ended") {
      sessionEndedRef.current = true;
      setStatus("session-ended");
      closePC();
    }
  }, [supabase, closePC, sessionId, role]);
  useEffect(() => {
    if (!sessionId || !role || !bridgeKey) return;
    effectMountIdRef.current += 1;
    const mountId = effectMountIdRef.current;
    bridgeLog2(supabase, sessionId, role, "effect_mount", { mountId });
    const channelName = bridgeChannelName(sessionId, role, bridgeKey);
    const sigChannel = supabase.channel(channelName);
    channelRef.current = sigChannel;
    const attemptJoin = () => {
      if (sessionEndedRef.current) return;
      sigChannel.send({
        type: "broadcast",
        event: "bridge-join",
        payload: { from: "ipad" }
      });
    };
    sigChannel.on("broadcast", { event: "bridge-offer" }, async ({ payload }) => {
      if (!payload?.sdp) return;
      closePC();
      reconnectAttemptsRef.current = 0;
      const iceServers = await fetchIceServers(supabase);
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      pc.oniceconnectionstatechange = () => {
        bridgeLog2(supabase, sessionId, role, "ice_state", { state: pc.iceConnectionState });
      };
      pc.onconnectionstatechange = () => {
        bridgeLog2(supabase, sessionId, role, "conn_state", { state: pc.connectionState });
      };
      stopHealthPollRef.current = startRtcHealthPoll({
        supabase,
        callId: sessionId,
        participantId: `bridge-ipad-${role}`,
        participantRole: role,
        label: "bridge-ipad",
        pc,
        dcRef
      });
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sigChannel.send({
            type: "broadcast",
            event: "bridge-ice",
            payload: { candidate: e.candidate.toJSON(), from: "ipad" }
          });
        }
      };
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        dcRef.current = dc;
        dc.onopen = () => {
          reconnectAttemptsRef.current = 0;
          bridgeLog2(supabase, sessionId, role, "dc_open");
        };
        dc.onclose = () => {
          bridgeLog2(supabase, sessionId, role, "dc_close");
          if (sessionEndedRef.current) return;
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current += 1;
            reconnectTimerRef.current = setTimeout(attemptJoin, RECONNECT_DELAY_MS);
          }
        };
        dc.onmessage = (ev) => {
          handleMessage(ev.data).catch((err) => {
            bridgeLog2(supabase, sessionId, role, "recv_error", { error: String(err) });
            console.error(err);
          });
        };
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          if (!sessionEndedRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current += 1;
            closePC();
            reconnectTimerRef.current = setTimeout(attemptJoin, RECONNECT_DELAY_MS);
          }
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      for (const c of iceCandidateBufferRef.current) {
        await pc.addIceCandidate(c).catch(() => {
        });
      }
      iceCandidateBufferRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sigChannel.send({
        type: "broadcast",
        event: "bridge-answer",
        payload: { sdp: pc.localDescription }
      });
    }).on("broadcast", { event: "bridge-ice" }, async ({ payload }) => {
      if (payload?.from === "ipad") return;
      const pc = pcRef.current;
      if (!pc) return;
      const candidate = new RTCIceCandidate(payload.candidate);
      if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate).catch(() => {
        });
      } else {
        iceCandidateBufferRef.current.push(candidate);
      }
    }).subscribe((s) => {
      if (s === "SUBSCRIBED") {
        attemptJoin();
      }
    });
    return () => {
      bridgeLog2(supabase, sessionId, role, "effect_unmount", { mountId });
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      closePC();
      supabase.removeChannel(sigChannel);
      channelRef.current = null;
    };
  }, [supabase, sessionId, role, bridgeKey, closePC, handleMessage]);
  return {
    status,
    sendDelta,
    sendPointer
  };
}

export { PairChatThread, RtcCall, WhiteboardPanel, bridgeChannelName, generateBridgeKey, makeSystemMessage, useBridgeCanvas, usePairChat };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map