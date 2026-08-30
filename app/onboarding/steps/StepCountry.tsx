import { CountrySelect } from "@/app/components/ui/CountrySelect";

export function StepCountry({ country, onChange }: { country: string | null; onChange: (code: string) => void }) {
  return (
    <>
      <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">What country are you from?</h1>
      <p className="mx-auto mb-6 max-w-md text-sm leading-[1.6] text-text-muted">
        Shown on the leaderboard, unless you choose to appear anonymously.
      </p>
      <div className="mx-auto w-sm max-w-full text-left">
        <CountrySelect id="onboarding-country" value={country} onChange={onChange} placement="auto" />
      </div>
    </>
  );
}
