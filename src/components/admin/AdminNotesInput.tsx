interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function AdminNotesInput({ value, onChange, placeholder }: Props) {
  return (
    <div className="mb-4">
      <label className="text-xs text-gray-400 block mb-1">Admin Notes</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Add context or reason for rejection..."}
        className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-white placeholder-gray-600 resize-none h-20 focus:outline-none focus:border-cyan-400/50"
      />
    </div>
  );
}
