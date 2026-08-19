import { AccountDangerZone } from "./AccountDangerZone";
import { ServerRegionSettings } from "./ServerRegionSettings";

export default function SettingsAccountPage() {
  return (
    <div className="flex flex-col gap-10">
      <ServerRegionSettings />
      <hr className="border-t border-border-soft" />
      <AccountDangerZone />
    </div>
  );
}
