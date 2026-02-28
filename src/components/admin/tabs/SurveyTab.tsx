"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { EventData, InterestTag, SurveyQuestion } from "@/lib/types";
import { getStoredEvents, setStoredEvents, getStoredSurvey, setStoredSurvey } from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { inputCls } from "./adminUtils";

interface Props {
  onSave: (msg: string) => void;
  activeEventId: string;
  activeEvent?: EventData;
  tenantId?: string | null;
}

function SurveyQuestionEditor({
  index, question, onUpdateQuestion, onUpdateMax, onAddOption, onRemoveOption, onRemove,
}: {
  index: number;
  question: SurveyQuestion;
  onUpdateQuestion: (text: string) => void;
  onUpdateMax: (max: number) => void;
  onAddOption: (label: string, tag: string) => void;
  onRemoveOption: (tag: string) => void;
  onRemove: () => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newTag, setNewTag] = useState("");

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs bg-[#6EC6FF] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0">
          {index + 1}
        </span>
        <input
          type="text"
          value={question.question}
          onChange={(e) => onUpdateQuestion(e.target.value)}
          className={inputCls + " font-medium"}
          data-testid={`survey-q-${question.id}`}
        />
        <button onClick={onRemove} className="text-xs text-red-400 hover:underline flex-shrink-0">削除</button>
      </div>

      <div className="ml-8 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>最大選択数:</span>
          <input
            type="number"
            min={1}
            max={10}
            value={question.maxSelections}
            onChange={(e) => onUpdateMax(Number(e.target.value))}
            className="w-16 px-2 py-1 rounded-lg border border-gray-200 text-center text-xs"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => (
            <span
              key={opt.tag}
              className="text-xs bg-gray-50 border border-gray-200 px-3 py-1 rounded-full text-gray-600 flex items-center gap-1"
            >
              {opt.label}
              <span className="text-[10px] text-gray-400">({opt.tag})</span>
              <button
                onClick={() => onRemoveOption(opt.tag)}
                className="text-red-400 hover:text-red-600 ml-1"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <input
            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-xs"
            placeholder="ラベル"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <input
            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-xs font-mono"
            placeholder="タグ (例: education)"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
          />
          <button
            onClick={() => { onAddOption(newLabel, newTag); setNewLabel(""); setNewTag(""); }}
            className="text-xs text-[#6EC6FF] hover:underline flex-shrink-0"
          >
            + 追加
          </button>
        </div>
      </div>
    </Card>
  );
}

export default function SurveyTab({ onSave, activeEventId, activeEvent }: Props) {
  const [survey, setSurvey] = useState<SurveyQuestion[]>([]);
  const [mode, setMode] = useState<"event" | "global">("event");

  const isEventCustom = activeEvent?.surveyQuestions && activeEvent.surveyQuestions.length > 0;

  useEffect(() => {
    if (mode === "event" && activeEventId) {
      const evts = getStoredEvents();
      const evt = evts.find((e) => e.id === activeEventId);
      if (evt?.surveyQuestions && evt.surveyQuestions.length > 0) {
        setSurvey(evt.surveyQuestions);
      } else {
        setSurvey(getStoredSurvey());
      }
    } else {
      setSurvey(getStoredSurvey());
    }
  }, [activeEventId, mode]);

  const persistSurvey = (updated: SurveyQuestion[]) => {
    if (mode === "event" && activeEventId) {
      const events = getStoredEvents();
      const updatedEvents = events.map((e) =>
        e.id === activeEventId ? { ...e, surveyQuestions: updated } : e
      );
      setStoredEvents(updatedEvents);
    } else {
      setStoredSurvey(updated);
    }
  };

  const updateQuestion = (id: string, question: string) => {
    const updated = survey.map((q) => (q.id === id ? { ...q, question } : q));
    setSurvey(updated);
    persistSurvey(updated);
  };

  const updateMaxSelections = (id: string, max: number) => {
    const updated = survey.map((q) => (q.id === id ? { ...q, maxSelections: max } : q));
    setSurvey(updated);
    persistSurvey(updated);
  };

  const addOption = (qId: string, label: string, tag: string) => {
    if (!label || !tag) return;
    const updated = survey.map((q) =>
      q.id === qId
        ? { ...q, options: [...q.options, { label, tag: tag as InterestTag }] }
        : q
    );
    setSurvey(updated);
    persistSurvey(updated);
    onSave("選択肢を追加しました");
  };

  const removeOption = (qId: string, tag: string) => {
    const updated = survey.map((q) =>
      q.id === qId
        ? { ...q, options: q.options.filter((o) => o.tag !== tag) }
        : q
    );
    setSurvey(updated);
    persistSurvey(updated);
  };

  const addQuestion = () => {
    const newQ: SurveyQuestion = {
      id: `q-${Date.now()}`,
      question: "新しい質問",
      maxSelections: 3,
      options: [],
    };
    const updated = [...survey, newQ];
    setSurvey(updated);
    persistSurvey(updated);
    onSave("質問を追加しました");
  };

  const removeQuestion = (id: string) => {
    const updated = survey.filter((q) => q.id !== id);
    setSurvey(updated);
    persistSurvey(updated);
    onSave("質問を削除しました");
  };

  const saveSurvey = () => {
    persistSurvey(survey);
    onSave(mode === "event" ? `${activeEvent?.name || "イベント"}のアンケートを保存しました` : "グローバルアンケートを保存しました");
  };

  const resetToGlobal = () => {
    if (!activeEventId) return;
    const events = getStoredEvents();
    const updatedEvents = events.map((e) =>
      e.id === activeEventId ? { ...e, surveyQuestions: undefined } : e
    );
    setStoredEvents(updatedEvents);
    setSurvey(getStoredSurvey());
    onSave("グローバル設定に戻しました");
  };

  const copyFromGlobal = () => {
    const globalSurvey = getStoredSurvey();
    setSurvey(globalSurvey);
    persistSurvey(globalSurvey);
    onSave("グローバル設定をコピーしました");
  };

  return (
    <div className="space-y-4" data-testid="admin-survey">
      {/* Mode toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          <button
            onClick={() => setMode("event")}
            className={`text-xs px-4 py-2 font-medium transition-colors ${
              mode === "event" ? "bg-[#6EC6FF] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            イベント別
          </button>
          <button
            onClick={() => setMode("global")}
            className={`text-xs px-4 py-2 font-medium transition-colors ${
              mode === "global" ? "bg-[#6EC6FF] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            グローバル（デフォルト）
          </button>
        </div>
        {mode === "event" && activeEvent && (
          <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-medium">
            {activeEvent.name}
            {isEventCustom ? " (カスタム)" : " (グローバル使用中)"}
          </span>
        )}
      </div>

      {!IS_DEMO_MODE && mode === "event" && activeEvent && !isEventCustom && (
        <Card>
          <p className="text-sm text-gray-500 mb-2">
            このイベントはグローバルアンケートを使用しています。カスタマイズするにはコピーしてください。
          </p>
          <Button size="sm" onClick={copyFromGlobal}>グローバルからコピーしてカスタマイズ</Button>
        </Card>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">
          {mode === "event" ? "イベント別アンケート設定" : "グローバルアンケート設定"}
        </h2>
        {!IS_DEMO_MODE && (
          <div className="flex gap-2">
            {mode === "event" && isEventCustom && (
              <Button size="sm" variant="secondary" onClick={resetToGlobal}>グローバルに戻す</Button>
            )}
            <Button size="sm" variant="secondary" onClick={addQuestion}>+ 質問追加</Button>
            <Button size="sm" onClick={saveSurvey}>保存</Button>
          </div>
        )}
      </div>
      {survey.map((q, i) => (
        IS_DEMO_MODE ? (
          <Card key={q.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-[#6EC6FF] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-sm font-medium text-gray-700">{q.question}</span>
            </div>
            <div className="ml-8">
              <p className="text-xs text-gray-400 mb-2">最大選択数: {q.maxSelections}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <span key={opt.tag} className="text-xs bg-gray-50 border border-gray-200 px-3 py-1 rounded-full text-gray-600">
                    {opt.label} <span className="text-[10px] text-gray-400">({opt.tag})</span>
                  </span>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <SurveyQuestionEditor
            key={q.id}
            index={i}
            question={q}
            onUpdateQuestion={(text) => updateQuestion(q.id, text)}
            onUpdateMax={(max) => updateMaxSelections(q.id, max)}
            onAddOption={(label, tag) => addOption(q.id, label, tag)}
            onRemoveOption={(tag) => removeOption(q.id, tag)}
            onRemove={() => removeQuestion(q.id)}
          />
        )
      ))}
    </div>
  );
}
