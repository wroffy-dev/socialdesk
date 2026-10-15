'use client';

import * as React from 'react';
import { NativeSelect } from '@/components/ui/input';
import { supportedTimezones } from '@/lib/timezones';

/**
 * Timezone dropdown. Browsers list canonical ICU names (e.g. "Asia/Calcutta"), so the current
 * value is always added to the options to keep aliases like "Asia/Kolkata" selectable.
 */
export const TimezoneSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>((props, ref) => {
  const [extra, setExtra] = React.useState<string | null>(null);
  const current = typeof props.value === 'string' ? props.value : null;
  const zones = React.useMemo(() => {
    const list = supportedTimezones();
    for (const z of [current, extra]) if (z && !list.includes(z)) list.unshift(z);
    return list;
  }, [current, extra]);
  // Uncontrolled usage (react-hook-form register): pick up the default value once mounted.
  const innerRef = React.useRef<HTMLSelectElement | null>(null);
  React.useEffect(() => {
    const v = innerRef.current?.value;
    if (v && !supportedTimezones().includes(v)) setExtra(v);
  }, []);
  return (
    <NativeSelect
      ref={(el) => {
        innerRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      {...props}
    >
      {zones.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, ' ')}
        </option>
      ))}
    </NativeSelect>
  );
});
TimezoneSelect.displayName = 'TimezoneSelect';
