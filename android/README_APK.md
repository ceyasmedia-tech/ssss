# Pathblock Arena — Android APK Derleme Rehberi

Bu klasör, **Pathblock Arena** uygulamasının tam Android (Kotlin + WebView) Gradle projesini içerir.

## Seçenek 1: Android Studio ile APK Oluşturma
1. Android Studio'yu açın ve **Open** diyerek bu `android/` klasörünü seçin.
2. Gradle senkronizasyonunun tamamlanmasını bekleyin.
3. Üst menüden **Build → Build Bundle(s) / APK(s) → Build APK(s)** seçeneğine tıklayın.
4. Oluşan `app-debug.apk` dosyasını Android cihazınıza yükleyin.

## Seçenek 2: Komut Satırı ile APK Derleme
```bash
cd android
gradle assembleDebug
# Çıktı: app/build/outputs/apk/debug/app-debug.apk
```

## Seçenek 3: Doğrudan PWA Kurulumu (APK Derlemeden)
Android Chrome üzerinden uygulamayı açıp sağ üstteki **"Android / Yükle"** butonuna basarak ana ekrana tam ekran uygulama olarak kurabilirsiniz.
