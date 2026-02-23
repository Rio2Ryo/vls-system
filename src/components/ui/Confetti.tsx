"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Particle {
  id: number;
  x: number;
  color: string;
  size: number;
  delay: number;
  shape: "circle" | "star" | "square";
}

const COLORS = ["#FFD700", "#FF69B4", "#00CED1", "#FFD700", "#FF69B4", "#B088F9", "#FFF"];

export default function Confetti() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const shapes: Particle["shape"][] = ["circle", "star", "square"];
    const newParticles: Particle[] = [];
    for (let i = 0; i < 60; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: Math.random() * 10 + 5,
        delay: Math.random() * 2,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
      });
    }
    setParticles(newParticles);
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-50"
      data-testid="confetti"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute ${p.shape === "circle" ? "rounded-full" : p.shape === "star" ? "rounded-none" : "rounded-sm"}`}
          style={{
            left: `${p.x}%`,
            top: -20,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 6px ${p.color}`,
          }}
          animate={{
            y: [0, typeof window !== "undefined" ? window.innerHeight + 100 : 900],
            rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            delay: p.delay,
            ease: "easeIn",
          }}
        />
      ))}
    </div>
  );
}
