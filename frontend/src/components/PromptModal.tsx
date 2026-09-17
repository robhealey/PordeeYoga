import { useState, type FormEvent } from "react";

interface PromptModalProps {
  title: string;
  type?: "text" | "date";
  placeholder?: string;
  submitLabel?: string;
  required?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

/** Text/date input dialog — window.prompt() doesn't work in LINE's in-app browser, so admin actions use this instead. */
export function PromptModal({
  title,
  type = "text",
  placeholder,
  submitLabel = "Save",
  required = false,
  onSubmit,
  onClose,
}: PromptModalProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(value);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-lg w-full max-w-sm p-4"
      >
        <h3 className="font-medium text-sage-800 mb-3">{title}</h3>
        <input
          autoFocus
          required={required}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-sage-200 rounded-md px-3 py-2 text-sm mb-4"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-sage-500 hover:underline">
            Cancel
          </button>
          <button type="submit" className="px-3 py-1.5 text-sm bg-sage-500 text-white rounded-md hover:bg-sage-600">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
