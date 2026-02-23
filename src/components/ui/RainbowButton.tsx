"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface RainbowButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function RainbowButton({
  children,
  onClick,
  disabled = false,
  type = "button",
  className = "",
  size = "md",
}: RainbowButtonProps) {
  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-lg",
    lg: "px-8 py-4 text-xl",
  };

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      className={`
        relative overflow-hidden rounded-full font-bold text-white shadow-lg
        ${sizeClasses[size]}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
      style={{
        background: disabled
          ? "#9ca3af"
          : "linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #9b59b6)",
        backgroundSize: "300% 300%",
      }}
      animate={
        disabled
          ? {}
          : {
              backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
            }
      }
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      {children}
    </motion.button>
  );
}
