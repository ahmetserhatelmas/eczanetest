# eczanetest

Türkiye nöbetçi eczaneleri — Next.js, Google Maps, **Supabase** ve günlük **nobetecza.com** senkronu.

## Kurulum

```bash
npm install
cp .env.example .env.local
```

1. Supabase’te `supabase/migrations/20260325120000_duty_pharmacies.sql` dosyasını çalıştırın.
2. `.env.local`: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NOBETECZA_API_KEY`, `SUPABASE_*`, `CRON_SECRET`.

```bash
npm run dev
```

## Günlük veri çekimi

Vercel’de `vercel.json` cron (~07:15 İstanbul) veya elle:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/sync-pharmacies"
```

81 il × nobetecza isteği (~1 istek/s) → **yaklaşık 90 sn**; `maxDuration` 300 sn.

**Kota:** nobetecza aylık/saniye limiti; ücretsiz planda günlük tam senkron yetmeyebilir — panelden paket kontrol edin.

## Okuma

`SUPABASE_URL` + `SUPABASE_ANON_KEY` tanımlıysa uygulama listeyi **Supabase’ten** okur. Tanımlı değilse (yerel deneme) doğrudan nobetecza çağrılır.
