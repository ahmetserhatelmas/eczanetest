export default function SiteDisclaimer({
  className = "text-center text-xs leading-relaxed text-slate-600",
}: {
  className?: string;
}) {
  return (
    <p className={className}>
      Sitemizde yer alan nöbetçi eczane bilgileri bilgilendirme amaçlıdır.
      Verilerdeki olası gecikme veya hatalardan sitemiz sorumlu tutulamaz.
      Mağduriyet yaşamamak için lütfen yola çıkmadan önce eczaneyi telefonla
      arayarak nöbet durumunu teyit ediniz.
    </p>
  );
}
