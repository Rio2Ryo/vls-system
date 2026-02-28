"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Company, CompanyTier, InterestTag } from "@/lib/types";
import { getStoredCompanies, setStoredCompanies } from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { inputCls, TIER_COLORS, uploadFileToR2, readAsDataUrl, extractYouTubeId } from "./adminUtils";

interface Props {
  onSave: (msg: string) => void;
}

export default function CompaniesTab({ onSave }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", tier: "gold" as CompanyTier, tags: "" as string,
    cm15: "", cm30: "", cm60: "",
    offerText: "", offerUrl: "", couponCode: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCompanies(getStoredCompanies()); }, []);

  const startNew = () => {
    setEditing("__new__");
    setForm({ name: "", tier: "gold", tags: "", cm15: "", cm30: "", cm60: "", offerText: "", offerUrl: "", couponCode: "" });
    setLogoFile(null);
    setLogoPreview("");
  };

  const startEdit = (c: Company) => {
    setEditing(c.id);
    setForm({
      name: c.name, tier: c.tier, tags: c.tags.join(", "),
      cm15: c.videos.cm15, cm30: c.videos.cm30, cm60: c.videos.cm60,
      offerText: c.offerText, offerUrl: c.offerUrl, couponCode: c.couponCode || "",
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
          };
        });
      }
      setStoredCompanies(updated);
      setCompanies(updated);
      setEditing(null);
      onSave("企業情報を保存しました");
    } finally {
      setSaving(false);
    }
  };

  const remove = (id: string) => {
    const updated = companies.filter((c) => c.id !== id);
    setStoredCompanies(updated);
    setCompanies(updated);
    onSave("企業を削除しました");
  };

  return (
    <div className="space-y-4" data-testid="admin-companies">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">パートナー企業</h2>
        {!IS_DEMO_MODE && <Button size="sm" onClick={startNew}>+ 企業追加</Button>}
      </div>

      {!IS_DEMO_MODE && editing && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">{editing === "__new__" ? "新規企業" : "企業編集"}</h3>
          <div className="space-y-3">
            <input className={inputCls} placeholder="企業名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="company-name-input" />
            <div className="border border-gray-100 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-gray-500">企業ロゴ</p>
              <div className="flex items-center gap-3">
                {logoPreview && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logoPreview} alt="ロゴプレビュー" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
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
                    <button type="button" onClick={removeLogo} className="text-xs text-red-400 hover:underline">ロゴ削除</button>
                  )}
                </div>
              </div>
            </div>
            <select className={inputCls} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as CompanyTier })} data-testid="company-tier-select">
              <option value="platinum">Platinum</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="bronze">Bronze</option>
            </select>
            <input className={inputCls} placeholder="タグ（カンマ区切り: education, sports）" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} data-testid="company-tags-input" />
            <div className="border border-gray-100 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-gray-500">CM動画 YouTube ID</p>
              <input className={inputCls + " font-mono"} placeholder="15秒CM（YouTube URLまたはID）" value={form.cm15} onChange={(e) => setForm({ ...form, cm15: extractYouTubeId(e.target.value) })} data-testid="company-cm15-input" />
              <input className={inputCls + " font-mono"} placeholder="30秒CM（YouTube URLまたはID）" value={form.cm30} onChange={(e) => setForm({ ...form, cm30: extractYouTubeId(e.target.value) })} data-testid="company-cm30-input" />
              <input className={inputCls + " font-mono"} placeholder="60秒CM（YouTube URLまたはID）" value={form.cm60} onChange={(e) => setForm({ ...form, cm60: extractYouTubeId(e.target.value) })} data-testid="company-cm60-input" />
            </div>
            <input className={inputCls} placeholder="オファーテキスト" value={form.offerText} onChange={(e) => setForm({ ...form, offerText: e.target.value })} />
            <input className={inputCls} placeholder="オファーURL" value={form.offerUrl} onChange={(e) => setForm({ ...form, offerUrl: e.target.value })} />
            <input className={inputCls + " font-mono"} placeholder="クーポンコード（任意）" value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(["platinum", "gold", "silver", "bronze"] as const).map((t) => {
          const count = companies.filter((c) => c.tier === t).length;
          return (
            <div key={t} className={`text-center py-2 rounded-xl ${TIER_COLORS[t]} bg-opacity-50`}>
              <p className="text-lg font-bold">{count}</p>
              <p className="text-[10px] uppercase font-bold">{t}</p>
            </div>
          );
        })}
      </div>

      {companies.map((c) => (
        <Card key={c.id}>
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.logoUrl} alt={c.name} className="w-12 h-12 rounded-full" />
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
                <button onClick={() => startEdit(c)} className="text-xs text-[#6EC6FF] hover:underline">編集</button>
                <button onClick={() => remove(c.id)} className="text-xs text-red-400 hover:underline">削除</button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
