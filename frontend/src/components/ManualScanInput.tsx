import { useCallback, useEffect, useRef } from "react";
import { processScan } from "../scan/scanQueue";
import { findShelfByCode } from "../utils/shelfLookup";

interface Props {
  sessionActive: boolean;
  shelves: string[];
  onShelfSelect: (shelf: string) => void;
}

export function ManualScanInput({ sessionActive, shelves, onShelfSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = useCallback(() => {
    const code = inputRef.current?.value.trim() ?? "";
    if (inputRef.current) inputRef.current.value = "";
    if (!code) {
      requestAnimationFrame(focusInput);
      return;
    }

    const shelf = findShelfByCode(code, shelves);
    if (shelf) {
      onShelfSelect(shelf);
      requestAnimationFrame(focusInput);
      return;
    }

    processScan(code);
    requestAnimationFrame(focusInput);
  }, [focusInput, onShelfSelect, shelves]);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    submit();
  };

  return (
    <div className="shrink-0 bg-slate-950 border-b border-slate-700 px-3 py-2">
      <label htmlFor="manual-scan-input" className="block text-xs text-slate-400 mb-1">
        Referans / Barkod Giriş
        {!sessionActive && (
          <span className="text-amber-400 ml-2">(Önce Yönetim → Sayım Başlat)</span>
        )}
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          id="manual-scan-input"
          type="text"
          placeholder="Etiket okutun veya raf kodu yazın (örn. B023), Enter"
          className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-blue-500"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={onEnter}
        />
      </form>
    </div>
  );
}
