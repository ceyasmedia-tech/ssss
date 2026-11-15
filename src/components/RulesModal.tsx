import React from 'react';
import { Compass, Shield, Sparkles, Trophy, X } from 'lucide-react';

interface RulesModalProps {
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-50">
              Pathblock Nasıl Oynanır?
            </h2>
            <p className="text-xs text-slate-400">
              2–4 oyunculu taktiksel yol açma ve engelleme yarışı
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100 block mb-0.5">Amaç</strong>
              Piyonunu kendi renkli hedef kenarına (karşı kenara) rakiplerinden önce ulaştır.
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <Compass className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100 block mb-0.5">Hamle Yapma</strong>
              Sıran geldiğinde yukarı, aşağı, sola veya sağa 1 kare ilerleyebilirsin. Önünde rakip varsa üzerinden atlayabilirsin (arkası kapalıysa çapraz geçiş açılır).
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <Shield className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100 block mb-0.5">Engel Koyma (R ile Döndür)</strong>
              İlerlemek yerine rakiplerin yolunu uzatmak için 2 karelik yatay veya dikey engel yerleştirebilirsin. Ancak hiçbir oyuncunun hedef yolu tamamen kapatılamaz!
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <Sparkles className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100 block mb-0.5">Rastgele Seviye Üretici</strong>
              Her seviyede taş sütunlar, ön engeller ve +1 Engel bonus kareleri BFS çözülebilirlik garantisiyle rastgele üretilir.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
        >
          Anladım, Oyuna Dön
        </button>
      </div>
    </div>
  );
};
