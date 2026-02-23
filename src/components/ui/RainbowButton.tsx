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
          ? "#4a3860"
          : "linear-gradient(135deg, #FFD700, #FF69B4, #00CED1, #FFD700)",
        backgroundSize: "300% 300%",
        boxShadow: disabled
          ? "none"
          : "0 0 20px rgba(255, 215, 0, 0.4), 0 0 40px rgba(255, 105, 180, 0.2)",
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
