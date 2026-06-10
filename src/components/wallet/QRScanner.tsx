import { useRef, useState, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { X, Camera, FlipHorizontal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QRScannerProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

export const QRScanner = ({ onScan, onClose }: QRScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [scanLine, setScanLine] = useState(0);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStarting(false);
    } catch (err: any) {
      setError(err?.message?.includes('Permission') ? 'Camera permission denied. Please allow camera access.' : `Camera error: ${err?.message ?? 'unknown'}`);
      setStarting(false);
    }
  }, [facing, stopCamera]);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera]);

  // Scan loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameCount = 0;
    const scan = () => {
      rafRef.current = requestAnimationFrame(scan);
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

      frameCount++;
      // Animate scan line
      setScanLine(prev => (prev + 1.5) % 100);

      // Only decode every 6th frame for performance
      if (frameCount % 6 !== 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (code?.data) {
        stopCamera();
        // Extract address from ethereum: URI or plain address
        let val = code.data;
        if (val.startsWith('ethereum:')) val = val.replace('ethereum:', '').split('@')[0].split('?')[0];
        onScan(val);
      }
    };

    rafRef.current = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(rafRef.current);
  }, [onScan, stopCamera]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          Scan QR Code
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
            title="Flip camera"
          >
            <FlipHorizontal className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {starting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-3 text-white">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Starting camera…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="text-center space-y-3">
              <Camera className="h-10 w-10 text-destructive mx-auto" />
              <p className="text-white text-sm">{error}</p>
              <Button onClick={startCamera} size="sm">Try Again</Button>
            </div>
          </div>
        )}

        {/* Viewfinder overlay */}
        {!error && !starting && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Semi-dark mask around viewfinder */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Viewfinder box */}
            <div className="relative w-64 h-64">
              <div className="absolute inset-0 rounded-lg border-2 border-primary/80 z-10" />

              {/* Corner accents */}
              {[['top-0 left-0', 'rounded-tl-lg'], ['top-0 right-0', 'rounded-tr-lg'], ['bottom-0 left-0', 'rounded-bl-lg'], ['bottom-0 right-0', 'rounded-br-lg']].map(([pos, round], i) => (
                <div key={i} className={cn('absolute w-6 h-6 border-white z-20', pos, round,
                  i < 2 ? 'border-t-2' : 'border-b-2',
                  i % 2 === 0 ? 'border-l-2' : 'border-r-2'
                )} />
              ))}

              {/* Animated scan line */}
              <div
                className="absolute left-0 right-0 h-0.5 bg-primary z-20 transition-none"
                style={{ top: `${scanLine}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-3 bg-black/80 text-center">
        <p className="text-xs text-gray-400">Point camera at a wallet address QR code</p>
      </div>
    </div>
  );
};
