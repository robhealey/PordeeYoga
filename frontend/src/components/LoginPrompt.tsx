import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/i18n";

export function LoginPrompt({ label }: { label: string }) {
  const { loginWithLine } = useAuth();
  const { t } = useLanguage();
  return (
    <div className="bg-white border border-sage-200 rounded-lg p-6 text-center">
      <p className="text-sage-600 mb-3">{t("loginPrompt.prefix", { label })}</p>
      <button
        onClick={() => void loginWithLine()}
        className="bg-sage-500 text-white px-4 py-2 rounded-md hover:bg-sage-600"
      >
        {t("nav.loginWithLine")}
      </button>
    </div>
  );
}
