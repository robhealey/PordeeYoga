import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "th";

const STORAGE_KEY = "pordeeyoga_lang";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.schedule": "Schedule",
  "nav.myBookings": "My Bookings",
  "nav.packages": "Packages",
  "nav.admin": "Admin",
  "nav.logout": "Log out",
  "nav.loginWithLine": "Log in with LINE",
  "footer.privacy": "Privacy Policy",
  "lang.toggleTo": "ไทย",

  "loginPrompt.prefix": "Log in with LINE to see {{label}}.",
  "loginPrompt.bookingsLabel": "your bookings",
  "loginPrompt.packagesLabel": "your packages",

  "schedule.title": "Upcoming Classes",
  "schedule.loading": "Loading classes…",
  "schedule.empty": "No upcoming classes yet.",
  "schedule.hi": "Hi {{name}},",
  "schedule.nextClass": "Next class: {{className}} — {{when}}",
  "schedule.noUpcomingBooked": "No upcoming classes booked yet.",
  "schedule.managePackages": "Manage packages",
  "schedule.prevDay": "Previous day",
  "schedule.nextDay": "Next day",
  "schedule.started": "Started",
  "schedule.spotsLeft": "{{n}} spots left",
  "schedule.full": "Full — join the waitlist",
  "schedule.cancel": "Cancel",
  "schedule.cancelReasonTitle": "Cancellation reason (optional)",
  "schedule.cancelReasonPlaceholder": "Reason",
  "schedule.cancelSubmit": "Cancel session",
  "status.scheduled": "Open",
  "status.confirmed": "Confirmed",
  "status.full": "Full",
  "status.cancelled_by_studio": "Cancelled",
  "status.completed": "Completed",

  "classDetail.loading": "Loading…",
  "classDetail.minutes": "{{n}} minutes",
  "classDetail.with": "with {{name}}",
  "classDetail.cancelled": "Cancelled by the studio",
  "classDetail.cancelledReason": "Cancelled by the studio: {{reason}}",
  "classDetail.full": "This class is full",
  "classDetail.spotsLeft": "{{n}} spots left",
  "classDetail.noPackage": "You don't have a package with credits available.",
  "classDetail.buyPackage": "Buy a package",
  "classDetail.toBook": "to book this class.",
  "classDetail.usePackage": "Use package",
  "classDetail.creditsLeft": "{{n}} left",
  "classDetail.unlimited": "Unlimited",
  "classDetail.expires": "exp. {{date}}",
  "classDetail.booking": "Booking…",
  "classDetail.book": "Book this class",
  "classDetail.loginToBook": "Log in with LINE to book",
  "classDetail.onWaitlist": "You're on the waitlist",
  "classDetail.joining": "Joining…",
  "classDetail.joinWaitlist": "Join the waitlist",
  "classDetail.loginToWaitlist": "Log in with LINE to join the waitlist",
  "classDetail.whosComing": "Who's coming",
  "classDetail.noAttendees": "No one has booked yet — be the first!",
  "classDetail.loginToSeeAttendees": "Log in to see who's already booked in.",

  "myBookings.title": "My Bookings",
  "myBookings.waitlist": "Waitlist",
  "myBookings.spotOpened": "A spot opened — claim it before it expires!",
  "myBookings.waiting": "Waiting for a spot",
  "myBookings.claim": "Claim",
  "myBookings.leave": "Leave",
  "myBookings.empty": "No bookings yet — go book a class!",
  "myBookings.cancel": "Cancel",
  "bookingStatus.confirmed": "Confirmed",
  "bookingStatus.attended": "Attended",
  "bookingStatus.no_show": "No-show",
  "bookingStatus.cancelled_by_member": "Cancelled",
  "bookingStatus.late_cancelled": "Late cancellation",
  "bookingStatus.cancelled_by_studio": "Cancelled by studio",

  "packages.title": "Packages",
  "packages.available": "Packages available",
  "packages.yourPackage": "Your package",
  "packages.unlimitedClasses": "Unlimited classes",
  "packages.classesLeft": "{{used}} of {{total}} classes left",
  "packages.expires": "expires {{date}}",
  "packages.extend": "Extend +1mo",
  "packages.otherPackages": "Other packages",
  "packages.activate": "Activate",
  "packages.birthdayCoupons": "Birthday coupons",
  "packages.couponReady": "Ready to use",
  "packages.couponUsed": "Used",
  "packages.couponExpired": "Expired",
  "packages.buyAPackage": "Buy a package",
  "packages.sharedPool": "Shared credit pool",
  "packages.signedUp": "You're signed up",
  "packages.fullNamePlaceholder": "Full name",
  "packages.phonePlaceholder": "Phone number",
  "packages.confirmTrial": "Confirm trial purchase",
  "packages.buy": "Buy",
  "packages.starting": "Starting…",
  "packages.unlimitedShort": "Unlimited classes",
  "packages.classCount_one": "{{n}} class",
  "packages.classCount_other": "{{n}} classes",
  "packages.period_one": "{{n}} {{unit}}",
  "packages.period_other": "{{n}} {{unit}}s",
  "unit.month": "month",
  "unit.day": "day",
  "packageStatus.pending_payment": "Awaiting payment",
  "packageStatus.paid_not_activated": "Paid — not yet activated",
  "packageStatus.active": "Active",
  "packageStatus.expired": "Expired",
  "packageStatus.combined": "Combined into renewal",
  "packageStatus.cancelled": "Cancelled",

  "checkout.paymentReceived": "Payment received! 🎉",
  "checkout.backToPackages": "Back to my packages",
  "checkout.browseClasses": "Browse classes",
  "checkout.terminal": "This purchase was cancelled or expired.",
  "checkout.title": "Checkout",
  "checkout.scanInstructions": "Scan with your banking app and transfer exactly {{amount}}.",
  "checkout.thanks": "Thanks — we've let the studio know. Your package will activate as soon as they confirm the payment. This page will update automatically.",
  "checkout.ivePaid": "I've paid",
  "checkout.notifying": "Letting the studio know…",
  "checkout.renewalDescription": "Package extension (+1 month)",
};

const th: Dict = {
  "nav.schedule": "ตารางเรียน",
  "nav.myBookings": "การจองของฉัน",
  "nav.packages": "แพ็กเกจ",
  "nav.admin": "ผู้ดูแลระบบ",
  "nav.logout": "ออกจากระบบ",
  "nav.loginWithLine": "เข้าสู่ระบบด้วย LINE",
  "footer.privacy": "นโยบายความเป็นส่วนตัว",
  "lang.toggleTo": "EN",

  "loginPrompt.prefix": "เข้าสู่ระบบด้วย LINE เพื่อดู{{label}}",
  "loginPrompt.bookingsLabel": "การจองของคุณ",
  "loginPrompt.packagesLabel": "แพ็กเกจของคุณ",

  "schedule.title": "คลาสที่กำลังจะมาถึง",
  "schedule.loading": "กำลังโหลดคลาส…",
  "schedule.empty": "ยังไม่มีคลาสที่กำลังจะมาถึง",
  "schedule.hi": "สวัสดี {{name}},",
  "schedule.nextClass": "คลาสถัดไป: {{className}} — {{when}}",
  "schedule.noUpcomingBooked": "ยังไม่มีคลาสที่จองไว้",
  "schedule.managePackages": "จัดการแพ็กเกจ",
  "schedule.prevDay": "วันก่อนหน้า",
  "schedule.nextDay": "วันถัดไป",
  "schedule.started": "เริ่มแล้ว",
  "schedule.spotsLeft": "เหลือ {{n}} ที่นั่ง",
  "schedule.full": "เต็ม — เข้าคิวรอ",
  "schedule.cancel": "ยกเลิก",
  "schedule.cancelReasonTitle": "เหตุผลในการยกเลิก (ไม่บังคับ)",
  "schedule.cancelReasonPlaceholder": "เหตุผล",
  "schedule.cancelSubmit": "ยกเลิกคลาส",
  "status.scheduled": "เปิดรับ",
  "status.confirmed": "ยืนยันแล้ว",
  "status.full": "เต็ม",
  "status.cancelled_by_studio": "ยกเลิกแล้ว",
  "status.completed": "จบแล้ว",

  "classDetail.loading": "กำลังโหลด…",
  "classDetail.minutes": "{{n}} นาที",
  "classDetail.with": "กับ {{name}}",
  "classDetail.cancelled": "สตูดิโอยกเลิกคลาสนี้",
  "classDetail.cancelledReason": "สตูดิโอยกเลิกคลาสนี้: {{reason}}",
  "classDetail.full": "คลาสนี้เต็มแล้ว",
  "classDetail.spotsLeft": "เหลือ {{n}} ที่นั่ง",
  "classDetail.noPackage": "คุณไม่มีแพ็กเกจที่มีเครดิตเหลืออยู่",
  "classDetail.buyPackage": "ซื้อแพ็กเกจ",
  "classDetail.toBook": "เพื่อจองคลาสนี้",
  "classDetail.usePackage": "ใช้แพ็กเกจ",
  "classDetail.creditsLeft": "เหลือ {{n}}",
  "classDetail.unlimited": "ไม่จำกัด",
  "classDetail.expires": "หมดอายุ {{date}}",
  "classDetail.booking": "กำลังจอง…",
  "classDetail.book": "จองคลาสนี้",
  "classDetail.loginToBook": "เข้าสู่ระบบด้วย LINE เพื่อจอง",
  "classDetail.onWaitlist": "คุณอยู่ในรายชื่อรอ",
  "classDetail.joining": "กำลังเข้าคิว…",
  "classDetail.joinWaitlist": "เข้าคิวรอ",
  "classDetail.loginToWaitlist": "เข้าสู่ระบบด้วย LINE เพื่อเข้าคิวรอ",
  "classDetail.whosComing": "ใครจะมาบ้าง",
  "classDetail.noAttendees": "ยังไม่มีใครจอง — เป็นคนแรกเลย!",
  "classDetail.loginToSeeAttendees": "เข้าสู่ระบบเพื่อดูว่าใครจองไว้แล้วบ้าง",

  "myBookings.title": "การจองของฉัน",
  "myBookings.waitlist": "รายชื่อรอ",
  "myBookings.spotOpened": "มีที่ว่างแล้ว — รีบจองก่อนหมดเวลา!",
  "myBookings.waiting": "กำลังรอที่ว่าง",
  "myBookings.claim": "จองที่ว่าง",
  "myBookings.leave": "ออกจากรายชื่อรอ",
  "myBookings.empty": "ยังไม่มีการจอง — ไปจองคลาสกันเลย!",
  "myBookings.cancel": "ยกเลิก",
  "bookingStatus.confirmed": "ยืนยันแล้ว",
  "bookingStatus.attended": "เข้าร่วมแล้ว",
  "bookingStatus.no_show": "ไม่มาตามนัด",
  "bookingStatus.cancelled_by_member": "ยกเลิกแล้ว",
  "bookingStatus.late_cancelled": "ยกเลิกกระชั้นชิด",
  "bookingStatus.cancelled_by_studio": "สตูดิโอยกเลิก",

  "packages.title": "แพ็กเกจ",
  "packages.available": "แพ็กเกจที่มีให้เลือก",
  "packages.yourPackage": "แพ็กเกจของคุณ",
  "packages.unlimitedClasses": "เรียนได้ไม่จำกัด",
  "packages.classesLeft": "เหลือ {{used}} จาก {{total}} คลาส",
  "packages.expires": "หมดอายุ {{date}}",
  "packages.extend": "ต่ออายุ +1 เดือน",
  "packages.otherPackages": "แพ็กเกจอื่นๆ",
  "packages.activate": "เปิดใช้งาน",
  "packages.birthdayCoupons": "คูปองวันเกิด",
  "packages.couponReady": "พร้อมใช้งาน",
  "packages.couponUsed": "ใช้แล้ว",
  "packages.couponExpired": "หมดอายุแล้ว",
  "packages.buyAPackage": "ซื้อแพ็กเกจ",
  "packages.sharedPool": "เครดิตแบบแชร์",
  "packages.signedUp": "คุณสมัครแล้ว",
  "packages.fullNamePlaceholder": "ชื่อ-นามสกุล",
  "packages.phonePlaceholder": "เบอร์โทรศัพท์",
  "packages.confirmTrial": "ยืนยันการซื้อคลาสทดลอง",
  "packages.buy": "ซื้อ",
  "packages.starting": "กำลังเริ่ม…",
  "packages.unlimitedShort": "เรียนได้ไม่จำกัด",
  "packages.classCount_one": "{{n}} คลาส",
  "packages.classCount_other": "{{n}} คลาส",
  "packages.period_one": "{{n}} {{unit}}",
  "packages.period_other": "{{n}} {{unit}}",
  "unit.month": "เดือน",
  "unit.day": "วัน",
  "packageStatus.pending_payment": "รอการชำระเงิน",
  "packageStatus.paid_not_activated": "ชำระแล้ว — ยังไม่เปิดใช้งาน",
  "packageStatus.active": "ใช้งานอยู่",
  "packageStatus.expired": "หมดอายุ",
  "packageStatus.combined": "รวมเข้ากับแพ็กเกจใหม่แล้ว",
  "packageStatus.cancelled": "ยกเลิกแล้ว",

  "checkout.paymentReceived": "ได้รับการชำระเงินแล้ว! 🎉",
  "checkout.backToPackages": "กลับไปที่แพ็กเกจของฉัน",
  "checkout.browseClasses": "ดูคลาสทั้งหมด",
  "checkout.terminal": "การซื้อนี้ถูกยกเลิกหรือหมดอายุแล้ว",
  "checkout.title": "ชำระเงิน",
  "checkout.scanInstructions": "สแกนด้วยแอปธนาคารของคุณและโอนเงินจำนวน {{amount}} ให้ตรงเป๊ะ",
  "checkout.thanks": "ขอบคุณค่ะ — เราแจ้งให้ทางสตูดิโอทราบแล้ว แพ็กเกจของคุณจะเปิดใช้งานทันทีที่ยืนยันการชำระเงิน หน้านี้จะอัปเดตให้อัตโนมัติ",
  "checkout.ivePaid": "ฉันชำระเงินแล้ว",
  "checkout.notifying": "กำลังแจ้งสตูดิโอ…",
  "checkout.renewalDescription": "ต่ออายุแพ็กเกจ (+1 เดือน)",
};

const dicts: Record<Lang, Dict> = { en, th };

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

interface LanguageState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageState | null>(null);

function detectInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "th") return stored;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall through to default
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore write failures — the toggle still works for the rest of the session
    }
  }, [lang]);

  const value = useMemo<LanguageState>(
    () => ({
      lang,
      setLang: setLangState,
      t: (key, vars) => interpolate(dicts[lang][key] ?? dicts.en[key] ?? key, vars),
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
