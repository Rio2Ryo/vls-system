"use client";

import { motion } from "framer-motion";
import Link from "next/link";

/* ─── animation helpers ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

/* ─── data ─── */
const FEATURES = [
  {
    icon: "📝",
    title: "ユーザーフロー5ステップ",
    desc: "ログイン → アンケート → CM視聴 → 写真選択 → ダウンロード。直感的なUIで参加者を自然にガイド。",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: "🎬",
    title: "CM動画マッチング",
    desc: "アンケート回答をもとに最適なスポンサーCMを自動マッチング。22社4ティアのスコアリングエンジン搭載。",
    color: "bg-purple-50 text-purple-600",
  },
  {
    icon: "🏢",
    title: "マルチテナント管理",
    desc: "複数組織を1システムで運用。テナント別データ分離・ブランディング・ライセンス管理に対応。",
    color: "bg-green-50 text-green-600",
  },
  {
    icon: "📊",
    title: "分析ダッシュボード",
    desc: "ファネル分析・CM視聴率・NPS・行動ヒートマップ・A/Bテスト。データドリブンな運営を支援。",
    color: "bg-yellow-50 text-yellow-700",
  },
  {
    icon: "📱",
    title: "QRチェックイン",
    desc: "スマホカメラでQRスキャン → ワンタップ受付完了。当日オペレーションを圧倒的に効率化。",
    color: "bg-pink-50 text-pink-600",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "¥0",
    period: "/月",
    desc: "小規模イベント向け",
    highlight: false,
    features: [
      { text: "イベント1件", included: true },
      { text: "参加者50名まで", included: true },
      { text: "写真50枚まで", included: true },
      { text: "基本分析", included: true },
      { text: "スポンサーCMマッチング", included: false },
      { text: "マルチテナント", included: false },
      { text: "A/Bテスト", included: false },
      { text: "優先サポート", included: false },
    ],
  },
  {
    name: "Basic",
    price: "¥9,800",
    period: "/月",
    desc: "中規模イベント・学校向け",
    highlight: true,
    features: [
      { text: "イベント10件", included: true },
      { text: "参加者500名まで", included: true },
      { text: "写真無制限", included: true },
      { text: "高度な分析", included: true },
      { text: "スポンサーCMマッチング", included: true },
      { text: "マルチテナント", included: false },
      { text: "A/Bテスト", included: false },
      { text: "メールサポート", included: true },
    ],
  },
  {
    name: "Premium",
    price: "¥29,800",
    period: "/月",
    desc: "大規模・エンタープライズ向け",
    highlight: false,
    features: [
      { text: "イベント無制限", included: true },
      { text: "参加者無制限", included: true },
      { text: "写真無制限", included: true },
      { text: "全分析機能", included: true },
      { text: "スポンサーCMマッチング", included: true },
      { text: "マルチテナント", included: true },
      { text: "A/Bテスト", included: true },
      { text: "優先サポート", included: true },
    ],
  },
];

const FLOW_STEPS = [
  { num: 1, label: "ログイン", icon: "🔑" },
  { num: 2, label: "アンケート", icon: "📝" },
  { num: 3, label: "CM視聴", icon: "🎬" },
  { num: 4, label: "写真選択", icon: "📷" },
  { num: 5, label: "ダウンロード", icon: "⬇️" },
];

/* ─── component ─── */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-800 overflow-x-hidden">
      {/* ━━━ Hero ━━━ */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-4 py-20"
        style={{ background: "linear-gradient(135deg, #6EC6FF 0%, #A78BFA 100%)" }}>
        {/* decorative circles */}
        <div className="absolute top-10 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="relative z-10 text-center max-w-3xl mx-auto"
        >
          <motion.p variants={fadeUp} className="text-white/90 text-sm font-medium tracking-widest uppercase mb-4">
            Video Learning System
          </motion.p>
          <motion.h1 variants={fadeUp} className="text-4xl md:text-6xl font-black text-white leading-tight mb-6">
            イベント写真 &times; CM動画で、
            <br />
            新しい体験を。
          </motion.h1>
          <motion.p variants={fadeUp} className="text-lg md:text-xl text-white/85 mb-4 max-w-xl mx-auto">
            学園祭・運動会・卒業式——イベント写真の配布にスポンサーCM動画を組み合わせ、
            参加者にも企業にも価値のある新しいプラットフォーム。
          </motion.p>
          <motion.p variants={fadeUp} className="text-sm text-white/70 mb-8">
            デモ体験パスワード: <code className="bg-white/20 px-2 py-0.5 rounded font-mono text-white">SUMMER2026</code>
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/demo"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-white text-purple-600 font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200">
              デモを体験する
            </Link>
            <Link href="/admin"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-white/20 text-white font-bold text-lg border-2 border-white/40 hover:bg-white/30 hover:scale-105 transition-all duration-200">
              管理画面を見る
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ━━━ Flow Steps ━━━ */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="text-center mb-14">
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold mb-3">
              かんたん <span className="text-purple-500">5ステップ</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-gray-500 max-w-lg mx-auto">
              参加者はスマホひとつで写真を受け取れます
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}
            className="flex flex-col md:flex-row items-center justify-between gap-4"
          >
            {FLOW_STEPS.map((step, i) => (
              <motion.div key={step.num} variants={fadeUp} className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center text-2xl">
                    {step.icon}
                  </div>
                  <span className="mt-2 text-sm font-semibold text-gray-700">{step.label}</span>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <span className="hidden md:block text-2xl text-gray-300 ml-2">→</span>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ━━━ Features ━━━ */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="text-center mb-14">
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold mb-3">
              主要機能
            </motion.h2>
            <motion.p variants={fadeUp} className="text-gray-500 max-w-lg mx-auto">
              イベント運営に必要なすべてを1つのプラットフォームで
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {FEATURES.map((f) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm hover:shadow-lg transition-shadow duration-300"
              >
                <div className={`w-12 h-12 rounded-xl ${f.color} flex items-center justify-center text-xl mb-5`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ━━━ Pricing ━━━ */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="text-center mb-14">
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold mb-3">
              料金プラン
            </motion.h2>
            <motion.p variants={fadeUp} className="text-gray-500 max-w-lg mx-auto">
              イベント規模に合わせて選べる3プラン
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {PLANS.map((plan) => (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                className={`rounded-2xl p-8 flex flex-col ${
                  plan.highlight
                    ? "bg-gradient-to-b from-purple-500 to-blue-500 text-white shadow-xl scale-[1.03]"
                    : "bg-white border border-gray-100 shadow-sm"
                }`}
              >
                {plan.highlight && (
                  <span className="self-start text-xs font-bold bg-white/20 text-white px-3 py-1 rounded-full mb-4">
                    おすすめ
                  </span>
                )}
                <h3 className={`text-xl font-bold mb-1 ${plan.highlight ? "text-white" : ""}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mb-4 ${plan.highlight ? "text-white/80" : "text-gray-500"}`}>
                  {plan.desc}
                </p>
                <div className="mb-6">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? "text-white/70" : "text-gray-400"}`}>{plan.period}</span>
                </div>

                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((feat) => (
                    <li key={feat.text} className="flex items-center gap-2 text-sm">
                      {feat.included ? (
                        <svg className={`w-5 h-5 flex-shrink-0 ${plan.highlight ? "text-green-300" : "text-green-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className={`w-5 h-5 flex-shrink-0 ${plan.highlight ? "text-white/30" : "text-gray-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <span className={!feat.included ? (plan.highlight ? "text-white/40" : "text-gray-400") : ""}>
                        {feat.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link href="/demo"
                  className={`w-full text-center py-3 rounded-xl font-bold transition-all duration-200 ${
                    plan.highlight
                      ? "bg-white text-purple-600 hover:bg-gray-100"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}>
                  無料で試す
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ━━━ CTA ━━━ */}
      <section className="py-24 px-4"
        style={{ background: "linear-gradient(135deg, #6EC6FF 0%, #A78BFA 100%)" }}>
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}
          className="max-w-2xl mx-auto text-center"
        >
          <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-white mb-4">
            今すぐ始めましょう
          </motion.h2>
          <motion.p variants={fadeUp} className="text-white/80 mb-3">
            デモ環境でVLSの全機能をお試しいただけます。
          </motion.p>
          <motion.p variants={fadeUp} className="text-sm text-white/60 mb-8">
            パスワード: <code className="bg-white/20 px-2 py-0.5 rounded font-mono text-white">SUMMER2026</code>
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="https://vls-system.vercel.app/demo"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-white text-purple-600 font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200">
              本番デモを体験
            </a>
            <Link href="/"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-white/20 text-white font-bold text-lg border-2 border-white/40 hover:bg-white/30 hover:scale-105 transition-all duration-200">
              イベントに参加する
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ━━━ Footer ━━━ */}
      <footer className="py-10 px-4 bg-gray-900 text-gray-400 text-center text-sm">
        <p>&copy; {new Date().getFullYear()} VLS — Video Learning System. All rights reserved.</p>
      </footer>
    </div>
  );
}
