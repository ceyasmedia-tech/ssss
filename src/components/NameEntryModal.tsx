import React, { useState } from 'react';
import { ArrowRight, Grid3X3 } from 'lucide-react';

interface NameEntryModalProps {
  initialName?: string;
  isRename?: boolean;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}

export const NameEntryModal: React.FC<NameEntryModalProps> = ({
  initialName = '',
  isRename = false,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Lütfen en az 2 karakterli bir oyuncu adı gir.');
      return;
    }
    onSubmit(trimmed.slice(0, 20));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Grid3X3 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-50">
              {isRename ? 'Oyuncu Adını Güncelle' : 'Pathblock Arena’ya Hoş Geldin'}
            </h2>
            <p className="text-xs text-slate-400">
              Çevrim içi lobi · 4 kişiye kadar · Rastgele seviyeler
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          {isRename
            ? 'Lobide, arkadaş listende ve oyun masasında görünecek yeni adını yaz.'
            : 'Arenaya katılmak, çevrim içi oyuncuları görmek ve arkadaş listeni yönetmek için oyuncu adını gir.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="player-name-input" className="block text-xs font-medium text-slate-400 mb-1.5">
              Oyuncu Adı
            </label>
            <input
              id="player-name-input"
              type="text"
              autoFocus
              maxLength={20}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="Örn: Kaan, Stratejist, Deniz..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            {error && <p className="mt-1.5 text-xs text-rose-400">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {isRename && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Vazgeç
              </button>
            )}
            <button
              type="submit"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{isRename ? 'Kaydet' : 'Arenaya Gir'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
