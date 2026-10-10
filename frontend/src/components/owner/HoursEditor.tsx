import type { ShopSettings } from '@/lib/contracts/shops';

export const weekdays = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const;
type Hours = ShopSettings['workingHours'];
export function HoursEditor({ value, onChange, disabled }: { value: Hours; onChange: (value: Hours) => void; disabled: boolean }) {
  return <fieldset className="hours-editor" disabled={disabled}><legend>Weekly working hours</legend>
    <p className="field-hint">Times use the workshop timezone. Add up to four ordered windows per day for split shifts. No windows means closed.</p>
    {weekdays.map(([day, label]) => {
      const windows = value[day] ?? [];
      return <div className="hours-day" key={day}><strong>{label}</strong><div className="hours-windows">{!windows.length && <span className="closed-caption">Closed</span>}{windows.map(([open, close], index) => <div className="hours-window" key={index}>
        <label><span className="sr-only">{label} window {index + 1} opens</span><input type="time" value={open} onChange={event => onChange({ ...value, [day]: windows.map((window, i) => i === index ? [event.target.value, close] : window) })} /></label>
        <span aria-hidden="true">–</span><label><span className="sr-only">{label} window {index + 1} closes</span><input type="time" value={close} onChange={event => onChange({ ...value, [day]: windows.map((window, i) => i === index ? [open, event.target.value] : window) })} /></label>
        <button className="text-button" type="button" aria-label={`Remove ${label} window ${index + 1}`} onClick={() => onChange({ ...value, [day]: windows.filter((_, i) => i !== index) })}>Remove</button></div>)}
      </div><button className="text-button" type="button" disabled={windows.length >= 4} onClick={() => onChange({ ...value, [day]: [...windows, ['', '']] })}>Add window<span className="sr-only"> for {label}</span> +</button></div>;
    })}
  </fieldset>;
}
