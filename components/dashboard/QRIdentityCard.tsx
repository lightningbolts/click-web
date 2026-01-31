'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { QrCode, Copy, Check, Share2, Download } from 'lucide-react';

interface QRIdentityCardProps {
  userId: string;
  userName?: string;
  userEmail?: string;
}

/**
 * QRIdentityCard - Displays the user's static "Click ID" QR code
 * For scanning without the mobile app - part of the Digital Memory Box
 */
export default function QRIdentityCard({ userId, userName, userEmail }: QRIdentityCardProps) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Generate a short Click ID from the user ID
  const clickId = `CLICK-${userId.substring(0, 8).toUpperCase()}`;
  const qrContent = `https://click.app/c/${userId}`;

  // Generate QR code using canvas
  useEffect(() => {
    const generateQR = async () => {
      // Simple QR code generation using a basic pattern
      // In production, you'd use a library like 'qrcode'
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = 200;
      canvas.width = size;
      canvas.height = size;

      // Background
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, size, size);

      // QR code pattern (simplified visual representation)
      // In production, use a proper QR library
      const moduleSize = 6;
      const modules = Math.floor(size / moduleSize);
      
      // Generate a deterministic pattern from userId
      const seed = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const pattern: boolean[][] = [];
      
      for (let i = 0; i < modules; i++) {
        pattern[i] = [];
        for (let j = 0; j < modules; j++) {
          // Create QR-like patterns
          const isEdge = i < 7 || j < 7 || i >= modules - 7 || j >= modules - 7;
          const isCorner = (i < 7 && j < 7) || (i < 7 && j >= modules - 7) || (i >= modules - 7 && j < 7);
          
          if (isCorner) {
            // Position patterns (finder patterns)
            const cornerI = i < 7 ? i : i - (modules - 7);
            const cornerJ = j < 7 ? j : j - (modules - 7);
            pattern[i][j] = (
              (cornerI === 0 || cornerI === 6 || cornerJ === 0 || cornerJ === 6) ||
              (cornerI >= 2 && cornerI <= 4 && cornerJ >= 2 && cornerJ <= 4)
            );
          } else {
            // Data area - use hash for deterministic pattern
            const hash = ((seed + i * 31 + j * 17) % 100);
            pattern[i][j] = hash > 45;
          }
        }
      }

      // Draw modules
      for (let i = 0; i < modules; i++) {
        for (let j = 0; j < modules; j++) {
          if (pattern[i][j]) {
            // Gradient effect for QR modules
            const gradient = ctx.createLinearGradient(
              j * moduleSize, i * moduleSize,
              (j + 1) * moduleSize, (i + 1) * moduleSize
            );
            gradient.addColorStop(0, '#8338EC');
            gradient.addColorStop(1, '#3A86FF');
            ctx.fillStyle = gradient;
            ctx.fillRect(j * moduleSize, i * moduleSize, moduleSize - 1, moduleSize - 1);
          }
        }
      }

      setQrDataUrl(canvas.toDataURL());
    };

    generateQR();
  }, [userId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(clickId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Click ID',
          text: `Connect with me on Click! My ID: ${clickId}`,
          url: qrContent,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      handleCopy();
    }
  };

  const handleDownload = () => {
    if (qrDataUrl) {
      const link = document.createElement('a');
      link.download = `click-qr-${clickId}.png`;
      link.href = qrDataUrl;
      link.click();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl"
    >
      {/* Card background with gradient border */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC] via-[#3A86FF] to-[#8338EC] opacity-20" />
      <div className="absolute inset-[1px] bg-zinc-900 rounded-3xl" />
      
      {/* Content */}
      <div className="relative p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#8338EC]/20 rounded-xl">
              <QrCode className="w-5 h-5 text-[#8338EC]" />
            </div>
            <div>
              <h3 className="font-bold text-white">Your Click ID</h3>
              <p className="text-xs text-zinc-500">Scan to connect instantly</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              title="Share"
            >
              <Share2 className="w-4 h-4 text-zinc-400" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              title="Download QR"
            >
              <Download className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/30 to-[#3A86FF]/30 blur-xl" />
            
            {/* QR Container */}
            <div className="relative bg-[#121212] p-4 rounded-2xl border border-white/10">
              <canvas 
                ref={canvasRef} 
                className="w-[200px] h-[200px] rounded-lg"
              />
              
              {/* Center logo overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-[#121212] p-2 rounded-lg">
                  <span className="text-lg font-bold">
                    <span className="text-[#8338EC]">C</span>
                    <span className="text-white text-sm">lick</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Click ID Display */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
            <code className="px-4 py-2 bg-zinc-800 rounded-xl text-[#8338EC] font-mono text-lg tracking-wider">
              {clickId}
            </code>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-500" />
              ) : (
                <Copy className="w-5 h-5 text-zinc-400" />
              )}
            </motion.button>
          </div>
          <p className="text-xs text-zinc-500 text-center">
            {copied ? 'Copied to clipboard!' : 'Share this ID or scan the QR code'}
          </p>
        </div>

        {/* User info */}
        {(userName || userEmail) && (
          <div className="pt-4 border-t border-zinc-800 text-center">
            {userName && <p className="text-white font-medium">{userName}</p>}
            {userEmail && <p className="text-xs text-zinc-500">{userEmail}</p>}
          </div>
        )}

        {/* Usage instructions */}
        <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-zinc-300">How to use:</p>
          <ul className="text-xs text-zinc-500 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-[#8338EC]">1.</span>
              <span>Show this QR code when meeting someone new</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#8338EC]">2.</span>
              <span>They scan it with their phone camera</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#8338EC]">3.</span>
              <span>Instant connection - no app needed to scan!</span>
            </li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
