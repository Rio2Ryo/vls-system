"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const VARIANTS = {
  primary:
    "bg-gradient-to-r from-[#6EC6FF] to-[#A78BFA] text-white shadow-md shadow-blue-100",
  secondary:
    "bg-white text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50",
  ghost:
    "bg-transparent text-[#6EC6FF] hover:bg-blue-50",
};

const SIZES = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-base",
  lg: "px-8 py-4 text-lg",
};

export default function Button({
  children,
  onClick,
  disabled = false,
  type = "button",
  variant = "primary",
  size = "md",
  className = "",
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02, y: disabled ? 0 : -1 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={`
        rounded-2xl font-bold transition-all
        ${VARIANTS[variant]}
        ${SIZES[size]}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
    >
      {children}
    </motion.button>
  );
}
