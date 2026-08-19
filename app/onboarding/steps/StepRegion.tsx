import { RegionSelector } from "@/app/components/ui/RegionSelector";
import { orderedServerRegions, type ServerRegion } from "@/lib/serverRegion";

export function StepRegion({
  region,
  recommended,
  onChange,
}: {
  region: ServerRegion;
  recommended: ServerRegion;
  onChange: (region: ServerRegion) => void;
}) {
  return (
    <>
      <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">Connect to our server</h1>
      <p className="mx-auto mb-6 max-w-md text-sm leading-[1.6] text-text-muted">
        For the best speed, please choose the continent closest to your physical location.
      </p>
      <RegionSelector
        region={region}
        onChange={onChange}
        options={orderedServerRegions(recommended)}
        recommended={recommended}
        accent="red"
      />
    </>
  );
}
