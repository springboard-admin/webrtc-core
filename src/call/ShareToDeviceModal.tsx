import { useCallback, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Copy, Check } from "lucide-react";

interface ShareToDeviceModalProps {
  open: boolean;
  onClose: () => void;
  url: string;
}

export function ShareToDeviceModal({ open, onClose, url }: ShareToDeviceModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [url]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm p-6 bg-white text-gray-900 border border-gray-200 shadow-xl !grid-cols-1" style={{ gridTemplateColumns: '1fr' }}>
        <DialogHeader>
          <DialogTitle className="text-center text-gray-900">Open whiteboard on another device</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 pt-2">
          <div className="shrink-0 bg-white p-3 rounded-lg shadow-sm">
            <QRCodeSVG value={url} size={180} level="M" />
          </div>
          <p className="text-sm text-gray-500 text-center leading-snug">
            Scan this QR code or copy the link below to open the whiteboard on your iPad or tablet.
          </p>
          <div className="flex w-full items-center gap-2">
            <code className="flex-1 min-w-0 text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-md truncate block">
              {url}
            </code>
            <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
