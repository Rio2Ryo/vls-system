"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Company, CompanyTier, InterestTag } from "@/lib/types";
import { getStoredCompanies, setStoredCompanies } from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { logAudit } from "@/lib/audit";
import { inputCls, TIER_COLORS, uploadFileToR2, readAsDataUrl, extractYouTubeId } from "./adminUtils";

/** All predefined interest tags with Japanese labels */
const PREDEFINED_TAGS: { value: InterestTag; label: string }[] = [
  { value: "education", label: "教育" },
  { value: "sports", label: "スポーツ" },
  { value: "food", label: "食品" },
  { value: "travel", label: "旅行" },
  { value: "technology", label: "テクノロジー" },
  { value: "art", label: "アート" },
  { value: "nature", label: "自然" },
  { value: "cram_school", label: "塾" },
  { value: "lessons", label: "習い事" },
  { value: "food_product", label: "食品メーカー" },
  { value: "travel_service", label: "旅行サービス" },
  { value: "smartphone", label: "スマホ" },
  { value: "camera", label: "カメラ" },
  { value: "insurance", label: "保険" },
  { value: "age_0_3", label: "0〜3歳" },
  { value: "age_4_6", label: "4〜6歳" },
  { value: "age_7_9", label: "7〜9歳" },
  { value: "age_10_12", label: "10〜12歳" },
  { value: "age_13_plus", label: "13歳以上" },
  { value: "other", label: "その他" },
];

/** Tag input component with existing tag selection + new tag creation */
function TagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [newTag, setNewTag] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = value.split(",").map(t => t.trim()).filter(Boolean);

  const toggleTag = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter(t => t !== tag).join(", "));
    } else {
      onChange([...selected, tag].join(", "));
    }
  };

  const addNewTag = () => {
    const t = newTag.trim();
    if (t && !selected.includes(t)) {
      onChange([...selected, t].join(", "));
      setNewTag("");
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Selected tags display */}
      <div
        className={inputCls + " cursor-pointer min-h-[42px] flex flex-wrap gap-1 items-center"}
        onClick={() => setShowDropdown(!showDropdown)}
      >
        {selected.length === 0 && (
          <span className="text-gray-400 text-sm">タグを選択（クリックして展開）</span>
        )}
        {selected.map(tag => {
          const preset = PREDEFINED_TAGS.find(p => p.value === tag);
          return (
            <span key={tag} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
              {preset ? preset.label : tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleTag(tag); }}
                className="text-blue-400 hover:text-blue-700 font-bold"
                aria-label={`${tag}を削除`}
              >×</button>
            </span>
          );
        })}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-3 max-h-64 overflow-y-auto">
          <p className="text-xs font-bold text-gray-500 mb-2">既存タグから選択</p>
          <div className="flex flex-wrap gap-1 mb-3">
            {PREDEFINED_TAGS.map(tag => {
              const isSelected = selected.includes(tag.value);
              return (
                <button
                  key={tag.value}
                  type="button"
                  onClick={() => toggleTag(tag.value)}
                  className={`px-2 py-1 rounded-full text-xs font-medium border transition-all ${
                    isSelected
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-300"
                  }`}
                >
                  {isSelected && "✓ "}{tag.label}
                </button>
              );
            })}
          </div>

          <div className="border-t pt-2">
            <p className="text-xs font-bold text-gray-500 mb-1">新しいタグを追加</p>
            <div className="flex gap-1">
              <input
                className={inputCls + " flex-1 text-sm"}
                placeholder="新規タグ名"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNewTag(); } }}
              />
              <Button size="sm" onClick={addNewTag} disabled={!newTag.trim()}>追加</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  onSave: (msg: string) => void;
}

export default function CompaniesTab({ onSave }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", tier: "gold" as CompanyTier, tags: "" as string,
    cm15: "", cm30: "", cm60: "",
    offerText: "", offerUrl: "", couponCode: "", portalPassword: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [tierFilter, setTierFilter] = useState<CompanyTier | null>(null);

  useEffect(() => { setCompanies(getStoredCompanies()); }, []);

  const startNew = () => {
    setEditing("__new__");
    setForm({ name: "", tier: "gold", tags: "", cm15: "", cm30: "", cm60: "", offerText: "", offerUrl: "", couponCode: "", portalPassword: "" });
    setLogoFile(null);
    setLogoPreview("");
  };

  const startEdit = (c: Company) => {
    setEditing(c.id);
    setForm({
      name: c.name, tier: c.tier, tags: c.tags.join(", "),
      cm15: c.videos.cm15, cm30: c.videos.cm30, cm60: c.videos.cm60,
      offerText: c.offerText, offerUrl: c.offerUrl, couponCode: c.couponCode || "",
      portalPassword: c.portalPassword || "",
    });
    setLogoFile(null);
    setLogoPreview(c.logoUrl);
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const dataUrl = await readAsDataUrl(file);
    setLogoPreview(dataUrl);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview("");
  };

  const save = async () => {
    if (!form.name || saving) return;
    setSaving(true);
    try {
      // Resolve logo URL
      let logoUrl: string | undefined;
      if (logoFile) {
        const result = await uploadFileToR2(logoFile, "", "logos");
        if (result) {
          logoUrl = result.url;
        } else {
          // R2 not configured — fall back to dataURL for local dev
          logoUrl = await readAsDataUrl(logoFile);
        }
      }

      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean) as InterestTag[];
      let updated: Company[];
      if (editing === "__new__") {
        const fallbackLogo = `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name.slice(0, 2))}&background=6EC6FF&color=fff&size=80&rounded=true`;
        const newCo: Company = {
          id: `co-${Date.now()}`,
          name: form.name,
          logoUrl: logoUrl || fallbackLogo,
          tier: form.tier,
          tags,
          videos: { cm15: form.cm15, cm30: form.cm30, cm60: form.cm60 },
          offerText: form.offerText,
          offerUrl: form.offerUrl,
          couponCode: form.couponCode || undefined,
          portalPassword: form.portalPassword || undefined,
        };
        updated = [...companies, newCo];
      } else {
        updated = companies.map((c) => {
          if (c.id !== editing) return c;
          // Determine logo: new upload > cleared (reset to avatar) > keep existing
          let newLogoUrl = c.logoUrl;
          if (logoUrl) {
            newLogoUrl = logoUrl;
          } else if (!logoPreview) {
            newLogoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name.slice(0, 2))}&background=6EC6FF&color=fff&size=80&rounded=true`;
          }
          return {
            ...c, name: form.name, tier: form.tier, tags,
            logoUrl: newLogoUrl,
            videos: { cm15: form.cm15, cm30: form.cm30, cm60: form.cm60 },
            offerText: form.offerText, offerUrl: form.offerUrl,
            couponCode: form.couponCode || undefined,
            portalPassword: form.portalPassword || undefined,
          };
        });
      }
      setStoredCompanies(updated);
      setCompanies(updated);
      setEditing(null);
      onSave("企業情報を保存しました");
      if (editing === "__new__") {
        const created = updated[updated.length - 1];
        logAudit("company_create", { type: "company", id: created.id, name: created.name });
      } else {
        const target = updated.find((c) => c.id === editing);
        if (target) logAudit("company_update", { type: "company", id: target.id, name: target.name });
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = (id: string) => {
    const target = companies.find((c) => c.id === id);
    const updated = companies.filter((c) => c.id !== id);
    setStoredCompanies(updated);
    setCompanies(updated);
    onSave("企業を削除しました");
    logAudit("company_delete", { type: "company", id, name: target?.name });
  };

  return (
    <div className="space-y-4" data-testid="admin-companies">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">パートナー企業</h2>
        {!IS_DEMO_MODE && <Button size="sm" onClick={startNew}>+ 企業追加</Button>}
      </div>

      {!IS_DEMO_MODE && editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
          role="dialog"
          aria-modal="true"
          aria-label={editing === "__new__" ? "新規企業" : "企業編集"}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />
          {/* Modal content */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[90vh] overflow-y-auto mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-700 text-lg">{editing === "__new__" ? "新規企業" : "企業編集"}</h3>
              <button
                onClick={() => setEditing(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none p-1 rounded-lg hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                aria-label="閉じる"
              >
                &times;
              </button>
            </div>
            <div className="space-y-3">
              <input className={inputCls} placeholder="企業名" aria-label="企業名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="company-name-input" />
              <div className="border border-gray-100 rounded-xl p-3 space-y-2">
                <p className="text-xs font-bold text-gray-500">企業ロゴ</p>
                <div className="flex items-center gap-3">
                  {logoPreview && (
                    <Image src={logoPreview} alt="ロゴプレビュー" width={64} height={64} className="rounded-full object-cover border border-gray-200" unoptimized />
                  )}
                  <div className="flex-1 space-y-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoSelect}
                      className="block w-full text-sm text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
                      data-testid="company-logo-input"
                    />
                    {logoPreview && (
                      <button type="button" onClick={removeLogo} aria-label="ロゴを削除" className="text-xs text-red-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded">ロゴ削除</button>
                    )}
                  </div>
                </div>
              </div>
              <select className={inputCls} aria-label="ティア選択" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as CompanyTier })} data-testid="company-tier-select">
                <option value="platinum">Platinum</option>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="bronze">Bronze</option>
              </select>
              <TagInput value={form.tags} onChange={(v) => setForm({ ...form, tags: v })} />
              <div className="border border-gray-100 rounded-xl p-3 space-y-2">
                <p className="text-xs font-bold text-gray-500">CM動画 YouTube ID</p>
                <input className={inputCls + " font-mono"} placeholder="15秒CM（YouTube URLまたはID）" aria-label="15秒CM YouTube ID" value={form.cm15} onChange={(e) => setForm({ ...form, cm15: extractYouTubeId(e.target.value) })} data-testid="company-cm15-input" />
                <input className={inputCls + " font-mono"} placeholder="30秒CM（YouTube URLまたはID）" aria-label="30秒CM YouTube ID" value={form.cm30} onChange={(e) => setForm({ ...form, cm30: extractYouTubeId(e.target.value) })} data-testid="company-cm30-input" />
                <input className={inputCls + " font-mono"} placeholder="60秒CM（YouTube URLまたはID）" aria-label="60秒CM YouTube ID" value={form.cm60} onChange={(e) => setForm({ ...form, cm60: extractYouTubeId(e.target.value) })} data-testid="company-cm60-input" />
              </div>
              <input className={inputCls} placeholder="オファーテキスト" aria-label="オファーテキスト" value={form.offerText} onChange={(e) => setForm({ ...form, offerText: e.target.value })} />
              <input className={inputCls} placeholder="オファーURL" aria-label="オファーURL" value={form.offerUrl} onChange={(e) => setForm({ ...form, offerUrl: e.target.value })} />
              <input className={inputCls + " font-mono"} placeholder="クーポンコード（任意）" aria-label="クーポンコード" value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value })} />
              <input className={inputCls + " font-mono"} placeholder="ポータルパスワード（任意）" aria-label="ポータルパスワード" value={form.portalPassword} onChange={(e) => setForm({ ...form, portalPassword: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(["platinum", "gold", "silver", "bronze"] as const).map((t) => {
          const count = companies.filter((c) => c.tier === t).length;
          const isActive = tierFilter === t;
          return (
            <button
              key={t}
              onClick={() => setTierFilter(isActive ? null : t)}
              className={`text-center py-2 rounded-xl transition-all ${TIER_COLORS[t]} ${
                isActive
                  ? "ring-2 ring-offset-1 ring-current shadow-md scale-[1.02]"
                  : "bg-opacity-50 hover:bg-opacity-80 hover:shadow-sm"
              }`}
            >
              <p className="text-lg font-bold">{count}</p>
              <p className="text-[10px] uppercase font-bold">{t}</p>
            </button>
          );
        })}
      </div>

      {tierFilter && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium uppercase">{tierFilter}</span> で絞り込み中
          <button onClick={() => setTierFilter(null)} className="text-xs text-blue-500 hover:underline">クリア</button>
        </div>
      )}

      {companies.filter((c) => !tierFilter || c.tier === tierFilter).map((c) => (
        <Card key={c.id}>
          <div className="flex items-start gap-4">
            <Image src={c.logoUrl} alt={c.name} width={48} height={48} className="rounded-full" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-gray-700">{c.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${TIER_COLORS[c.tier]}`}>
                  {c.tier}
                </span>
              </div>
              <p className="text-xs text-gray-400">タグ: {c.tags.join(", ")}</p>
              <div className="flex gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.videos.cm15 ? "bg-green-50 border border-green-200 text-green-600" : "bg-gray-50 border border-gray-200 text-gray-400"}`}>
                  CM15s {c.videos.cm15 ? "✓" : "✗"}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.videos.cm30 ? "bg-green-50 border border-green-200 text-green-600" : "bg-gray-50 border border-gray-200 text-gray-400"}`}>
                  CM30s {c.videos.cm30 ? "✓" : "✗"}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.videos.cm60 ? "bg-green-50 border border-green-200 text-green-600" : "bg-gray-50 border border-gray-200 text-gray-400"}`}>
                  CM60s {c.videos.cm60 ? "✓" : "✗"}
                </span>
              </div>
              {c.videos.cm15 && (
                <p className="text-[10px] text-gray-400 mt-1 font-mono">ID: {c.videos.cm15}</p>
              )}
            </div>
            {!IS_DEMO_MODE && (
              <div className="flex gap-2">
                <button onClick={() => startEdit(c)} aria-label={`${c.name}を編集`} className="text-xs text-[#6EC6FF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded">編集</button>
                <button onClick={() => remove(c.id)} aria-label={`${c.name}を削除`} className="text-xs text-red-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded">削除</button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
