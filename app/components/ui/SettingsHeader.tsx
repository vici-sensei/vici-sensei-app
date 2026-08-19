export function SettingsHeader({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <h2 className={`text-[1.7rem] font-extrabold leading-[1.2] tracking-[-0.8px] ${description ? "mb-2" : "mb-6.5"}`}>
        {title}
      </h2>
      {description && <p className="mb-6.5 text-base leading-[1.6] text-text-muted">{description}</p>}
    </>
  );
}
