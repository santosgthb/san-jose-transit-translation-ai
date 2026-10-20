import type { RiderSubmission } from '@workspace/api-client-react';
import type { Language } from '@/App';

type TransitRecord = RiderSubmission & {
  issueCategory?: string | null;
  route?: string | null;
  stop?: string | null;
  routeId?: string | null;
  stopId?: string | null;
  operatorId?: string | null;
  routeName?: string | null;
  stopName?: string | null;
  inputIsSynthetic?: boolean;
  inputSource?: string | null;
  dataSourcesUsed?: string[];
  sfBay511DataUsed?: boolean;
  vtaOpenDataUsed?: boolean;
  liveArrivalSnapshot?: unknown;
  serviceAlertSnapshot?: unknown;
  vtaOpenDataSnapshot?: unknown;
  vtaOpenDataDatasetTitle?: string | null;
  vtaOpenDataPublisher?: string | null;
  vtaOpenDataSourceUrl?: string | null;
  vtaOpenDataResourceUrl?: string | null;
  sourceRetrievedAt?: string | null;
  transitNotes?: string[];
  responseKind?: string;
};

const labels: Record<Language, Record<string, string>> = {
  en: {
    synthetic: 'Synthetic classroom test', rider: 'Rider-submitted', unclassified: 'Origin unclassified', legacyOrigin: 'Legacy / unclassified origin', sf: '511 SF Bay', vta: 'VTA Open Data',
    category: 'Issue', route: 'Route', stop: 'Stop', routeId: 'Route ID', stopId: 'Stop ID', operator: 'Operator',
    response: 'Response type', ai: 'AI-generated', context: 'Context only', legacy: 'Legacy fixed response',
    inputSource: 'Input source', categories: 'delay|Delay;cleanliness|Cleanliness;safety|Safety;accessibility|Accessibility;staff|Staff;vehicle|Vehicle;other|Other',
    arrivals: 'Arrival information', alerts: 'Service alerts', noArrivals: 'No arrival snapshot was recorded.',
    noAlerts: 'No service-alert snapshot was recorded.', status: 'Status', retrieved: 'Source retrieved',
    dataset: 'Dataset', publisher: 'Publisher', source: 'Source', resource: 'Resource', staticWarning: 'Historical static context dated October 2025; it is not live service information.',
    notes: 'Transit notes', raw: 'Audit snapshots', unavailable: 'Snapshot unavailable',
  },
  vi: {
    synthetic: 'Thử nghiệm lớp học tổng hợp', rider: 'Do hành khách gửi', unclassified: 'Chưa phân loại nguồn gửi', legacyOrigin: 'Nguồn cũ / chưa phân loại', sf: '511 SF Bay', vta: 'Dữ liệu mở VTA',
    category: 'Vấn đề', route: 'Tuyến', stop: 'Điểm dừng', routeId: 'Mã tuyến', stopId: 'Mã điểm dừng', operator: 'Đơn vị vận hành',
    response: 'Loại phản hồi', ai: 'Do AI tạo', context: 'Chỉ cung cấp ngữ cảnh', legacy: 'Phản hồi cố định cũ',
    inputSource: 'Nguồn nhập', categories: 'delay|Trễ chuyến;cleanliness|Vệ sinh;safety|An toàn;accessibility|Khả năng tiếp cận;staff|Nhân viên;vehicle|Phương tiện;other|Khác',
    arrivals: 'Thông tin xe đến', alerts: 'Thông báo dịch vụ', noArrivals: 'Không có ảnh chụp thông tin xe đến.',
    noAlerts: 'Không có ảnh chụp thông báo dịch vụ.', status: 'Trạng thái', retrieved: 'Thời điểm lấy nguồn',
    dataset: 'Bộ dữ liệu', publisher: 'Nhà xuất bản', source: 'Nguồn', resource: 'Tài nguyên', staticWarning: 'Ngữ cảnh tĩnh lịch sử từ tháng 10 năm 2025; không phải thông tin dịch vụ trực tiếp.',
    notes: 'Ghi chú giao thông', raw: 'Ảnh chụp kiểm tra', unavailable: 'Không có ảnh chụp',
  },
  es: {
    synthetic: 'Prueba sintética de clase', rider: 'Enviado por pasajero', unclassified: 'Origen sin clasificar', legacyOrigin: 'Origen antiguo / sin clasificar', sf: '511 SF Bay', vta: 'Datos abiertos de VTA',
    category: 'Problema', route: 'Ruta', stop: 'Parada', routeId: 'ID de ruta', stopId: 'ID de parada', operator: 'Operador',
    response: 'Tipo de respuesta', ai: 'Generada por IA', context: 'Solo contexto', legacy: 'Respuesta fija anterior',
    inputSource: 'Origen de entrada', categories: 'delay|Retraso;cleanliness|Limpieza;safety|Seguridad;accessibility|Accesibilidad;staff|Personal;vehicle|Vehículo;other|Otro',
    arrivals: 'Información de llegadas', alerts: 'Alertas de servicio', noArrivals: 'No se registró una captura de llegadas.',
    noAlerts: 'No se registró una captura de alertas.', status: 'Estado', retrieved: 'Fuente consultada',
    dataset: 'Conjunto de datos', publisher: 'Editor', source: 'Fuente', resource: 'Recurso', staticWarning: 'Contexto estático histórico de octubre de 2025; no es información en vivo.',
    notes: 'Notas de transporte', raw: 'Capturas para auditoría', unavailable: 'Captura no disponible',
  },
  pa: {
    synthetic: 'ਕਲਾਸਰੂਮ ਸਿੰਥੈਟਿਕ ਟੈਸਟ', rider: 'ਯਾਤਰੀ ਵੱਲੋਂ ਭੇਜੀ', unclassified: 'ਅਣਵਰਗੀਕ੍ਰਿਤ ਸਰੋਤ', legacyOrigin: 'ਪੁਰਾਣਾ / ਅਣਵਰਗੀਕ੍ਰਿਤ ਸਰੋਤ', sf: '511 SF Bay', vta: 'VTA ਓਪਨ ਡੇਟਾ',
    category: 'ਸਮੱਸਿਆ', route: 'ਰੂਟ', stop: 'ਸਟਾਪ', routeId: 'ਰੂਟ ID', stopId: 'ਸਟਾਪ ID', operator: 'ਓਪਰੇਟਰ',
    response: 'ਜਵਾਬ ਦੀ ਕਿਸਮ', ai: 'AI ਵੱਲੋਂ ਬਣਾਇਆ', context: 'ਸਿਰਫ਼ ਸੰਦਰਭ', legacy: 'ਪੁਰਾਣਾ ਨਿਰਧਾਰਤ ਜਵਾਬ',
    inputSource: 'ਇਨਪੁੱਟ ਸਰੋਤ', categories: 'delay|ਦੇਰੀ;cleanliness|ਸਫ਼ਾਈ;safety|ਸੁਰੱਖਿਆ;accessibility|ਪਹੁੰਚਯੋਗਤਾ;staff|ਸਟਾਫ਼;vehicle|ਵਾਹਨ;other|ਹੋਰ',
    arrivals: 'ਆਉਣ ਦੀ ਜਾਣਕਾਰੀ', alerts: 'ਸੇਵਾ ਅਲਰਟ', noArrivals: 'ਆਉਣ ਦੀ ਜਾਣਕਾਰੀ ਦਾ ਸਨੈਪਸ਼ਾਟ ਦਰਜ ਨਹੀਂ ਹੈ।',
    noAlerts: 'ਸੇਵਾ ਅਲਰਟ ਦਾ ਸਨੈਪਸ਼ਾਟ ਦਰਜ ਨਹੀਂ ਹੈ।', status: 'ਸਥਿਤੀ', retrieved: 'ਸਰੋਤ ਪ੍ਰਾਪਤੀ ਸਮਾਂ',
    dataset: 'ਡੇਟਾਸੈੱਟ', publisher: 'ਪ੍ਰਕਾਸ਼ਕ', source: 'ਸਰੋਤ', resource: 'ਸਰੋਤ ਲਿੰਕ', staticWarning: 'ਅਕਤੂਬਰ 2025 ਦਾ ਇਤਿਹਾਸਕ ਸਥਿਰ ਸੰਦਰਭ; ਇਹ ਲਾਈਵ ਸੇਵਾ ਜਾਣਕਾਰੀ ਨਹੀਂ ਹੈ।',
    notes: 'ਟ੍ਰਾਂਜ਼ਿਟ ਨੋਟਸ', raw: 'ਆਡਿਟ ਸਨੈਪਸ਼ਾਟ', unavailable: 'ਸਨੈਪਸ਼ਾਟ ਉਪਲਬਧ ਨਹੀਂ',
  },
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function safeHttpUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatDate(value: string, language: Language): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(
    { en: 'en-US', vi: 'vi-VN', es: 'es-US', pa: 'pa-IN' }[language],
    { dateStyle: 'medium', timeStyle: 'short' },
  ).format(date);
}

function SnapshotList({ snapshot, kind, language }: { snapshot: unknown; kind: 'arrivals' | 'alerts'; language: Language }) {
  const t = labels[language];
  const object = asObject(snapshot);
  const entries = object && Array.isArray(object[kind]) ? object[kind] : [];
  const fieldNames = kind === 'arrivals'
    ? ['routeName', 'lineId', 'destination', 'expectedArrivalTime', 'expectedDepartureTime', 'aimedArrivalTime', 'monitored']
    : ['id', 'header', 'description', 'url'];
  return (
    <div className="mt-3 rounded-xl bg-[hsl(var(--background))] p-3">
      <h4 className="text-xs font-bold">{kind === 'arrivals' ? t.arrivals : t.alerts}</h4>
      {entries.length ? entries.map((entry: unknown, index: number) => {
        const item = asObject(entry);
        if (!item) return null;
        return (
          <dl key={`${kind}-${index}`} className="mt-2 grid gap-x-3 gap-y-1 border-t border-[hsl(var(--border))] pt-2 text-xs sm:grid-cols-[minmax(0,1fr)_2fr]">
            {fieldNames.map((field) => {
              const value = item[field];
              if (typeof value !== 'string' && typeof value !== 'boolean') return null;
              return <div key={field} className="contents"><dt className="font-semibold text-[hsl(var(--muted-foreground))]">{field}</dt><dd className="break-words">{String(value)}</dd></div>;
            })}
          </dl>
        );
      }) : <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{kind === 'arrivals' ? t.noArrivals : t.noAlerts}</p>}
      {object && (text(object.status) || text(object.message)) && (
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          {text(object.status) && <><strong>{t.status}:</strong> {text(object.status)} </>}
          {text(object.message)}
        </p>
      )}
    </div>
  );
}

export default function TransitDetails({ submission, language }: { submission: RiderSubmission; language: Language }) {
  const record = submission as TransitRecord;
  const t = labels[language];
  const isSynthetic = record.inputIsSynthetic === true || record.dataSource === 'synthetic data';
  const responseKind = record.responseKind ?? 'legacy_fixed';
  const responseLabel = responseKind === 'ai_generated' ? t.ai : responseKind === 'context_only' ? t.context : t.legacy;
  const inputSource = text(record.inputSource)?.toLowerCase();
  const isKnownRiderSubmission = inputSource === 'rider-submitted input';
  const isLegacyUnclassified = responseKind === 'legacy_fixed'
    && (!inputSource || inputSource === 'legacy input; classification not recorded');
  const reportTypeLabel = isSynthetic
    ? t.synthetic
    : isKnownRiderSubmission
      ? t.rider
      : isLegacyUnclassified
        ? t.legacyOrigin
        : t.unclassified;
  const usedSources = Array.isArray(record.dataSourcesUsed) ? record.dataSourcesUsed.map((source) => source.toLowerCase()) : [];
  const has511 = record.sfBay511DataUsed === true || usedSources.some((source) => source.includes('511') || source.includes('sf bay'));
  const hasVta = record.vtaOpenDataUsed === true || usedSources.some((source) => source.includes('vta') && source.includes('open'));
  const arrivals = asObject(record.liveArrivalSnapshot);
  const alerts = asObject(record.serviceAlertSnapshot);
  const vta = asObject(record.vtaOpenDataSnapshot);
  const retrievedAt = record.sourceRetrievedAt
    ?? text(arrivals?.retrievedAt)
    ?? text(alerts?.retrievedAt)
    ?? text(vta?.retrievedAt);
  const notes = Array.isArray(record.transitNotes) ? record.transitNotes.filter((note): note is string => typeof note === 'string') : [];
  const metadata: Array<[string, unknown]> = [
    [t.category, record.issueCategory ? t.categories.split(';').map((pair) => pair.split('|')).find(([key]) => key === record.issueCategory)?.[1] ?? record.issueCategory : null],
    [t.route, record.routeName ?? record.route], [t.stop, record.stopName ?? record.stop],
    [t.routeId, record.routeId], [t.stopId, record.stopId], [t.operator, record.operatorId],
    [t.inputSource, record.inputSource],
  ];
  const datasetTitle = record.vtaOpenDataDatasetTitle ?? text(vta?.datasetTitle);
  const publisher = record.vtaOpenDataPublisher ?? text(vta?.publisher);
  const sourceUrl = safeHttpUrl(record.vtaOpenDataSourceUrl ?? vta?.sourceUrl);
  const resourceUrl = safeHttpUrl(record.vtaOpenDataResourceUrl ?? vta?.resourceUrl);
  const providerSourceUrls = [safeHttpUrl(arrivals?.sourceUrl), safeHttpUrl(alerts?.sourceUrl)].filter((url): url is string => Boolean(url));

  return (
    <section className="mt-5 border-t border-[hsl(var(--border))] pt-4" aria-label="Transit context">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs font-bold text-[hsl(var(--primary))]">{reportTypeLabel}</span>
        {has511 && <span className="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold">{t.sf}</span>}
        {hasVta && <span className="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold">{t.vta}</span>}
        <span className="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold">{t.response}: {responseLabel}</span>
      </div>
      {metadata.some(([, value]) => text(value)) && (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {metadata.map(([label, value]) => text(value) && <div key={label}><dt className="font-semibold text-[hsl(var(--muted-foreground))]">{label}</dt><dd className="mt-0.5 break-words">{text(value)}</dd></div>)}
        </dl>
      )}
      {record.liveArrivalSnapshot != null
        ? <SnapshotList snapshot={record.liveArrivalSnapshot} kind="arrivals" language={language} />
        : <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">{t.arrivals}: {t.unavailable}</p>}
      {record.serviceAlertSnapshot != null
        ? <SnapshotList snapshot={record.serviceAlertSnapshot} kind="alerts" language={language} />
        : <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{t.alerts}: {t.unavailable}</p>}
      {(retrievedAt || has511 || hasVta) && <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]"><strong>{t.retrieved}:</strong> {retrievedAt ? formatDate(retrievedAt, language) : t.unavailable}</p>}
      {providerSourceUrls.length > 0 && <p className="mt-2 break-words text-xs text-[hsl(var(--muted-foreground))]"><strong>{t.source}:</strong> {[...new Set(providerSourceUrls)].map((url) => <a key={url} className="ml-2 break-all underline" href={url} target="_blank" rel="noreferrer">{url}</a>)}</p>}
      {(datasetTitle || publisher || sourceUrl || resourceUrl || record.vtaOpenDataSnapshot != null) && (
        <div className="mt-3 rounded-xl border border-[hsl(var(--border))] p-3 text-xs">
          {datasetTitle && <p><strong>{t.dataset}:</strong> {datasetTitle}</p>}
          {publisher && <p className="mt-1"><strong>{t.publisher}:</strong> {publisher}</p>}
          {sourceUrl && <p className="mt-1 break-words"><strong>{t.source}:</strong> <a className="break-all underline" href={sourceUrl} target="_blank" rel="noreferrer">{sourceUrl}</a></p>}
          {resourceUrl && <p className="mt-1 break-words"><strong>{t.resource}:</strong> <a className="break-all underline" href={resourceUrl} target="_blank" rel="noreferrer">{resourceUrl}</a></p>}
          {record.vtaOpenDataSnapshot != null && <p className="mt-2 text-[hsl(var(--muted-foreground))]">{t.staticWarning}</p>}
        </div>
      )}
      {notes.length > 0 && <div className="mt-3 text-xs"><strong>{t.notes}:</strong><ul className="mt-1 list-inside list-disc">{notes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
      {(record.liveArrivalSnapshot != null || record.serviceAlertSnapshot != null || record.vtaOpenDataSnapshot != null) && (
        <details className="mt-3 text-xs">
          <summary className="focus-ring cursor-pointer font-semibold text-[hsl(var(--primary))]">{t.raw}</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[hsl(var(--background))] p-3">{JSON.stringify({ liveArrivalSnapshot: record.liveArrivalSnapshot, serviceAlertSnapshot: record.serviceAlertSnapshot, vtaOpenDataSnapshot: record.vtaOpenDataSnapshot }, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}