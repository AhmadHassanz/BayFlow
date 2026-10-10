import type { ShopSettings } from '@/lib/contracts/shops';

export const weekdays = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const;
type Hours = ShopSettings['workingHours'];
const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const displayHour = hours % 12 || 12;
  return { value, label: `${displayHour}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}` };
});
function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{timeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
export function HoursEditor({ value, onChange, disabled }: { value: Hours; onChange: (value: Hours) => void; disabled: boolean }) {
  return <fieldset className="hours-editor" disabled={disabled}><legend>Weekly working hours</legend>
    <p className="field-hint">Choose times in the workshop timezone. New windows start at 9:00 AM and end at 5:00 PM. Add up to four ordered windows per day for split shifts. No windows means closed.</p>
    {weekdays.map(([day, label]) => {
      const windows = value[day] ?? [];
      return <div className="hours-day" key={day}><strong>{label}</strong><div className="hours-windows">{!windows.length && <span className="closed-caption">Closed</span>}{windows.map(([open, close], index) => <div className="hours-window" key={index}>
        <TimeSelect label={`${label} window ${index + 1} opens`} value={open} onChange={selected => onChange({ ...value, [day]: windows.map((window, i) => i === index ? [selected, close] : window) })} />
        <span aria-hidden="true">–</span><TimeSelect label={`${label} window ${index + 1} closes`} value={close} onChange={selected => onChange({ ...value, [day]: windows.map((window, i) => i === index ? [open, selected] : window) })} />
        <button className="text-button" type="button" aria-label={`Remove ${label} window ${index + 1}`} onClick={() => onChange({ ...value, [day]: windows.filter((_, i) => i !== index) })}>Remove</button></div>)}
      </div><button className="text-button" type="button" aria-label={`Add window for ${label}`} disabled={windows.length >= 4} onClick={() => onChange({ ...value, [day]: [...windows, ['09:00', '17:00']] })}>Add window +</button></div>;
    })}
  </fieldset>;
}
