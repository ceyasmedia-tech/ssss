import React from 'react';
import { Download, Smartphone, Terminal, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface AndroidApkModalProps {
  onClose: () => void;
}

export const AndroidApkModal: React.FC<AndroidApkModalProps> = ({ onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-slate-50">
                Android APK & Mobil Kurulum
              </h2>
              <p className="text-xs text-slate-400">
                Doğrudan Android kurulumu veya Gradle APK projesi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Option 1: Instant PWA Install */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-sm font-semibold text-slate-100">
                1. Anında Mobil Uygulama Kurulumu (PWA)
              </h3>
              {isInstalled && (
                <span className="text-xs font-medium text-emerald-400">Yüklendi</span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Tarayıcı çubuğu olmadan tam ekran Android uygulama deneyimi için doğrudan cihazına yükleyebilirsin.
            </p>
            {isInstallable ? (
              <button
                onClick={install}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Cihaza Şimdi Kur</span>
              </button>
            ) : isIOS ? (
              <p className="text-xs text-amber-300">
                iPhone/iPad için Safari alt menüsünden <strong>Paylaş → Ana Ekrana Ekle</strong> adımını kullan.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Android Chrome menüsünden <strong>Ana ekrana ekle / Uygulamayı yükle</strong> seçeneğini kullanabilirsin.
              </p>
            )}
          </div>

          {/* Option 2: Download Full Android Gradle Project for APK */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <h3 className="text-sm font-semibold text-slate-100 mb-1.5">
              2. Android Studio / Gradle APK Projesi (.zip)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Bu sunucu ortamında Android SDK/Java JDK kurulu olmadığı için doğrudan derlenmiş{' '}
              <code className="text-slate-200">.apk</code> ikili dosyası yerine canlı sunucu adresinle önceden yapılandırılmış tam{' '}
              <code className="text-slate-200">android/</code> Kotlin + WebView projesini paket olarak indirebilirsin.
            </p>

            <a
              href="/api/android-project.zip"
              download="pathblock-arena-android.zip"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Android APK Projesini İndir (.zip)</span>
            </a>

            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-[11px] text-slate-300 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <Terminal className="h-3.5 w-3.5" />
                <span>Bilgisayarında APK Derleme Komutu:</span>
              </div>
              <div>unzip pathblock-arena-android.zip && cd pathblock-android</div>
              <div>gradle assembleDebug</div>
              <div className="text-emerald-400">→ app/build/outputs/apk/debug/app-debug.apk</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
