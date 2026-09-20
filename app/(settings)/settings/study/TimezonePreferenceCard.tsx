"use client";

import { useId, useState } from "react";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Toggle } from "@/app/components/ui/Toggle";
import { Collapsible } from "@/app/components/ui/Collapsible";
import { CountrySelect } from "@/app/components/ui/CountrySelect";
import { fieldLabel, fieldHint } from "@/app/components/ui/formClasses";
import { useUserProfileContext } from "@/lib/client-data/UserProfileContext";
import { useClientClock } from "@/lib/useClientClock";
import { countryForTimeZone, timezonesForCountry } from "@/lib/timezoneCountry";
import {
  STUDY_DAY_START_HOUR,
  defaultTimeZoneFor,
  deviceTimeZone,
  timeZoneCity,
  timeZoneLabel,
  timeZoneOffsetLabel,
  timeZoneOffsetMinutes,
  timeZoneWallClock,
} from "@/lib/timezone";

const SELECT_CLASS =
  "w-full appearance-none rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 pr-10 text-[0.95rem] text-white outline-none transition-colors [color-scheme:dark] focus:border-white/30 disabled:cursor-not-allowed disabled:text-text-muted";

export interface TimezonePreference {
  enabled: boolean;
  timeZone: string | null;
}

/** The "Custom timezone" card on Settings -> Study: a toggle that, while on, reveals a country +
 * timezone picker. Purely presentational -- the form owns the two values and autosaves them. */
export function TimezonePreferenceCard({
  enabled,
  timeZone,
  disabled = false,
  onChange,
}: {
  enabled: boolean;
  /** The saved pick. Kept while the toggle is off, so switching it back on restores it. */
  timeZone: string | null;
  disabled?: boolean;
  onChange: (next: TimezonePreference) => void;
}) {
  const { profile } = useUserProfileContext();
  const countryId = useId();
  const zoneId = useId();
  // Null until the first tick, which only happens in the browser -- everything below that depends on
  // the current time or the device's own timezone waits for it, so the server-rendered markup and
  // the first client render agree.
  const now = useClientClock(15_000);
  const at = now === null ? null : new Date(now);
  // Only set once the user picks a country here. The country shown is otherwise derived: the pick's
  // own country, else the profile's. It never writes back to the profile.
  const [pickedCountry, setPickedCountry] = useState<string | null>(null);

  const country = pickedCountry ?? countryForTimeZone(timeZone) ?? profile.country;

  const countryZones = timezonesForCountry(country);
  // The saved pick (or a zone reached some other way) might not be one of the country's own.
  const zones = timeZone && !countryZones.includes(timeZone) ? [...countryZones, timeZone] : countryZones;
  const sortedZones = at
    ? zones
        .map((zone) => ({ zone, offset: timeZoneOffsetMinutes(zone, at) }))
        .sort((a, b) => a.offset - b.offset || timeZoneCity(a.zone).localeCompare(timeZoneCity(b.zone)))
        .map(({ zone }) => zone)
    : zones;

  function handleToggle() {
    if (enabled) onChange({ enabled: false, timeZone });
    else onChange({ enabled: true, timeZone: timeZone ?? defaultTimeZoneFor(profile.country) });
  }

  function handleCountryChange(code: string) {
    setPickedCountry(code);
    onChange({ enabled: true, timeZone: defaultTimeZoneFor(code) });
  }

  const device = at ? deviceTimeZone() : null;

  return (
    // z-10 lifts this card's stacking context above the cards after it, so the country dropdown can
    // open downward over them instead of sliding underneath.
    <GlassCard padding="lg" className="z-10 mt-5.5">
      <div className="flex items-center justify-between gap-5 py-1">
        <div>
          <div className="mb-0.5 text-[0.95rem] font-bold">Custom timezone</div>
          <div className="text-sm text-text-muted">
            Use a different timezone than your device. Your study day, daily limits, streak and leaderboards follow it.
          </div>
        </div>
        <Toggle checked={enabled} onChange={handleToggle} disabled={disabled} aria-label="Custom timezone" />
      </div>

      <Collapsible open={enabled} openClassName="mt-5">
        <div className="border-t border-border-soft pt-4">
          <label htmlFor={countryId} className={fieldLabel}>
            Country
          </label>
          <CountrySelect
            id={countryId}
            value={country}
            onChange={handleCountryChange}
            disabled={disabled}
            placement="auto"
          />

          {sortedZones.length > 1 ? (
            <div className="mt-4">
              <label htmlFor={zoneId} className={fieldLabel}>
                Timezone
              </label>
              <div className="relative">
                <select
                  id={zoneId}
                  value={timeZone ?? ""}
                  onChange={(e) => onChange({ enabled: true, timeZone: e.target.value })}
                  disabled={disabled}
                  className={SELECT_CLASS}
                >
                  {sortedZones.map((zone) => (
                    <option key={zone} value={zone} className="bg-bg-main text-white">
                      {at ? timeZoneLabel(zone, at) : timeZoneCity(zone)}
                    </option>
                  ))}
                </select>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                  aria-hidden
                >
                  <path d="M5.25 7.5 10 12.25l4.75-4.75H5.25Z" />
                </svg>
              </div>
            </div>
          ) : null}

          {at && timeZone ? (
            <p className={`${fieldHint} mt-3`}>
              Now in {timeZoneCity(timeZone)}:{" "}
              <span className="font-semibold text-white">{timeZoneWallClock(timeZone, at)}</span> ({timeZoneOffsetLabel(timeZone, at)})
            </p>
          ) : null}
          <p className={fieldHint}>
            Your study day resets at {STUDY_DAY_START_HOUR}:00 AM in this timezone.
          </p>
          {device && at ? (
            <p className={fieldHint}>
              Your device is set to {device} ({timeZoneOffsetLabel(device, at)}).{" "}
              <button
                type="button"
                onClick={() => onChange({ enabled: false, timeZone })}
                disabled={disabled}
                className="font-semibold text-accent-blue underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use device timezone
              </button>
            </p>
          ) : null}
        </div>
      </Collapsible>
    </GlassCard>
  );
}
