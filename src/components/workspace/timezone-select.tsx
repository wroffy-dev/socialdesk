'use client';

import * as React from 'react';
import { NativeSelect } from '@/components/ui/input';
import { supportedTimezones } from '@/lib/timezones';

export const TimezoneSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>((props, ref) => {
  const zones = React.useMemo(() => supportedTimezones(), []);
  return (
    <NativeSelect ref={ref} {...props}>
      {zones.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, ' ')}
        </option>
      ))}
    </NativeSelect>
  );
});
TimezoneSelect.displayName = 'TimezoneSelect';
