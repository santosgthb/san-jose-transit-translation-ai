import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter';
import { getGetAccessStatusQueryKey, getGetTransitMatchesQueryKey, getListSubmissionsQueryKey, useCreateSubmission, useClassifyTransitInput, useGetAccessStatus, useGetTransitMatches, useLogoutAccess, useUnlockAccess } from '@workspace/api-client-react';
import type { RiderSubmission } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import RecordsPage from '@/pages/records';
import TransitQuestion from '@/components/TransitQuestion';
import TransitDetails from '@/components/TransitDetails';
import {
  AlertCircle,
  ArrowLeft,
  BusFront,
  Check,
  ImagePlus,
  Languages,
  Loader2,
  LogOut,
  MapPin,
  Mic,
  Paperclip,
  Send,
  ShieldCheck,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';

export type Language = 'vi' | 'en' | 'es' | 'pa';
type AccessRole = 'reporter' | 'reviewer' | 'classroom';

const queryClient = new QueryClient();

const languageNames: Record<Language, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  es: 'Español',
  pa: 'ਪੰਜਾਬੀ',
};

const voiceLocales: Record<Language, string> = {
  vi: 'vi-VN',
  en: 'en-US',
  es: 'es-US',
  pa: 'pa-IN',
};

type ImageAttachment = {
  name: string;
  dataUrl: string;
};

type VoiceResult = {
  isFinal: boolean;
  0?: { transcript: string };
};

type VoiceResultEvent = {
  resultIndex: number;
  results: ArrayLike<VoiceResult>;
};

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: VoiceResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type VoiceRecognitionConstructor = new () => VoiceRecognition;
type VoiceWindow = Window & {
  SpeechRecognition?: VoiceRecognitionConstructor;
  webkitSpeechRecognition?: VoiceRecognitionConstructor;
};

const copy = {
  vi: {
    brandSubtitle: 'Hỗ trợ hành khách',
    projectNotice: 'Dự án lớp học. Không dùng để gửi báo cáo giao thông thực tế.',
    languageLabel: 'Chọn ngôn ngữ',
    pagesLabel: 'Các trang',
    reportNav: 'Báo cáo vấn đề',
    recordsNav: 'Các báo cáo đã lưu',
    changeAccess: 'Đổi mã truy cập',
    viewRecords: 'Xem các báo cáo đã lưu',
    submittedLabel: 'Thời điểm gửi',
    submitError: 'Không thể lưu báo cáo. Vui lòng thử lại.',
    eyebrow: 'HỖ TRỢ HÀNH KHÁCH VTA',
    title: 'Báo cáo vấn đề giao thông VTA',
    instruction: 'Hãy mô tả vấn đề bạn gặp phải khi sử dụng phương tiện giao thông công cộng.',
    privacy: 'Các báo cáo đã lưu cần mã truy cập riêng để xem.',
    stepOne: 'Bước 1 / 2',
    describeHeading: 'Điều gì đã xảy ra?',
    describeLabel: 'Mô tả vấn đề',
    describeHint: 'Bạn có thể viết hoặc nói bằng tiếng Việt, tiếng Anh, tiếng Tây Ban Nha hoặc tiếng Punjabi',
    placeholder: 'Ví dụ: Xe buýt của tôi bị trễ…',
    voiceLabel: 'Nói',
    voiceStart: 'Nhấn để nói bằng tiếng Việt',
    voiceStop: 'Đang lắng nghe — nhấn để dừng',
    voiceUnavailable: 'Trình duyệt này không hỗ trợ nhập bằng giọng nói. Bạn có thể nhập bằng bàn phím.',
    voiceError: 'Không thể nghe rõ. Vui lòng kiểm tra quyền sử dụng micrô và thử lại.',
    voiceTranscript: 'Nội dung đang nhận dạng',
    imageHeading: 'Thêm hình ảnh (không bắt buộc)',
    imageDescription: 'Hình ảnh có thể giúp VTA hiểu rõ hơn về vấn đề.',
    chooseImage: 'Chọn một hình ảnh',
    imageHint: 'Trạm xe hư hỏng, biển báo bị thiếu, lối đi bị chặn…',
    removeImage: 'Xóa hình ảnh',
    selectedImage: 'Hình ảnh đã chọn',
    send: 'Gửi báo cáo',
    sending: 'Đang gửi báo cáo…',
    sendHint: 'Lưu trong bản thử nghiệm; chưa thực sự gửi đến VTA.',
    requiredError: 'Vui lòng mô tả vấn đề hoặc thêm một hình ảnh trước khi gửi.',
    imageError: 'Vui lòng chọn một tệp hình ảnh.',
    secureNote: 'Không tải hình ảnh lên dịch vụ bên ngoài. Hình ảnh chỉ được giữ trong trình duyệt cho bản thử nghiệm này.',
    stepTwo: 'Bước 2 / 2',
    successEyebrow: 'ĐÃ TIẾP NHẬN BÁO CÁO',
    successTitle: 'Cảm ơn bạn đã lên tiếng.',
    successBody: 'Báo cáo của bạn đã được lưu trong bản thử nghiệm, chưa thực sự gửi đến VTA.',
    responseHeading: 'Phản hồi mẫu',
    responseNoteAi: 'Phản hồi này được tạo bằng AI và có thể chưa chính xác.',
    responseNoteContext: 'Phản hồi này chỉ dựa trên ngữ cảnh dữ liệu giao thông; không phải hướng dẫn chính thức.',
    responseNoteLegacy: 'Đây là phản hồi cố định cũ, không phải nội dung do AI tạo.',
    reportHeading: 'Báo cáo đã tạo',
    reportContent: 'Nội dung báo cáo',
    reportImage: 'Có hình ảnh đính kèm',
    reportNoImage: 'Không có hình ảnh đính kèm',
    reportReference: 'Mã báo cáo',
    referenceHint: 'Dùng mã này nếu bạn cần hỏi về báo cáo.',
    newReport: 'Tạo báo cáo mới',
    safety: 'Nếu bạn đang gặp nguy hiểm ngay lập tức, hãy gọi 911.',
    readAloud: 'Đọc phản hồi',
    footer: 'Hỗ trợ giao thông VTA · San José',
    issueCategory: 'Loại vấn đề',
    categories: { delay: 'Trễ chuyến', cleanliness: 'Vệ sinh', safety: 'An toàn', accessibility: 'Khả năng tiếp cận', staff: 'Nhân viên', vehicle: 'Phương tiện', other: 'Khác' },
    routeLabel: 'Tuyến (không bắt buộc)',
    stopLabel: 'Điểm dừng (không bắt buộc)',
    findMatches: 'Tìm tuyến / điểm dừng',
    findMatchesLoading: 'Đang tìm…',
    routeCandidate: 'Chọn tuyến khớp',
    stopCandidate: 'Chọn điểm dừng khớp',
    unmatched: 'Việc đối chiếu tuyến / điểm dừng là tùy chọn. Nếu không chọn kết quả, thông tin đã nhập có thể chưa được đối chiếu.',
    matchError: 'Không thể tra cứu tuyến / điểm dừng ngay bây giờ. Bạn vẫn có thể gửi báo cáo chưa đối chiếu.',
    imageAiNote: 'Hình ảnh chỉ lưu trong trình duyệt và không được AI phân tích.',
  },
  en: {
    brandSubtitle: 'Rider support',
    projectNotice: 'Class project only. Not for real transit reporting.',
    languageLabel: 'Choose language',
    pagesLabel: 'Pages',
    reportNav: 'Report an issue',
    recordsNav: 'Saved reports',
    changeAccess: 'Switch access',
    viewRecords: 'View saved reports',
    submittedLabel: 'Submitted',
    submitError: 'We could not save your report. Please try again.',
    eyebrow: 'VTA RIDER SUPPORT',
    title: 'Report a VTA Transit Issue',
    instruction: 'Describe the problem you experienced while using public transportation.',
    privacy: 'Saved reports require a separate access code to view.',
    stepOne: 'Step 1 / 2',
    describeHeading: 'What happened?',
    describeLabel: 'Describe the problem',
    describeHint: 'You can write or speak in Vietnamese, English, Spanish, or Punjabi',
    placeholder: 'For example: My bus was late…',
    voiceLabel: 'Speak',
    voiceStart: 'Tap to speak in English',
    voiceStop: 'Listening — tap to stop',
    voiceUnavailable: 'Voice input is not supported in this browser. You can type your report instead.',
    voiceError: 'We could not hear that. Please check microphone access and try again.',
    voiceTranscript: 'Live transcript',
    imageHeading: 'Add an image (optional)',
    imageDescription: 'An image can help VTA understand the problem more clearly.',
    chooseImage: 'Choose one image',
    imageHint: 'A damaged stop, missing sign, blocked ramp…',
    removeImage: 'Remove image',
    selectedImage: 'Selected image',
    send: 'Send report',
    sending: 'Sending report…',
    sendHint: 'Saved in this prototype; not actually sent to VTA.',
    requiredError: 'Please describe the problem or add an image before sending.',
    imageError: 'Please choose an image file.',
    secureNote: 'Images are not uploaded to an external service. They stay in this browser for this prototype.',
    stepTwo: 'Step 2 / 2',
    successEyebrow: 'REPORT RECEIVED',
    successTitle: 'Thank you for speaking up.',
    successBody: 'Your report was saved in this prototype, but it was not actually sent to VTA.',
    responseHeading: 'Prototype response',
    responseNoteAi: 'This response was generated by AI and may be inaccurate.',
    responseNoteContext: 'This response is based on transit data context only; it is not official guidance.',
    responseNoteLegacy: 'This is a legacy fixed response, not AI-generated.',
    reportHeading: 'Report created',
    reportContent: 'Report description',
    reportImage: 'Image attached',
    reportNoImage: 'No image attached',
    reportReference: 'Report number',
    referenceHint: 'Use this number if you need to ask about your report.',
    newReport: 'Create a new report',
    safety: 'If you are in immediate danger, call 911.',
    readAloud: 'Read response aloud',
    footer: 'VTA Transit Support · San José',
    issueCategory: 'Issue category',
    categories: { delay: 'Delay', cleanliness: 'Cleanliness', safety: 'Safety', accessibility: 'Accessibility', staff: 'Staff', vehicle: 'Vehicle', other: 'Other' },
    routeLabel: 'Route (optional)',
    stopLabel: 'Stop (optional)',
    findMatches: 'Find route / stop',
    findMatchesLoading: 'Searching…',
    routeCandidate: 'Select matching route',
    stopCandidate: 'Select matching stop',
    unmatched: 'Route / stop matching is optional. If you do not select a candidate, the entered details may remain unmatched.',
    matchError: 'Route / stop lookup is unavailable right now. You can still submit without a match.',
    imageAiNote: 'Images stay in this browser and are not analyzed by AI.',
  },
  es: {
    brandSubtitle: 'Atención al pasajero',
    projectNotice: 'Solo para un proyecto de clase. No se debe usar para reportes reales de transporte.',
    languageLabel: 'Elegir idioma',
    pagesLabel: 'Páginas',
    reportNav: 'Reportar un problema',
    recordsNav: 'Reportes guardados',
    changeAccess: 'Cambiar acceso',
    viewRecords: 'Ver reportes guardados',
    submittedLabel: 'Fecha de envío',
    submitError: 'No pudimos guardar su reporte. Inténtelo de nuevo.',
    eyebrow: 'ATENCIÓN A PASAJEROS DE VTA',
    title: 'Reportar un problema de transporte de VTA',
    instruction: 'Describa el problema que tuvo al usar el transporte público.',
    privacy: 'Se necesita un código de acceso separado para ver los reportes guardados.',
    stepOne: 'Paso 1 / 2',
    describeHeading: '¿Qué ocurrió?',
    describeLabel: 'Describa el problema',
    describeHint: 'Puede escribir o hablar en vietnamita, inglés, español o panyabí',
    placeholder: 'Por ejemplo: Mi autobús llegó tarde…',
    voiceLabel: 'Hablar',
    voiceStart: 'Toque para hablar en español',
    voiceStop: 'Escuchando — toque para detener',
    voiceUnavailable: 'Este navegador no admite la entrada por voz. Puede escribir su reporte.',
    voiceError: 'No pudimos escucharle. Revise el acceso al micrófono e inténtelo de nuevo.',
    voiceTranscript: 'Transcripción en vivo',
    imageHeading: 'Agregar una imagen (opcional)',
    imageDescription: 'Una imagen puede ayudar a VTA a entender mejor el problema.',
    chooseImage: 'Elegir una imagen',
    imageHint: 'Una parada dañada, un letrero faltante, una rampa bloqueada…',
    removeImage: 'Quitar imagen',
    selectedImage: 'Imagen seleccionada',
    send: 'Enviar reporte',
    sending: 'Enviando reporte…',
    sendHint: 'Se guarda en este prototipo; no se envía realmente a VTA.',
    requiredError: 'Describa el problema o agregue una imagen antes de enviar.',
    imageError: 'Elija un archivo de imagen.',
    secureNote: 'Las imágenes no se cargan a un servicio externo. Permanecen en este navegador para este prototipo.',
    stepTwo: 'Paso 2 / 2',
    successEyebrow: 'REPORTE RECIBIDO',
    successTitle: 'Gracias por informarnos.',
    successBody: 'Su reporte se guardó en este prototipo, pero no se envió realmente a VTA.',
    responseHeading: 'Respuesta de ejemplo',
    responseNoteAi: 'Esta respuesta fue generada por IA y podría ser inexacta.',
    responseNoteContext: 'Esta respuesta solo usa contexto de datos de transporte; no es orientación oficial.',
    responseNoteLegacy: 'Esta es una respuesta fija anterior, no generada por IA.',
    reportHeading: 'Reporte creado',
    reportContent: 'Descripción del reporte',
    reportImage: 'Imagen adjunta',
    reportNoImage: 'No hay ninguna imagen adjunta',
    reportReference: 'Número de reporte',
    referenceHint: 'Use este número si necesita consultar sobre su reporte.',
    newReport: 'Crear otro reporte',
    safety: 'Si está en peligro inmediato, llame al 911.',
    readAloud: 'Leer respuesta en voz alta',
    footer: 'Atención de transporte de VTA · San José',
    issueCategory: 'Tipo de problema',
    categories: { delay: 'Retraso', cleanliness: 'Limpieza', safety: 'Seguridad', accessibility: 'Accesibilidad', staff: 'Personal', vehicle: 'Vehículo', other: 'Otro' },
    routeLabel: 'Ruta (opcional)',
    stopLabel: 'Parada (opcional)',
    findMatches: 'Buscar ruta / parada',
    findMatchesLoading: 'Buscando…',
    routeCandidate: 'Elegir ruta coincidente',
    stopCandidate: 'Elegir parada coincidente',
    unmatched: 'La asociación de ruta / parada es opcional. Si no elige un resultado, los datos ingresados podrían quedar sin asociar.',
    matchError: 'La búsqueda de ruta / parada no está disponible. Puede enviar el reporte sin coincidencia.',
    imageAiNote: 'Las imágenes permanecen en este navegador y la IA no las analiza.',
  },
  pa: {
    brandSubtitle: 'ਯਾਤਰੀ ਸਹਾਇਤਾ',
    projectNotice: 'ਸਿਰਫ਼ ਕਲਾਸ ਪ੍ਰੋਜੈਕਟ। ਅਸਲ ਆਵਾਜਾਈ ਰਿਪੋਰਟਾਂ ਲਈ ਨਹੀਂ।',
    languageLabel: 'ਭਾਸ਼ਾ ਚੁਣੋ',
    pagesLabel: 'ਪੰਨੇ',
    reportNav: 'ਸਮੱਸਿਆ ਦੀ ਰਿਪੋਰਟ ਕਰੋ',
    recordsNav: 'ਸੰਭਾਲੀਆਂ ਰਿਪੋਰਟਾਂ',
    changeAccess: 'ਐਕਸੈੱਸ ਬਦਲੋ',
    viewRecords: 'ਸੰਭਾਲੀਆਂ ਰਿਪੋਰਟਾਂ ਵੇਖੋ',
    submittedLabel: 'ਭੇਜਣ ਦਾ ਸਮਾਂ',
    submitError: 'ਤੁਹਾਡੀ ਰਿਪੋਰਟ ਸੰਭਾਲੀ ਨਹੀਂ ਜਾ ਸਕੀ। ਕਿਰਪਾ ਕਰਕੇ ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
    eyebrow: 'VTA ਯਾਤਰੀ ਸਹਾਇਤਾ',
    title: 'VTA ਆਵਾਜਾਈ ਸਮੱਸਿਆ ਦੀ ਰਿਪੋਰਟ ਕਰੋ',
    instruction: 'ਜਨਤਕ ਆਵਾਜਾਈ ਦੀ ਵਰਤੋਂ ਕਰਦੇ ਸਮੇਂ ਤੁਹਾਨੂੰ ਆਈ ਸਮੱਸਿਆ ਬਾਰੇ ਦੱਸੋ।',
    privacy: 'ਸੰਭਾਲੀਆਂ ਰਿਪੋਰਟਾਂ ਦੇਖਣ ਲਈ ਵੱਖਰਾ ਐਕਸੈੱਸ ਕੋਡ ਲੋੜੀਂਦਾ ਹੈ।',
    stepOne: 'ਕਦਮ 1 / 2',
    describeHeading: 'ਕੀ ਹੋਇਆ ਸੀ?',
    describeLabel: 'ਸਮੱਸਿਆ ਬਾਰੇ ਦੱਸੋ',
    describeHint: 'ਤੁਸੀਂ ਪੰਜਾਬੀ, ਅੰਗਰੇਜ਼ੀ, ਸਪੇਨੀ ਜਾਂ ਵੀਅਤਨਾਮੀ ਵਿੱਚ ਲਿਖ ਜਾਂ ਬੋਲ ਸਕਦੇ ਹੋ',
    placeholder: 'ਉਦਾਹਰਨ ਲਈ: ਮੇਰੀ ਬੱਸ ਦੇਰ ਨਾਲ ਆਈ…',
    voiceLabel: 'ਬੋਲੋ',
    voiceStart: 'ਪੰਜਾਬੀ ਵਿੱਚ ਬੋਲਣ ਲਈ ਟੈਪ ਕਰੋ',
    voiceStop: 'ਸੁਣ ਰਿਹਾ ਹੈ — ਰੋਕਣ ਲਈ ਟੈਪ ਕਰੋ',
    voiceUnavailable: 'ਇਹ ਬ੍ਰਾਊਜ਼ਰ ਆਵਾਜ਼ ਰਾਹੀਂ ਇਨਪੁੱਟ ਦਾ ਸਮਰਥਨ ਨਹੀਂ ਕਰਦਾ। ਤੁਸੀਂ ਆਪਣੀ ਰਿਪੋਰਟ ਟਾਈਪ ਕਰ ਸਕਦੇ ਹੋ।',
    voiceError: 'ਅਸੀਂ ਤੁਹਾਡੀ ਆਵਾਜ਼ ਨਹੀਂ ਸੁਣ ਸਕੇ। ਮਾਈਕ੍ਰੋਫ਼ੋਨ ਦੀ ਇਜਾਜ਼ਤ ਜਾਂਚੋ ਅਤੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
    voiceTranscript: 'ਲਾਈਵ ਲਿਖਤ',
    imageHeading: 'ਤਸਵੀਰ ਸ਼ਾਮਲ ਕਰੋ (ਵਿਕਲਪਿਕ)',
    imageDescription: 'ਤਸਵੀਰ VTA ਨੂੰ ਸਮੱਸਿਆ ਸਮਝਣ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਦੀ ਹੈ।',
    chooseImage: 'ਇੱਕ ਤਸਵੀਰ ਚੁਣੋ',
    imageHint: 'ਖਰਾਬ ਬੱਸ ਸਟਾਪ, ਗੁੰਮ ਨਿਸ਼ਾਨ, ਰੁਕਿਆ ਹੋਇਆ ਰੈਂਪ…',
    removeImage: 'ਤਸਵੀਰ ਹਟਾਓ',
    selectedImage: 'ਚੁਣੀ ਹੋਈ ਤਸਵੀਰ',
    send: 'ਰਿਪੋਰਟ ਭੇਜੋ',
    sending: 'ਰਿਪੋਰਟ ਭੇਜੀ ਜਾ ਰਹੀ ਹੈ…',
    sendHint: 'ਇਸ ਨਮੂਨਾ ਐਪ ਵਿੱਚ ਸੰਭਾਲੀ ਜਾਵੇਗੀ; ਅਸਲ ਵਿੱਚ VTA ਨੂੰ ਨਹੀਂ ਭੇਜੀ ਜਾਵੇਗੀ।',
    requiredError: 'ਭੇਜਣ ਤੋਂ ਪਹਿਲਾਂ ਸਮੱਸਿਆ ਬਾਰੇ ਦੱਸੋ ਜਾਂ ਤਸਵੀਰ ਸ਼ਾਮਲ ਕਰੋ।',
    imageError: 'ਕਿਰਪਾ ਕਰਕੇ ਤਸਵੀਰ ਵਾਲੀ ਫ਼ਾਈਲ ਚੁਣੋ।',
    secureNote: 'ਤਸਵੀਰਾਂ ਕਿਸੇ ਬਾਹਰੀ ਸੇਵਾ ਤੇ ਅੱਪਲੋਡ ਨਹੀਂ ਹੁੰਦੀਆਂ। ਇਸ ਪ੍ਰੋਟੋਟਾਈਪ ਲਈ ਇਹ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਹੀ ਰਹਿੰਦੀਆਂ ਹਨ।',
    stepTwo: 'ਕਦਮ 2 / 2',
    successEyebrow: 'ਰਿਪੋਰਟ ਮਿਲ ਗਈ',
    successTitle: 'ਦੱਸਣ ਲਈ ਤੁਹਾਡਾ ਧੰਨਵਾਦ।',
    successBody: 'ਤੁਹਾਡੀ ਰਿਪੋਰਟ ਇਸ ਨਮੂਨਾ ਐਪ ਵਿੱਚ ਸੰਭਾਲੀ ਗਈ ਹੈ, ਪਰ ਅਸਲ ਵਿੱਚ VTA ਨੂੰ ਨਹੀਂ ਭੇਜੀ ਗਈ।',
    responseHeading: 'ਨਮੂਨਾ ਜਵਾਬ',
    responseNoteAi: 'ਇਹ ਜਵਾਬ AI ਨੇ ਬਣਾਇਆ ਹੈ ਅਤੇ ਗਲਤ ਹੋ ਸਕਦਾ ਹੈ।',
    responseNoteContext: 'ਇਹ ਜਵਾਬ ਸਿਰਫ਼ ਟ੍ਰਾਂਜ਼ਿਟ ਡੇਟਾ ਦੇ ਸੰਦਰਭ ਤੇ ਆਧਾਰਿਤ ਹੈ; ਇਹ ਅਧਿਕਾਰਤ ਸਲਾਹ ਨਹੀਂ ਹੈ।',
    responseNoteLegacy: 'ਇਹ ਪੁਰਾਣਾ ਨਿਰਧਾਰਤ ਜਵਾਬ ਹੈ, AI ਵੱਲੋਂ ਨਹੀਂ ਬਣਾਇਆ ਗਿਆ।',
    reportHeading: 'ਰਿਪੋਰਟ ਬਣਾਈ ਗਈ',
    reportContent: 'ਰਿਪੋਰਟ ਦਾ ਵੇਰਵਾ',
    reportImage: 'ਤਸਵੀਰ ਨੱਥੀ ਹੈ',
    reportNoImage: 'ਕੋਈ ਤਸਵੀਰ ਨੱਥੀ ਨਹੀਂ',
    reportReference: 'ਰਿਪੋਰਟ ਨੰਬਰ',
    referenceHint: 'ਰਿਪੋਰਟ ਬਾਰੇ ਪੁੱਛਣ ਲਈ ਇਹ ਨੰਬਰ ਵਰਤੋ।',
    newReport: 'ਨਵੀਂ ਰਿਪੋਰਟ ਬਣਾਓ',
    safety: 'ਜੇ ਤੁਸੀਂ ਤੁਰੰਤ ਖ਼ਤਰੇ ਵਿੱਚ ਹੋ, ਤਾਂ 911 ਤੇ ਕਾਲ ਕਰੋ।',
    readAloud: 'ਜਵਾਬ ਉੱਚੀ ਆਵਾਜ਼ ਵਿੱਚ ਸੁਣੋ',
    footer: 'VTA ਆਵਾਜਾਈ ਸਹਾਇਤਾ · ਸੈਨ ਹੋਜ਼ੇ',
    issueCategory: 'ਸਮੱਸਿਆ ਦੀ ਕਿਸਮ',
    categories: { delay: 'ਦੇਰੀ', cleanliness: 'ਸਫ਼ਾਈ', safety: 'ਸੁਰੱਖਿਆ', accessibility: 'ਪਹੁੰਚਯੋਗਤਾ', staff: 'ਸਟਾਫ਼', vehicle: 'ਵਾਹਨ', other: 'ਹੋਰ' },
    routeLabel: 'ਰੂਟ (ਵਿਕਲਪਿਕ)',
    stopLabel: 'ਸਟਾਪ (ਵਿਕਲਪਿਕ)',
    findMatches: 'ਰੂਟ / ਸਟਾਪ ਲੱਭੋ',
    findMatchesLoading: 'ਲੱਭ ਰਿਹਾ ਹੈ…',
    routeCandidate: 'ਮਿਲਦਾ ਰੂਟ ਚੁਣੋ',
    stopCandidate: 'ਮਿਲਦਾ ਸਟਾਪ ਚੁਣੋ',
    unmatched: 'ਰੂਟ / ਸਟਾਪ ਦਾ ਮਿਲਾਣ ਵਿਕਲਪਿਕ ਹੈ। ਜੇ ਤੁਸੀਂ ਨਤੀਜਾ ਨਹੀਂ ਚੁਣਦੇ, ਤਾਂ ਦਿੱਤੀ ਜਾਣਕਾਰੀ ਬਿਨਾਂ ਮਿਲਾਣ ਰਹਿ ਸਕਦੀ ਹੈ।',
    matchError: 'ਰੂਟ / ਸਟਾਪ ਖੋਜ ਇਸ ਵੇਲੇ ਉਪਲਬਧ ਨਹੀਂ। ਤੁਸੀਂ ਬਿਨਾਂ ਮਿਲਾਣ ਰਿਪੋਰਟ ਭੇਜ ਸਕਦੇ ਹੋ।',
    imageAiNote: 'ਤਸਵੀਰਾਂ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਰਹਿੰਦੀਆਂ ਹਨ ਅਤੇ AI ਵੱਲੋਂ ਵਿਸ਼ਲੇਸ਼ਿਤ ਨਹੀਂ ਹੁੰਦੀਆਂ।',
  },
} as const;

const accessCopy: Record<Language, {
  title: string;
  description: string;
  label: string;
  reporterMode: string;
  reviewerMode: string;
  reviewerUnavailable: string;
  classroomMode: string;
  classroomUnavailable: string;
  submit: string;
  checking: string;
  error: string;
  unavailable: string;
  retry: string;
}> = {
  vi: {
    title: 'Nhập mã truy cập',
    description: 'Chọn mã dành cho người gửi báo cáo, lớp học/kiểm thử hoặc người xem báo cáo đã lưu.',
    label: 'Mã truy cập gồm bốn chữ số',
    reporterMode: 'Gửi báo cáo vấn đề',
    reviewerMode: 'Xem báo cáo đã lưu',
    reviewerUnavailable: 'Mã xem báo cáo chưa được thiết lập.',
    classroomMode: 'Chế độ lớp học / kiểm thử',
    classroomUnavailable: 'Mã truy cập lớp học/kiểm thử chưa được thiết lập.',
    submit: 'Mở ứng dụng',
    checking: 'Đang kiểm tra quyền truy cập…',
    error: 'Mã không đúng hoặc đã vượt quá số lần thử. Vui lòng thử lại sau.',
    unavailable: 'Chưa thể kiểm tra mã truy cập. Hãy thử lại hoặc liên hệ người quản lý dự án.',
    retry: 'Thử lại',
  },
  en: {
    title: 'Enter the access code',
    description: 'Choose the code for submitting a report, classroom testing, or viewing saved reports.',
    label: 'Four-digit access code',
    reporterMode: 'Report an issue',
    reviewerMode: 'View saved reports',
    reviewerUnavailable: 'The saved-reports access code has not been configured.',
    classroomMode: 'Classroom / test mode',
    classroomUnavailable: 'The classroom/test access code has not been configured.',
    submit: 'Unlock app',
    checking: 'Checking access…',
    error: 'The code was not accepted or attempts are temporarily limited. Try again later.',
    unavailable: 'Access verification is unavailable. Try again or contact the project owner.',
    retry: 'Try again',
  },
  es: {
    title: 'Ingresa el código de acceso',
    description: 'Elige el código para enviar un reporte, usar el modo de clase/pruebas o ver los reportes guardados.',
    label: 'Código de acceso de cuatro dígitos',
    reporterMode: 'Reportar un problema',
    reviewerMode: 'Ver reportes guardados',
    reviewerUnavailable: 'El código para ver los reportes guardados no está configurado.',
    classroomMode: 'Modo de clase / pruebas',
    classroomUnavailable: 'No se configuró el código de acceso para el modo de clase/pruebas.',
    submit: 'Desbloquear',
    checking: 'Verificando acceso…',
    error: 'No se aceptó el código o los intentos están limitados temporalmente. Inténtalo más tarde.',
    unavailable: 'La verificación de acceso no está disponible. Inténtalo de nuevo o contacta a quien administra el proyecto.',
    retry: 'Intentar de nuevo',
  },
  pa: {
    title: 'ਐਕਸੈੱਸ ਕੋਡ ਦਾਖ਼ਲ ਕਰੋ',
    description: 'ਰਿਪੋਰਟ ਭੇਜਣ, ਕਲਾਸਰੂਮ/ਟੈਸਟ ਮੋਡ ਵਰਤਣ ਜਾਂ ਸੰਭਾਲੀਆਂ ਰਿਪੋਰਟਾਂ ਦੇਖਣ ਲਈ ਕੋਡ ਚੁਣੋ।',
    label: 'ਚਾਰ ਅੰਕਾਂ ਵਾਲਾ ਐਕਸੈੱਸ ਕੋਡ',
    reporterMode: 'ਸਮੱਸਿਆ ਦੀ ਰਿਪੋਰਟ ਕਰੋ',
    reviewerMode: 'ਸੰਭਾਲੀਆਂ ਰਿਪੋਰਟਾਂ ਵੇਖੋ',
    reviewerUnavailable: 'ਸੰਭਾਲੀਆਂ ਰਿਪੋਰਟਾਂ ਲਈ ਐਕਸੈੱਸ ਕੋਡ ਸੈੱਟ ਨਹੀਂ ਕੀਤਾ ਗਿਆ।',
    classroomMode: 'ਕਲਾਸਰੂਮ / ਟੈਸਟ ਮੋਡ',
    classroomUnavailable: 'ਕਲਾਸਰੂਮ/ਟੈਸਟ ਲਈ ਐਕਸੈੱਸ ਕੋਡ ਸੈੱਟ ਨਹੀਂ ਕੀਤਾ ਗਿਆ।',
    submit: 'ਐਪ ਖੋਲ੍ਹੋ',
    checking: 'ਐਕਸੈੱਸ ਦੀ ਜਾਂਚ ਹੋ ਰਹੀ ਹੈ…',
    error: 'ਕੋਡ ਸਵੀਕਾਰ ਨਹੀਂ ਹੋਇਆ ਜਾਂ ਕੋਸ਼ਿਸ਼ਾਂ ਅਸਥਾਈ ਤੌਰ ਤੇ ਸੀਮਿਤ ਹਨ। ਬਾਅਦ ਵਿੱਚ ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
    unavailable: 'ਐਕਸੈੱਸ ਦੀ ਜਾਂਚ ਉਪਲਬਧ ਨਹੀਂ ਹੈ। ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ ਜਾਂ ਪ੍ਰੋਜੈਕਟ ਮਾਲਕ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।',
    retry: 'ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ',
  },
};

function AccessGate({
  language,
  reviewerAvailable,
  classroomAvailable,
  unavailable = false,
  onUnlocked,
  onRetry,
}: {
  language: Language;
  reviewerAvailable: boolean;
  classroomAvailable: boolean;
  unavailable?: boolean;
  onUnlocked: (role: AccessRole) => void;
  onRetry: () => void;
}) {
  const t = accessCopy[language];
  const unlock = useUnlockAccess();
  const [passcode, setPasscode] = useState('');
  const [hasError, setHasError] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AccessRole>('reporter');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[0-9]{4}$/.test(passcode)) {
      setHasError(true);
      return;
    }

    setHasError(false);
    unlock.mutate(
      { data: { passcode, role: selectedRole } },
      {
        onSuccess: (result) => {
          setPasscode('');
          onUnlocked(result.role ?? selectedRole);
        },
        onError: () => {
          setPasscode('');
          setHasError(true);
        },
      },
    );
  };

  if (unavailable) {
    return (
      <section className="mx-auto max-w-md rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[0_14px_32px_hsl(216_61%_20%/.06)] sm:p-8" role="status" data-testid="access-unavailable">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
          <AlertCircle size={23} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.unavailable}</p>
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90"
        >
          <Loader2 size={17} />
          {t.retry}
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[0_14px_32px_hsl(216_61%_20%/.06)] sm:p-8" data-testid="access-gate">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
        <ShieldCheck size={23} />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
      <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.description}</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-3" role="group" aria-label={t.description}>
        {([
          ['reporter', t.reporterMode, true],
          ['reviewer', t.reviewerMode, reviewerAvailable],
          ['classroom', t.classroomMode, classroomAvailable],
        ] as const).map(([role, label, enabled]) => (
          <button
            key={role}
            type="button"
            onClick={() => {
              setSelectedRole(role);
              setPasscode('');
              setHasError(false);
            }}
            disabled={!enabled || unlock.isPending}
            aria-pressed={selectedRole === role}
            className={`focus-ring min-h-12 rounded-xl border px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selectedRole === role ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}
            data-testid={`button-access-role-${role}`}
          >
            {label}
          </button>
        ))}
      </div>
      {!reviewerAvailable && (
        <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]" role="status">
          {t.reviewerUnavailable}
        </p>
      )}
      {!classroomAvailable && (
        <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]" role="status">
          {t.classroomUnavailable}
        </p>
      )}
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <label htmlFor="app-access-code" className="block text-sm font-semibold">
          {t.label}
        </label>
        <input
          id="app-access-code"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          autoComplete="one-time-code"
          maxLength={4}
          value={passcode}
          onChange={(event) => {
            setPasscode(event.target.value.replace(/[^0-9]/g, '').slice(0, 4));
            setHasError(false);
          }}
          className="focus-ring min-h-14 w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-center font-mono text-2xl tracking-[.45em]"
          aria-invalid={hasError}
          aria-describedby={hasError ? 'app-access-error' : undefined}
          disabled={unlock.isPending}
        />
        {hasError && (
          <p id="app-access-error" className="text-sm font-medium text-[hsl(var(--destructive))]" role="alert">
            {t.error}
          </p>
        )}
        <button
          type="submit"
          disabled={unlock.isPending || passcode.length !== 4}
          className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {unlock.isPending ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
          {t.submit}
        </button>
      </form>
    </section>
  );
}

function Header({
  language,
  onLanguageChange,
  role,
  onChangeAccess,
  switchingAccess,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  role: AccessRole | null;
  onChangeAccess: () => void;
  switchingAccess: boolean;
}) {
  const t = copy[language];
  const [location] = useLocation();
  return (
    <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.92)]">
      <div className="mx-auto flex min-h-[68px] max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:min-h-[76px] sm:flex-nowrap sm:gap-4 sm:px-8 sm:py-4">
        <div className="flex items-center gap-3" data-testid="brand-vta">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[4px_4px_0_hsl(var(--accent))]">
            <BusFront size={24} strokeWidth={2.4} />
          </span>
          <div>
            <p className="text-base font-bold tracking-[-.03em]">VTA</p>
            <p className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">{t.brandSubtitle}</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2" aria-label={t.languageLabel} data-testid="language-switcher">
          <Languages size={16} className="mr-1 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          {(Object.keys(languageNames) as Language[]).filter((option) => option !== language).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onLanguageChange(option)}
              className="focus-ring inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 text-[10px] font-bold text-[hsl(var(--primary))] transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))] sm:px-3.5 sm:text-xs"
              aria-label={`Switch language to ${languageNames[option]}`}
              data-testid={`button-language-${option}`}
            >
              {languageNames[option]}
            </button>
          ))}
        </nav>
      </div>
      {role && (
        <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-1.5 px-4 pb-3 sm:gap-2 sm:px-8" aria-label={t.pagesLabel}>
          {role === 'reporter' && (
            <Link href="/" aria-current={location === '/' ? 'page' : undefined} className={`focus-ring inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 py-2.5 text-xs font-bold transition-colors sm:px-4 ${location === '/' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))]'}`} data-testid="link-report-page">{t.reportNav}</Link>
          )}
          {role === 'reviewer' && (
            <Link href="/records" aria-current={location === '/records' ? 'page' : undefined} className={`focus-ring inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 py-2.5 text-xs font-bold transition-colors sm:px-4 ${location === '/records' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))]'}`} data-testid="link-records-page">{t.recordsNav}</Link>
          )}
          <button
            type="button"
            onClick={onChangeAccess}
            disabled={switchingAccess}
            className="focus-ring ml-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-[hsl(var(--border))] px-3 py-2.5 text-xs font-bold text-[hsl(var(--muted-foreground))] disabled:opacity-60 sm:px-4"
            data-testid="button-change-access"
          >
            {switchingAccess ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            {t.changeAccess}
          </button>
        </nav>
      )}
    </header>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <label className="text-base font-bold text-[hsl(var(--foreground))]">{children}</label>
      {hint && <span className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</span>}
    </div>
  );
}

function AttachmentPreview({
  image,
  language,
  onRemove,
}: {
  image: ImageAttachment;
  language: Language;
  onRemove: () => void;
}) {
  const t = copy[language];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--accent)/.75)] bg-[hsl(var(--card))]" data-testid="preview-image">
      <img src={image.dataUrl} alt={t.selectedImage} className="max-h-72 w-full object-contain bg-[hsl(var(--secondary))]" />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <ImagePlus size={16} className="shrink-0 text-[hsl(var(--primary))]" />
          <span className="truncate">{image.name}</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="focus-ring inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.08)]"
          aria-label={t.removeImage}
          data-testid="button-remove-image"
        >
          <Trash2 size={15} />
          <span className="hidden sm:inline">{t.removeImage}</span>
        </button>
      </div>
    </div>
  );
}

const classroomModeNotice: Record<Language, string> = {
  vi: 'Chế độ lớp học/kiểm thử đang bật. Máy chủ sẽ đánh dấu báo cáo này là dữ liệu tổng hợp.',
  en: 'Classroom/test mode is active. The server will mark this report as synthetic data.',
  es: 'El modo de clase/pruebas está activo. El servidor marcará este reporte como dato sintético.',
  pa: 'ਕਲਾਸਰੂਮ/ਟੈਸਟ ਮੋਡ ਚਾਲੂ ਹੈ। ਸਰਵਰ ਇਸ ਰਿਪੋਰਟ ਨੂੰ ਸਿੰਥੈਟਿਕ ਡੇਟਾ ਵਜੋਂ ਦਰਜ ਕਰੇਗਾ।',
};

function ReportForm({
  language,
  classroomMode,
  onSubmitted,
}: {
  language: Language;
  classroomMode: boolean;
  onSubmitted: (report: RiderSubmission, image: ImageAttachment | null) => void;
}) {
  const t = copy[language];
  const createSubmission = useCreateSubmission();
  const classify = useClassifyTransitInput();
  const [lookupRequest, setLookupRequest] = useState(0);
  const [lookupPending, setLookupPending] = useState(false);
  const [description, setDescription] = useState('');
  const currentDescription = useRef(description);
  currentDescription.current = description;
  const routingCopy = {
    en: { continue: 'Continue', hint: 'Transit questions are checked, not saved as reports.', error: 'Could not classify your message. Nothing was saved. Please try again.' },
    vi: { continue: 'Tiếp tục', hint: 'Câu hỏi giao thông được tra cứu, không lưu thành báo cáo.', error: 'Không thể phân loại nội dung. Chưa lưu gì. Hãy thử lại.' },
    es: { continue: 'Continuar', hint: 'Las consultas de transporte no se guardan como reportes.', error: 'No se pudo clasificar el mensaje. No se guardó nada. Inténtelo de nuevo.' },
    pa: { continue: 'ਜਾਰੀ ਰੱਖੋ', hint: 'ਆਵਾਜਾਈ ਦੇ ਸਵਾਲ ਵੇਖੇ ਜਾਂਦੇ ਹਨ, ਰਿਪੋਰਟ ਵਜੋਂ ਸੰਭਾਲੇ ਨਹੀਂ ਜਾਂਦੇ।', error: 'ਸੁਨੇਹੇ ਦੀ ਕਿਸਮ ਨਹੀਂ ਪਛਾਣ ਸਕੇ। ਕੁਝ ਸੰਭਾਲਿਆ ਨਹੀਂ ਗਿਆ। ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ।' },
  }[language];
  const [image, setImage] = useState<ImageAttachment | null>(null);
  const [issueCategory, setIssueCategory] = useState<'delay' | 'cleanliness' | 'safety' | 'accessibility' | 'staff' | 'vehicle' | 'other'>('other');
  const [route, setRoute] = useState('');
  const [stop, setStop] = useState('');
  const [routeId, setRouteId] = useState('');
  const [stopId, setStopId] = useState('');
  const [searchedFor, setSearchedFor] = useState<{ route: string; stop: string } | null>(null);
  const [matchError, setMatchError] = useState(false);
  const [error, setError] = useState('');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const voiceRef = useRef<VoiceRecognition | null>(null);
  const transitMatches = useGetTransitMatches(
    { route: route.trim(), stop: stop.trim() },
    { query: { queryKey: getGetTransitMatchesQueryKey({ route: route.trim(), stop: stop.trim() }), enabled: false } },
  );
  const currentMatches = searchedFor?.route === route.trim() && searchedFor?.stop === stop.trim()
    ? transitMatches.data
    : undefined;

  const findTransitMatches = async () => {
    setMatchError(false);
    setSearchedFor({ route: route.trim(), stop: stop.trim() });
    try {
      const result = await transitMatches.refetch();
      if (result.isError) setMatchError(true);
    } catch {
      setMatchError(true);
    }
  };

  useEffect(() => {
    if (voiceRef.current) {
      voiceRef.current.stop();
      setIsListening(false);
      setVoiceTranscript('');
      setVoiceMessage('');
    }
  }, [language]);

  const toggleVoice = () => {
    if (isListening) {
      voiceRef.current?.stop();
      setIsListening(false);
      return;
    }

    const voiceWindow = window as VoiceWindow;
    const Recognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceMessage(t.voiceUnavailable);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = voiceLocales[language];
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript?.trim() ?? '';
        if (event.results[index]?.isFinal) finalText += `${transcript} `;
        else interimText += `${transcript} `;
      }
      if (finalText.trim()) {
        const spokenText = finalText.trim();
        setDescription((current) => `${current}${current ? ' ' : ''}${spokenText}`.slice(0, 1000));
        setVoiceTranscript(spokenText);
      } else if (interimText.trim()) {
        setVoiceTranscript(interimText.trim());
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      setVoiceMessage(t.voiceError);
    };
    recognition.onend = () => setIsListening(false);
    voiceRef.current = recognition;
    setError('');
    setVoiceMessage('');
    setVoiceTranscript('');
    setIsListening(true);
    recognition.start();
  };

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError(t.imageError);
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage({ name: selected.name, dataUrl: String(reader.result) });
    reader.onerror = () => setError(t.imageError);
    reader.readAsDataURL(selected);
    setError('');
    event.target.value = '';
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (classify.isPending || lookupPending || createSubmission.isPending) return;
    setError('');
    if (!description.trim() && !image) {
      setError(t.requiredError);
      return;
    }
    if (description.trim()) {
      try {
        const classification = await classify.mutateAsync({ data: { message: description.trim(), language } });
        if (currentDescription.current !== description) return;
        if (classification.intent === 'transit_lookup') {
          setLookupRequest(value => value + 1);
          return;
        }
      } catch {
        setError(routingCopy.error);
        return; // A failed classification must never silently save a question.
      }
    }
    createSubmission.mutate(
      { data: {
        description: description.trim(),
        language,
        imageName: image?.name ?? null,
        issueCategory,
        route: route.trim() || undefined,
        stop: stop.trim() || undefined,
        routeId: routeId || undefined,
        stopId: stopId || undefined,
      } },
      {
        onSuccess: (report) => {
          queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey() });
          onSubmitted(report, image);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        onError: () => setError(t.submitError),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {classroomMode && (
        <p className="rounded-xl border border-[hsl(var(--accent)/.75)] bg-[hsl(var(--secondary))] p-4 text-sm font-semibold leading-6 text-[hsl(var(--primary))]" role="note" data-testid="notice-classroom-mode">
          {classroomModeNotice[language]}
        </p>
      )}
      <section className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[0_14px_32px_hsl(216_61%_20%/.06)] sm:rounded-[26px] sm:p-8">
        <div className="mb-5 flex items-start gap-3 sm:mb-7 sm:gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
            <Volume2 size={20} />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-[-.035em]">{t.describeHeading}</h2>
            <p className="mt-1 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.instruction}</p>
          </div>
        </div>

        <FieldLabel hint={t.describeHint}>{t.describeLabel}</FieldLabel>
        <div className="relative">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
            className="focus-ring min-h-[160px] w-full resize-y rounded-2xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-4 py-4 pb-16 text-base leading-7 text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground)/.8)] focus:border-[hsl(var(--primary))] sm:min-h-[180px]"
            placeholder={t.placeholder}
            aria-label={t.describeLabel}
            data-testid="textarea-description"
          />
          <button
            type="button"
            onClick={toggleVoice}
            className={`focus-ring absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors ${isListening ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--accent))] text-[hsl(var(--primary))] hover:brightness-95'}`}
            aria-label={isListening ? t.voiceStop : t.voiceStart}
            data-testid="button-voice"
          >
            <Mic size={18} className={isListening ? 'animate-pulse' : ''} />
            <span>{t.voiceLabel}</span>
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="flex items-center gap-1.5">
            <Mic size={14} />
            {isListening ? t.voiceStop : t.voiceStart}
          </span>
          <span>{description.length}/1000</span>
        </div>
        {voiceTranscript && (
          <div className="mt-4 rounded-xl border border-[hsl(var(--accent)/.7)] bg-[hsl(var(--accent)/.18)] p-3 text-sm text-[hsl(var(--foreground))]" role="status" data-testid="status-voice-transcript">
            <span className="mb-1 block text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--primary))]">{t.voiceTranscript}</span>
            “{voiceTranscript}”
          </div>
        )}
        <TransitQuestion message={description} language={language} requestTrigger={lookupRequest} onPendingChange={setLookupPending} />
        {voiceMessage && <p className="mt-3 text-sm leading-6 text-[hsl(var(--destructive))]" role="alert" data-testid="status-voice-message">{voiceMessage}</p>}
      </section>

      <section className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[0_14px_32px_hsl(216_61%_20%/.06)] sm:rounded-[26px] sm:p-6">
        <div className="grid gap-4">
          <label className="block text-sm font-semibold">
            {t.issueCategory}
            <select value={issueCategory} onChange={(event) => setIssueCategory(event.target.value as typeof issueCategory)} className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm">
              {(Object.keys(t.categories) as Array<keyof typeof t.categories>).map((category) => <option key={category} value={category}>{t.categories[category]}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            {t.routeLabel}
            <input value={route} onChange={(event) => { setRoute(event.target.value); setRouteId(''); setStopId(''); }} maxLength={150} className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm" />
          </label>
          <label className="block text-sm font-semibold">
            {t.stopLabel}
            <input value={stop} onChange={(event) => { setStop(event.target.value); setStopId(''); }} maxLength={160} className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm" />
          </label>
        </div>
        <button type="button" onClick={() => void findTransitMatches()} disabled={transitMatches.isFetching} className="focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 text-sm font-bold text-[hsl(var(--primary))] disabled:opacity-60" data-testid="button-find-transit-matches">
          {transitMatches.isFetching && <Loader2 size={15} className="animate-spin" />}
          {transitMatches.isFetching ? t.findMatchesLoading : t.findMatches}
        </button>
        {currentMatches && (
          <div className="mt-3 space-y-3" role="status" data-testid="transit-match-results">
            {currentMatches.message && <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">{currentMatches.message}</p>}
            {currentMatches.routes?.length > 0 && (
              <label className="block text-sm font-semibold">{t.routeCandidate}
                <select value={routeId} onChange={(event) => { setRouteId(event.target.value); setStopId(''); }} className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm">
                  <option value="">—</option>
                  {currentMatches.routes.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </label>
            )}
            {currentMatches.stops?.length > 0 && (
              <label className="block text-sm font-semibold">{t.stopCandidate}
                <select value={stopId} onChange={(event) => setStopId(event.target.value)} className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm">
                  <option value="">—</option>
                  {currentMatches.stops.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        {matchError && <p className="mt-3 text-xs leading-5 text-[hsl(var(--destructive))]" role="alert">{t.matchError}</p>}
        {((route && !routeId) || (stop && !stopId)) && <p className="mt-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.unmatched}</p>}
      </section>

      <section className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[0_14px_32px_hsl(216_61%_20%/.06)] sm:rounded-[26px] sm:p-8">
        <div className="mb-5 flex items-start gap-3 sm:mb-6 sm:gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
            <ImagePlus size={20} />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-[-.035em]">{t.imageHeading}</h2>
            <p className="mt-1 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.imageDescription}</p>
          </div>
        </div>
        {image ? (
          <AttachmentPreview image={image} language={language} onRemove={() => setImage(null)} />
        ) : (
          <label className="focus-ring flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[hsl(var(--input))] bg-[hsl(var(--secondary)/.5)] px-4 py-7 text-center transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))] sm:px-5 sm:py-9">
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-[hsl(var(--card))] text-[hsl(var(--primary))]">
              <Paperclip size={22} />
            </span>
            <span className="text-base font-bold text-[hsl(var(--primary))]">{t.chooseImage}</span>
            <span className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{t.imageHint}</span>
            <input type="file" accept="image/*" className="sr-only" onChange={selectImage} data-testid="input-image" />
          </label>
        )}
        <p className="mt-4 flex gap-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" />
          {t.secureNote}
        </p>
        <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.imageAiNote}</p>
      </section>

      {error && (
        <div className="flex gap-3 rounded-2xl border border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.08)] p-4 text-sm leading-6 text-[hsl(var(--destructive))]" role="alert" data-testid="status-form-error">
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={createSubmission.isPending || classify.isPending || lookupPending}
        className="focus-ring flex min-h-[60px] w-full items-center justify-between gap-4 rounded-2xl bg-[hsl(var(--primary))] px-5 text-left text-[hsl(var(--primary-foreground))] shadow-[5px_5px_0_hsl(var(--accent))] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-75 sm:px-7"
        data-testid="button-submit-report"
      >
        <span>
          <span className="block text-base font-bold">{createSubmission.isPending ? t.sending : routingCopy.continue}</span>
          <span className="mt-1 block text-xs text-[hsl(var(--primary-foreground)/.72)]">{routingCopy.hint}</span>
        </span>
        {createSubmission.isPending || classify.isPending || lookupPending ? <Loader2 size={23} className="animate-spin" /> : <Send size={22} />}
      </button>
    </form>
  );
}

function SubmittedReport({
  language,
  report,
  image,
  onNewReport,
  onChangeAccess,
}: {
  language: Language;
  report: RiderSubmission;
  image: ImageAttachment | null;
  onNewReport: () => void;
  onChangeAccess: () => void;
}) {
  const t = copy[language];
  const responseKind = (report as RiderSubmission & { responseKind?: string }).responseKind;
  const responseNote = responseKind === 'ai_generated'
    ? t.responseNoteAi
    : responseKind === 'context_only'
      ? t.responseNoteContext
      : t.responseNoteLegacy;

  const speakResponse = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(report.assistantResponse);
    utterance.lang = voiceLocales[report.language];
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="space-y-6" data-testid="screen-submitted">
      <section className="overflow-hidden rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_14px_32px_hsl(216_61%_20%/.07)] sm:rounded-[28px]">
        <div className="bg-[hsl(var(--primary))] px-5 py-8 text-[hsl(var(--primary-foreground))] sm:px-9 sm:py-10">
          <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--primary))] shadow-[4px_4px_0_hsl(var(--primary-foreground)/.18)]">
            <Check size={30} strokeWidth={3} />
          </div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[.16em] text-[hsl(var(--accent))]">{t.successEyebrow}</p>
          <h1 className="mt-3 max-w-xl text-3xl font-bold tracking-[-.055em] sm:text-4xl">{t.successTitle}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[hsl(var(--primary-foreground)/.8)]">{t.successBody}</p>
        </div>

        <div className="space-y-6 p-4 sm:p-9">
          <div className="rounded-2xl border border-[hsl(var(--accent)/.65)] bg-[hsl(var(--accent)/.16)] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[hsl(var(--primary))]">{t.responseHeading}</p>
                <p className="mt-2 text-sm leading-7 text-[hsl(var(--foreground))]" data-testid="text-assistant-response">{report.assistantResponse}</p>
                <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{responseNote}</p>
              </div>
              <button
                type="button"
                onClick={speakResponse}
                className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[hsl(var(--card))] text-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))]"
                aria-label={t.readAloud}
                title={t.readAloud}
                data-testid="button-read-response"
              >
                <Volume2 size={18} />
              </button>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{t.reportHeading}</p>
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
              <p className="text-xs font-bold text-[hsl(var(--muted-foreground))]">{t.reportContent}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7" data-testid="text-report-description">{report.description || t.reportImage}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[hsl(var(--primary))]" data-testid="status-report-image">
                <ImagePlus size={15} />
                {image ? `${t.reportImage}: ${report.imageName}` : t.reportNoImage}
              </div>
            </div>
          </div>
          <TransitDetails submission={report} language={language} />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[hsl(var(--secondary))] p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">{t.reportReference}</p>
              <p className="mt-1 font-mono text-lg font-bold text-[hsl(var(--primary))]" data-testid="text-report-reference">{report.reference}</p>
            </div>
            <p className="max-w-[220px] text-right text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.referenceHint}</p>
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]" data-testid="text-submitted-at">{t.submittedLabel}: <time dateTime={report.submittedAt}>{new Intl.DateTimeFormat(voiceLocales[language], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.submittedAt))}</time></p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onNewReport} className="focus-ring inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--secondary))]" data-testid="button-new-report">
              <ArrowLeft size={17} />{t.newReport}
            </button>
            <button type="button" onClick={onChangeAccess} className="focus-ring inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90" data-testid="button-switch-access">
              <LogOut size={16} />{t.changeAccess}
            </button>
          </div>
        </div>
      </section>
      <p className="flex items-center justify-center gap-2 px-3 text-center text-xs leading-5 text-[hsl(var(--muted-foreground))]" data-testid="text-safety-note">
        <MapPin size={14} className="shrink-0" />
        {t.safety}
      </p>
    </div>
  );
}

function TransitApp() {
  const [language, setLanguage] = useState<Language>('vi');
  const [submitted, setSubmitted] = useState<{ report: RiderSubmission; image: ImageAttachment | null } | null>(null);
  const [localRole, setLocalRole] = useState<AccessRole | null>(null);
  const logoutAccess = useLogoutAccess();
  const accessStatus = useGetAccessStatus({
    query: { queryKey: getGetAccessStatusQueryKey(), retry: false },
  });
  const t = copy[language];
  const [location, setLocation] = useLocation();
  const activeRole = localRole ?? accessStatus.data?.role ?? null;
  const hasAccess = activeRole !== null && (localRole !== null || accessStatus.data?.unlocked === true);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = activeRole === 'reviewer' ? `${t.recordsNav} | VTA` : t.title;
  }, [activeRole, language, t.recordsNav, t.title]);

  useEffect(() => {
    if (activeRole === 'reviewer' && location !== '/records') setLocation('/records');
    if (activeRole && activeRole !== 'reviewer' && location === '/records') setLocation('/');
  }, [activeRole, location, setLocation]);

  const handleAccessChange = () => {
    logoutAccess.mutate(undefined, {
      onSuccess: (status) => {
        queryClient.clear();
        queryClient.setQueryData(getGetAccessStatusQueryKey(), status);
        setLocalRole(null);
        setSubmitted(null);
        setLocation('/');
      },
    });
  };

  return (
    <div className="noise min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Header
        language={language}
        onLanguageChange={setLanguage}
        role={activeRole}
        onChangeAccess={handleAccessChange}
        switchingAccess={logoutAccess.isPending}
      />
      <div
        className="border-b border-[hsl(var(--accent)/.75)] bg-[hsl(var(--secondary))] px-4 py-2.5"
        role="note"
        data-testid="notice-class-project"
      >
        <p className="mx-auto max-w-4xl text-center text-xs font-semibold leading-5 text-[hsl(var(--primary))] sm:text-sm">
          {t.projectNotice}
        </p>
      </div>
      <main className="civic-grid mx-auto min-h-[calc(100dvh-76px)] max-w-4xl px-4 py-6 sm:px-8 sm:py-12">
        {accessStatus.isLoading && !hasAccess ? (
          <p className="mx-auto max-w-md py-12 text-center text-sm text-[hsl(var(--muted-foreground))]" role="status">
            {accessCopy[language].checking}
          </p>
        ) : !hasAccess ? (
          <AccessGate
            language={language}
            reviewerAvailable={accessStatus.data?.reviewerAvailable ?? false}
            classroomAvailable={accessStatus.data?.classroomAvailable ?? false}
            unavailable={accessStatus.isError}
            onUnlocked={(role) => {
              setLocalRole(role);
              setSubmitted(null);
              setLocation(role === 'reviewer' ? '/records' : '/');
            }}
            onRetry={() => { void accessStatus.refetch(); }}
          />
        ) : activeRole === 'reviewer' ? (
          <RecordsPage language={language} />
        ) : (
          <Switch>
            <Route path="/records"><Redirect to="/" /></Route>
            <Route path="/">
              <div className="mx-auto max-w-2xl">
                <div className="mb-7 flex items-center justify-between gap-3 sm:mb-8 sm:gap-4">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--primary))]" data-testid="text-step">
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" />
                    {submitted ? t.stepTwo : t.stepOne}
                  </span>
                  <span className="hidden items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] sm:flex">
                    <ShieldCheck size={15} className="text-[hsl(var(--primary))]" />
                    {t.privacy}
                  </span>
                </div>

                {!submitted ? (
                  <>
                    <div className="mb-7 sm:mb-9">
                      <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">{t.eyebrow}</p>
                      <h1 className="max-w-2xl text-4xl font-bold leading-[.98] tracking-[-.065em] sm:text-6xl" data-testid="text-page-title">{t.title}</h1>
                      <p className="mt-5 max-w-xl text-base leading-7 text-[hsl(var(--muted-foreground))]">{t.instruction}</p>
                    </div>
                    <ReportForm
                      language={language}
                      classroomMode={activeRole === 'classroom'}
                      onSubmitted={(report, image) => setSubmitted({ report, image })}
                    />
                  </>
                ) : (
                  <SubmittedReport
                    language={language}
                    report={submitted.report}
                    image={submitted.image}
                    onNewReport={() => setSubmitted(null)}
                    onChangeAccess={handleAccessChange}
                  />
                )}
              </div>
            </Route>
            <Route component={NotFound} />
          </Switch>
        )}
      </main>
      <footer className="border-t border-[hsl(var(--border))] px-5 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
        {t.footer}
      </footer>
    </div>
  );
}

export default function App() {
  return <QueryClientProvider client={queryClient}><TransitApp /></QueryClientProvider>;
}