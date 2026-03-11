"use client";

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function GlobalSearchModal({ open }: GlobalSearchModalProps) {
  if (!open) return null;
  return null;
}
