import { FaRotateLeft } from "react-icons/fa6";

interface UndoPillProps {
  visible: boolean;
  onUndo: () => void;
  disabled?: boolean;
}

export function UndoPill({ visible, onUndo, disabled }: UndoPillProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border-soft bg-bg-main/90 px-5 py-2.5 text-[0.85rem] font-bold text-text-muted [&>svg]:h-3.5 [&>svg]:w-3.5 hover:border-white/20 hover:text-white"
      onClick={onUndo}
      disabled={disabled}
    >
      <FaRotateLeft />
      Undo
    </button>
  );
}
