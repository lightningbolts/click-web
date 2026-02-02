'use client';

import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QrCode, Copy, Check, Share2, Download, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface QRIdentityCardProps {
  userId: string;
  userName?: string;
  userEmail?: string;
}

interface QRData {
  connectionUrl: string;
  clickId: string;
  deepLink: string;
}

/**
 * QRIdentityCard - Displays the user's static "Click ID" QR code
 * For scanning without the mobile app - part of the Digital Memory Box
 */
export default function QRIdentityCard({ userId, userName, userEmail }: QRIdentityCardProps) {
  const [copied, setCopied] = useState(false);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  // Fetch QR data from the API
  useEffect(() => {
    const fetchQRData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/qr');
        const data = await response.json();
        
        if (data.success && data.data) {
          setQrData({
            connectionUrl: data.data.connectionUrl,
            clickId: data.data.clickId,
            deepLink: data.data.deepLink,
          });
        } else {
          // Fallback to client-side generation using current origin
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
          setQrData({
            connectionUrl: `${baseUrl}/connect/${userId}`,
            clickId: `CLICK-${userId.substring(0, 8).toUpperCase()}`,
            deepLink: `click://connect/${userId}`,
          });
        }
      } catch (err) {
        console.error('Failed to fetch QR data:', err);
        // Fallback to client-side generation
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        setQrData({
          connectionUrl: `${baseUrl}/connect/${userId}`,
          clickId: `CLICK-${userId.substring(0, 8).toUpperCase()}`,
          deepLink: `click://connect/${userId}`,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchQRData();
  }, [userId]);

  // Fallback values while loading
  const clickId = qrData?.clickId || `CLICK-${userId.substring(0, 8).toUpperCase()}`;
  const qrContent = qrData?.connectionUrl || '';

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
    if (navigator.share && qrContent) {
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
    // Get the SVG element and convert to image for download
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = 256;
      canvas.height = 256;
      if (ctx) {
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 28, 28, 200, 200);
        
        const link = document.createElement('a');
        link.download = `click-qr-${clickId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
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
            <div ref={qrRef} className="relative bg-[#121212] p-4 rounded-2xl border border-white/10">
              {loading ? (
                <div className="w-[200px] h-[200px] flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[#8338EC] animate-spin" />
                </div>
              ) : qrContent ? (
                <QRCodeSVG
                  value={qrContent}
                  size={200}
                  level="M"
                  bgColor="#121212"
                  fgColor="#8338EC"
                  marginSize={0}
                  title={`Click ID QR Code for ${userName || userEmail || userId}`}
                />
              ) : (
                <div className="w-[200px] h-[200px] flex items-center justify-center text-zinc-500 text-sm">
                  Unable to generate QR code
                </div>
              )}
              
              {/* Center logo overlay - only show when QR is rendered */}
              {!loading && qrContent && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-[#121212] px-2 py-1 rounded-lg">
                    <span className="text-lg font-bold text-white tracking-wide">Click</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Connection URL Display */}
        {qrContent && (
          <div className="text-center">
            <p className="text-xs text-zinc-600 break-all">{qrContent}</p>
          </div>
        )}

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
