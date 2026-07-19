'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

type LandingScreenshotFrameProps = {
  id: string;
  src: string;
  alt: string;
  /** Tailwind classes for the aspect box (width + aspect ratio). */
  aspectClassName?: string;
  sizes?: string;
  className?: string;
  imageClassName?: string;
  /** `contain` keeps full UI in frame (nav bars, chat bubbles); `cover` crops. */
  objectFit?: 'cover' | 'contain';
  priority?: boolean;
  loading?: 'eager' | 'lazy';
};

export default function LandingScreenshotFrame({
  id,
  src,
  alt,
  aspectClassName = 'aspect-[16/10]',
  sizes = '(max-width: 768px) min(100vw, 448px), (max-width: 1200px) min(90vw, 960px), 1152px',
  className = '',
  imageClassName,
  objectFit = 'contain',
  priority,
  loading,
}: LandingScreenshotFrameProps) {
  const fitClass = objectFit === 'contain' ? 'object-contain object-top' : 'object-cover object-top';
  const imgClass = imageClassName ? `${fitClass} ${imageClassName}`.trim() : fitClass;

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px', amount: 0.2 }}
      transition={{ duration: 0.45 }}
      className={`overflow-hidden rounded-2xl border border-border-hard bg-background   ${className}`}
    >
      <div className={`relative w-full min-h-0 min-w-0 ${aspectClassName}`}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={`${imgClass}`}
          priority={priority}
          loading={loading}
        />
      </div>
    </motion.div>
  );
}
