# Atölye Yönetim — Mobil (iOS + Android)

`ERP-AI` (Streamlit) masaüstü uygulamasının React Native + Expo (TypeScript) karşılığı.
Aynı veritabanı şeması, aynı iş kuralları; şimdilik veri telefondaki yerel SQLite'ta, ileride sunucuya taşınacak şekilde katmanlı.

## Kurulum

Gereken: Node.js 20+ ve telefonda **Expo Go** uygulaması (veya Xcode / Android Studio).

```bash
cd ~/Desktop/ERP-Mobile
npm install
npx expo install --check     # paket sürümlerini Expo SDK'sına göre doğrular / düzeltir
npx expo start               # QR kodu Expo Go ile okut; i = iOS simülatör, a = Android emülatör
```

Kontroller:

```bash
npm run typecheck   # TypeScript
npm test            # iş mantığı testleri (Node 22+; ağırlık/maliyet, kodlar, satış→gelir, planlama, yedek...)
```

> **Not:** Bu proje, `npm install` yapılamayan bir ortamda yazıldı. Veri/iş mantığı katmanı Node'da gerçek SQLite ile
> test edildi (15 test), ancak ekranlar (React Native arayüzü) bir telefonda/simülatörde henüz çalıştırılmadı.
> İlk çalıştırmada küçük düzeltmeler gerekebilir; hata çıktısını paylaşırsan hızlıca giderilir.

## Ekranlar (masaüstü ile aynı kapsam)

| Sekme / Sayfa | İçerik |
|---|---|
| Dashboard | KPI'lar, aylık satış grafiği, son işlemler, kritik stok, bekleyen siparişler, cari özet |
| Siparişler | İş emirleri, ilerleme (%), durum kuralları, stok yetersizliği uyarısı |
| Ürünler (+ detay) | Ürün, fotoğraf, reçete (malzeme bileşenleri), operasyonlar (sıralama), siparişler, stoğa ekle |
| Stok (+ detay) | Stokta takip edilen bileşenler ve ürünler, giriş/çıkış/sayım hareketleri, hareket geçmişi |
| Daha Fazla → Üretim Planı | Günlük/haftalık kapasite, buffer, hesaplayıcı, açık siparişler için termin takvimi |
| Daha Fazla → Malzeme Bileşenleri | Hammadde ölçüsü + cins → otomatik kg ve birim maliyet, fotoğraf, "Stoğa Ekle" |
| Daha Fazla → Müşteriler / Satışlar / Gelir-Gider | Cari, tahsilat (satış → otomatik gelir kaydı), kasa hareketleri |
| Daha Fazla → Raporlar | Hedef kutuları, en çok satanlar, aylık özet, gelir/gider trendi, CSV paylaşımı |
| Daha Fazla → Ayarlar | Şirket, KDV, hedefler, malzeme cinsleri/yoğunluklar, yedekleme, sıfırlama |

Masaüstüyle aynı kurallar: bileşenler stoğa **kendiliğinden girmez** ("Stoğa Ekle" ile eklenir); siparişin "Tamamlandı"
olması stoktan **otomatik düşüm yapmaz**; kodlar isimden üretilir (`MASA-01`), satış `S-1001…`, sipariş `SIP-1001…`.

Farklar: PDF/Excel dışa aktarma yok (rapor CSV olarak paylaşılır), genel arama yerine her listede arama kutusu var,
otomatik günlük yedek yok (Ayarlar'dan elle JSON yedek).

## Proje yapısı

```
app/                 expo-router rotaları (ince; ekranları src/screens'ten alır)
src/db/              şema + migrasyon (masaüstü init_db ile aynı), Db arayüzü, expo-sqlite adaptörü
src/domain/          saf hesaplamalar: ağırlık/maliyet, planlama, biçimlendirme (UI'dan bağımsız)
src/repo/            repository katmanı: stok, ürün, müşteri, satış, sipariş, metrik, yedek, ayar
src/screens/         ekranlar
src/components/      ortak formlar (ürün, malzeme, stok)
src/ui/              tasarım bileşenleri (kit.tsx, forms.tsx, theme.ts)
src/services/        fotoğraf (dosya sistemi), yedek dosyası paylaşımı
tests/               Node ile çalışan mantık testleri
```

## Veri ve yedekleme

* Veritabanı: cihazdaki `atolye.db` (expo-sqlite). Şema masaüstündekiyle birebir aynı tablolar/sütunlar.
* Fotoğraflar: uygulama klasöründe `images/`, veritabanında yalnızca dosya adı (masaüstüyle aynı). Yedeğe **dahil değil**.
* **Yedek al / paylaş**: tüm tablolar tek JSON dosyası olarak paylaşım menüsüne gelir (Dosyalar, AirDrop, e-posta...).
  **Geri yükle** mevcut veriyi yedektekiyle değiştirir; hata olursa hiçbir şey değişmez.
* Masaüstündeki `data/erp.db` ile bu uygulamanın veritabanı **ayrıdır**; sunucuya geçene kadar iki taraf birbirini görmez.
  (İstenirse masaüstü SQLite'tan JSON yedek formatına bir dönüştürücü script yazılabilir.)

## Sunucuya geçiş planı

Uygulamanın tüm veri erişimi `createRepo(db)` (`src/repo/index.ts`) ile üretilen tek `Repo` nesnesinden geçer;
ekranlar SQL bilmez. Sunucuya geçerken:

1. Sunucuda aynı şemayı (PostgreSQL ya da SQLite) ve `Repo` metodlarına karşılık gelen uç noktaları (REST) yaz.
2. `src/repo/api/` altında aynı şekle sahip `createApiRepo(baseUrl, token)` yaz (her metod bir `fetch` çağrısı).
   İş kuralları (satış→gelir senkronu, kod üretimi, stok hareketi) sunucuya taşınır; `src/domain/` hesaplamaları
   istemcide kalabilir.
3. `src/state/app.tsx` içinde `createRepo(db)` yerine `createApiRepo(...)` kullan. Ekranlar değişmez.
4. Çevrimdışı çalışma gerekirse yerel SQLite önbellek + senkron kuyruğu eklenir; fotoğraflar için nesne depolama
   (S3 benzeri) ve veritabanında dosya adı yerine URL tutulur.
5. Kullanıcı girişi (token) ve çoklu kullanıcı için `settings`'e ek olarak `users` tablosu gerekir.

## Merkezi sunucu (Railway)

Uygulama artık verileri telefonda değil sunucuda tutar; aynı hesapla giriş yapan her cihaz aynı veriyi görür.

- **Kurulum:** `bash hepsi.sh` (Railway girişi + kullanıcı adı/şifre belirleme + yükleme + veri aktarımı + uygulamayı yayınlama).
- **Sunucu:** `server/index.ts` (Node 22, `node:sqlite`). Telefondaki mantığın aynısı `src/repo` altında çalışır; telefon `src/repo/api.ts` ile `/rpc` üzerinden çağırır.
- **Veri:** Railway volume → `/data` (veritabanı, `images/`, günlük `backups/` — son 14 gün).
- **Güvenlik:** HTTPS (Railway), kullanıcı adı + şifre, imzalı oturum jetonu, yanlış girişte bekletme / IP başına kilit, yalnızca izinli repo metotları.
- **Sonradan veri aktarmak:** `python3 tools/tasi.py --url https://... ` (masaüstü `erp.db` + fotoğraflar).
- **Sunucu testi (yerel):** `APP_USERNAME=x APP_PASSWORD=sifre1234 TOKEN_SECRET=<24+ karakter> node --experimental-strip-types --experimental-sqlite --no-warnings --import ./server/register.mjs server/index.ts`
