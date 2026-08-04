import { useMemo, useState } from "react";
import type { ReportCorrectionEntry } from "../types";

interface Props {
  entries: ReportCorrectionEntry[];
}

type FilterCategory = "ALL" | "NOT_FOUND" | "MISPLACEMENT" | "UNKNOWN" | "UNASSIGNED" | "RECOVERED";

function getCategoryBadge(category: string) {
  if (
    category === "Bulunamadı" ||
    category === "Gerçek eksik" ||
    category === "Bulunamadı kaydı" ||
    category.includes("eksik") ||
    category.includes("bulunamadı") ||
    category.includes("Bulunamadı")
  ) {
    return {
      label: "🔴 Bulunamadı",
      type: "NOT_FOUND",
      className: "bg-red-500/20 text-red-300 border-red-500/30",
    };
  }
  if (
    category === "Excel'de yok" ||
    category === "Tanımsız Barkod" ||
    category.includes("Tanımsız") ||
    category.includes("Bilinmeyen")
  ) {
    return {
      label: "🟣 Tanımsız Barkod / Excel'de Yok",
      type: "UNKNOWN",
      className: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    };
  }
  if (
    category === "Depo boş" ||
    category === "Atanmamış Bulunan" ||
    category.includes("Depo boş") ||
    category.includes("Fazla")
  ) {
    return {
      label: "🔵 Atanmamış / Depo Boş",
      type: "UNASSIGNED",
      className: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    };
  }
  if (category.includes("bulundu") || category.includes("Bulundu")) {
    return {
      label: "🟢 Sonradan Bulunan",
      type: "RECOVERED",
      className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    };
  }
  if (category === "Raf uyumsuzluğu") {
    return {
      label: "🟡 Raf Uyumsuzluğu",
      type: "MISPLACEMENT",
      className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    };
  }
  return {
    label: `⚠️ ${category}`,
    type: "MISPLACEMENT",
    className: "bg-slate-800 text-slate-300 border-slate-700",
  };
}

export function CompactAnomalyReportList({ entries }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("ALL");

  const categoryCounts = useMemo(() => {
    const counts = {
      ALL: entries.length,
      NOT_FOUND: 0,
      MISPLACEMENT: 0,
      UNKNOWN: 0,
      UNASSIGNED: 0,
      RECOVERED: 0,
    };
    entries.forEach((entry) => {
      const b = getCategoryBadge(entry.category);
      if (b.type in counts) {
        counts[b.type as keyof typeof counts]++;
      }
    });
    return counts;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const b = getCategoryBadge(entry.category);
      if (activeCategory !== "ALL" && b.type !== activeCategory) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        entry.etiket.toLowerCase().includes(q) ||
        entry.message.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q) ||
        (entry.expected_shelf && entry.expected_shelf.toLowerCase().includes(q)) ||
        (entry.found_shelf && entry.found_shelf.toLowerCase().includes(q)) ||
        (entry.stok_no && entry.stok_no.toLowerCase().includes(q)) ||
        (entry.product_name && entry.product_name.toLowerCase().includes(q)) ||
        (entry.username && entry.username.toLowerCase().includes(q))
      );
    });
  }, [entries, activeCategory, search]);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
        🎉 Bu sayımda herhangi bir anomali, eksik veya uyumsuzluk tespit edilmedi.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {/* Category Pills Header */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveCategory("ALL")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
            activeCategory === "ALL"
              ? "bg-slate-700 text-white border-slate-500 shadow"
              : "bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700"
          }`}
        >
          Tüm Anomaliler ({categoryCounts.ALL})
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory("NOT_FOUND")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
            activeCategory === "NOT_FOUND"
              ? "bg-red-600 text-white border-red-500 shadow"
              : "bg-red-950/40 text-red-300 border-red-900/50 hover:bg-red-900/40"
          }`}
        >
          🔴 Bulunamadı ({categoryCounts.NOT_FOUND})
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory("MISPLACEMENT")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
            activeCategory === "MISPLACEMENT"
              ? "bg-amber-600 text-white border-amber-500 shadow"
              : "bg-amber-950/40 text-amber-300 border-amber-900/50 hover:bg-amber-900/40"
          }`}
        >
          🟡 Raf Uyumsuzluğu ({categoryCounts.MISPLACEMENT})
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory("UNKNOWN")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
            activeCategory === "UNKNOWN"
              ? "bg-purple-600 text-white border-purple-500 shadow"
              : "bg-purple-950/40 text-purple-300 border-purple-900/50 hover:bg-purple-900/40"
          }`}
        >
          🟣 Tanımsız Barkod / Excel'de Yok ({categoryCounts.UNKNOWN})
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory("UNASSIGNED")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
            activeCategory === "UNASSIGNED"
              ? "bg-blue-600 text-white border-blue-500 shadow"
              : "bg-blue-950/40 text-blue-300 border-blue-900/50 hover:bg-blue-900/40"
          }`}
        >
          🔵 Atanmamış / Depo Boş ({categoryCounts.UNASSIGNED})
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory("RECOVERED")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
            activeCategory === "RECOVERED"
              ? "bg-emerald-600 text-white border-emerald-500 shadow"
              : "bg-emerald-950/40 text-emerald-300 border-emerald-900/50 hover:bg-emerald-900/40"
          }`}
        >
          🟢 Sonradan Bulunan ({categoryCounts.RECOVERED})
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          placeholder="Etiket, raf, stok kodu, açıklama veya kullanıcı ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-2.5 pl-10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <span className="absolute left-3.5 top-2.5 text-slate-500 text-sm">🔍</span>
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-200"
          >
            Temizle
          </button>
        )}
      </div>

      {/* High-density Compact Table List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 overflow-hidden">
        <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-900/95 border-b border-slate-800 text-slate-400 font-medium z-10">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th className="py-2.5 px-3 w-36">Kategori</th>
                <th className="py-2.5 px-3 w-32 font-mono">Etiket</th>
                <th className="py-2.5 px-3 w-40">Raf Değişimi</th>
                <th className="py-2.5 px-3">Bildirim / Açıklama</th>
                <th className="py-2.5 px-3 w-32 text-right">Kullanıcı & Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                    Aranan kriterlere uygun anomali kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry, idx) => {
                  const badge = getCategoryBadge(entry.category);
                  return (
                    <tr
                      key={`${entry.etiket}-${entry.created_at}-${idx}`}
                      className="hover:bg-slate-900/70 transition-colors"
                    >
                      {/* # Row No */}
                      <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]">
                        {entry.row_no ?? idx + 1}
                      </td>

                      {/* Category Badge */}
                      <td className="py-2 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge.className}`}
                        >
                          {entry.category}
                        </span>
                      </td>

                      {/* Etiket */}
                      <td className="py-2 px-3 font-mono font-semibold text-slate-100">
                        {entry.etiket}
                        {entry.stok_no && (
                          <span className="block text-[10px] text-slate-500 font-sans">
                            {entry.stok_no}
                          </span>
                        )}
                      </td>

                      {/* Shelf Transformation */}
                      <td className="py-2 px-3 text-[11px] text-slate-300">
                        {entry.expected_shelf || entry.found_shelf ? (
                          <div className="flex items-center gap-1 font-mono">
                            <span className="text-slate-400">{entry.expected_shelf || "—"}</span>
                            <span className="text-slate-500">➔</span>
                            <span className="font-semibold text-slate-200">{entry.found_shelf || "—"}</span>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Description Message */}
                      <td className="py-2 px-3 text-slate-300 leading-snug">
                        {entry.message}
                        {entry.product_name && (
                          <span className="block text-[10px] text-slate-500 truncate">
                            {entry.product_name}
                          </span>
                        )}
                      </td>

                      {/* User & Timestamp */}
                      <td className="py-2 px-3 text-right text-[10px] text-slate-400 whitespace-nowrap">
                        <div className="font-medium text-slate-300">{entry.username || "—"}</div>
                        <div className="text-slate-500">
                          {entry.created_at ? new Date(entry.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-slate-900/60 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Toplam {filteredEntries.length} anomali kaydı listeleniyor</span>
          <span>Süzgeç: {activeCategory === "ALL" ? "Tüm Kategoriler" : activeCategory}</span>
        </div>
      </div>
    </section>
  );
}
