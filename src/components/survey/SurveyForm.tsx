"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SurveyQuestion, SurveyAnswer } from "@/lib/types";
import RainbowButton from "@/components/ui/RainbowButton";

interface SurveyFormProps {
  questions: SurveyQuestion[];
  onComplete: (answers: SurveyAnswer[]) => void;
}

const OPTION_GRADIENTS = [
  "linear-gradient(135deg, #FF69B4, #FF1493)",
  "linear-gradient(135deg, #FFD700, #FFA500)",
  "linear-gradient(135deg, #00CED1, #00BFFF)",
  "linear-gradient(135deg, #B088F9, #9B59B6)",
];

export default function SurveyForm({
  questions,
  onComplete,
}: SurveyFormProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const currentQuestion = questions[currentIdx];

  if (!currentQuestion) {
    return null;
  }

  const handleSelect = (option: string) => {
    setSelected(option);
  };

  const handleNext = () => {
    if (!selected) return;

    const newAnswers = [...answers, { questionId: currentQuestion.id, answer: selected }];
    setAnswers(newAnswers);
    setSelected(null);

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onComplete(newAnswers);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto" data-testid="survey-form">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          className="space-y-4"
        >
          <div className="text-center mb-6">
            <span
              className="text-xs px-3 py-1 rounded-full font-bold"
              style={{
                background: "rgba(255, 215, 0, 0.15)",
                color: "#FFD700",
                border: "1px solid rgba(255, 215, 0, 0.3)",
              }}
            >
              質問 {currentIdx + 1} / {questions.length}
            </span>
          </div>
          <h3 className="text-xl font-bold text-center mb-6" style={{ color: "#F0E6FF" }}>
            {currentQuestion.question}
          </h3>
          <div className="space-y-3">
            {currentQuestion.options.map((option, i) => (
              <motion.button
                key={option}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(option)}
                className="w-full p-4 rounded-xl text-left font-medium transition-all"
                style={
                  selected === option
                    ? {
                        background: OPTION_GRADIENTS[i % OPTION_GRADIENTS.length],
                        color: "white",
                        boxShadow: "0 0 15px rgba(255, 215, 0, 0.3)",
                      }
                    : {
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "#F0E6FF",
                        border: "2px solid rgba(255, 215, 0, 0.2)",
                      }
                }
              >
                {option}
              </motion.button>
            ))}
          </div>
          <div className="text-center mt-6">
            <RainbowButton onClick={handleNext} disabled={!selected} size="md">
              {currentIdx < questions.length - 1 ? "つぎへ →" : "かんりょう！"}
            </RainbowButton>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
