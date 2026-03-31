"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: "purple" | "blue" | "green" | "none";
}

export function GlassPanel({
  children,
  className = "",
  hover = true,
  glow = "none",
}: GlassPanelProps) {
  const glowColors = {
    purple: "hover:shadow-[0_0_30px_-5px_rgba(131,56,236,0.3)]",
    blue: "hover:shadow-[0_0_30px_-5px_rgba(58,134,255,0.3)]",
    green: "hover:shadow-[0_0_30px_-5px_rgba(34,197,94,0.3)]",
    none: "",
  };

  return (
    <motion.div
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`
        bg-white/5 backdrop-blur-md
        border border-white/10
        rounded-2xl
        transition-all duration-300
        ${hover ? "hover:bg-white/[0.07] hover:border-white/20" : ""}
        ${glowColors[glow]}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}
