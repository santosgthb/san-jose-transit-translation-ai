import { submissionLanguages } from "@workspace/db/schema";

export const prototypeResponses: Record<(typeof submissionLanguages)[number], string> = {
  vi: "Cảm ơn bạn đã giúp chúng tôi cải thiện dịch vụ. Nhân viên VTA sẽ xem xét vấn đề này và chuyển đến nhóm phù hợp.",
  en: "Thank you for helping us improve transit service. A VTA staff member will review this issue and route it to the right team.",
  es: "Gracias por ayudarnos a mejorar el servicio de transporte. Un miembro del personal de VTA revisará este problema y lo enviará al equipo adecuado.",
  pa: "ਆਵਾਜਾਈ ਸੇਵਾ ਨੂੰ ਬਿਹਤਰ ਬਣਾਉਣ ਵਿੱਚ ਮਦਦ ਕਰਨ ਲਈ ਧੰਨਵਾਦ। VTA ਦਾ ਇੱਕ ਕਰਮਚਾਰੀ ਇਸ ਸਮੱਸਿਆ ਦੀ ਸਮੀਖਿਆ ਕਰੇਗਾ ਅਤੇ ਇਸਨੂੰ ਸਹੀ ਟੀਮ ਤੱਕ ਪਹੁੰਚਾਏਗਾ।",
};