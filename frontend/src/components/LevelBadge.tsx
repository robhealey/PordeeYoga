import type { ClassLevel } from "../lib/api";
import { useLanguage } from "../lib/i18n";

const LEVEL_STYLE: Record<ClassLevel, string> = {
  beginner: "bg-sky-50 text-sky-700 border-sky-200",
  advanced: "bg-rose-50 text-rose-700 border-rose-200",
  both: "bg-sage-50 text-sage-700 border-sage-200",
};

export default function LevelBadge({ level, className = "" }: { level: ClassLevel | null | undefined; className?: string }) {
  const { t } = useLanguage();
  if (!level) return null;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[level]} ${className}`}>
      {t(`level.${level}`)}
    </span>
  );
}
