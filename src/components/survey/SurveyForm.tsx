"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SurveyQuestion, SurveyAnswer } from "@/lib/types";
import RainbowButton from "@/components/ui/RainbowButton";

interface SurveyFormProps {
  questions: SurveyQuestion[];
  onComplete: (answers: SurveyAnswer[]) => void;
  startIndex?: number;
}

const OPTION_COLORS = [
  "from-pink-400 to-red-400",
  "from-yellow-400 to-orange-400",
  "from-green-400 to-emerald-400",
  "from-blue-400 to-indigo-400",
];

export default function SurveyForm({
  questions,
  onComplete,
  startIndex = 0,
}: SurveyFormProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const actualQuestions = questions.slice(startIndex);
  const currentQuestion = actualQuestions[currentIdx];

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

    if (currentIdx < actualQuestions.length - 1) {
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
            <span className="text-xs bg-purple-100 text-purple-600 px-3 py-1 rounded-full font-bold">
              質問 {currentIdx + 1} / {actualQuestions.length}
            </span>
          </div>
          <h3 className="text-xl font-bold text-center text-gray-800 mb-6">
            {currentQuestion.question}
          </h3>
          <div className="space-y-3">
            {currentQuestion.options.map((option, i) => (
              <motion.button
                key={option}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(option)}
                className={`
                  w-full p-4 rounded-xl text-left font-medium transition-all
                  ${
                    selected === option
                      ? `bg-gradient-to-r ${OPTION_COLORS[i % OPTION_COLORS.length]} text-white shadow-lg`
                      : "bg-white border-2 border-gray-200 text-gray-700 hover:border-purple-300"
                  }
                `}
              >
                {option}
              </motion.button>
            ))}
          </div>
          <div className="text-center mt-6">
            <RainbowButton onClick={handleNext} disabled={!selected} size="md">
              {currentIdx < actualQuestions.length - 1 ? "つぎへ →" : "かんりょう！"}
            </RainbowButton>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
