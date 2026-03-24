# eczanetest

Türkiye nöbetçi eczaneleri — Next.js, Google Maps, Supabase (günlük senkron) ve CollectAPI.

## Kurulum

```bash
npm install
cp .env.example .env.local
```

`.env.local` içinde `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `COLLECT_API_KEY`, Supabase ve `CRON_SECRET` değerlerini doldurun. Supabase için `supabase/migrations` SQL’ini çalıştırın.

```bash
npm run dev
```

## Cron (veri çekimi)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/sync-pharmacies
```

Vercel’de `vercel.json` içindeki günlük cron ve ortam değişkenlerini tanımlayın.
