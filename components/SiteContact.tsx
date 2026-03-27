const CONTACT_EMAIL = "yakinnobetcieczane@gmail.com";

export default function SiteContact({
  className = "text-center text-xs text-slate-500",
}: {
  className?: string;
}) {
  return (
    <p className={className}>
      İletişim:{" "}
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-red-700"
      >
        {CONTACT_EMAIL}
      </a>
    </p>
  );
}
