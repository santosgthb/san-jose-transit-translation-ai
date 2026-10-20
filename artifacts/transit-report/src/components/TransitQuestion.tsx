import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useResolveTransitRequest, type TransitRequestResult } from '@workspace/api-client-react';
import type { Language } from '@/App';

const copy = {
  en: { check: 'Check next departures', hint: 'Ask naturally in the text above, for example: “When is the next light rail from Winchester?” No route or stop IDs needed.', error: 'Transit information could not be checked. Please try again.', debug: 'Debug mode: extraction and source details' },
  vi: { check: 'Tra chuyến khởi hành tiếp theo', hint: 'Hỏi tự nhiên trong ô trên, ví dụ: “Chuyến tàu tiếp theo từ Winchester khi nào?” Không cần mã tuyến hoặc điểm dừng.', error: 'Không thể tra thông tin giao thông. Vui lòng thử lại.', debug: 'Chế độ gỡ lỗi: thông tin phân tích và nguồn' },
  es: { check: 'Consultar próximas salidas', hint: 'Pregunte en el texto de arriba, por ejemplo: “¿Cuándo sale el próximo tren ligero de Winchester?” No necesita códigos de ruta o parada.', error: 'No se pudo consultar la información de transporte. Inténtelo de nuevo.', debug: 'Modo de depuración: extracción y fuentes' },
  pa: { check: 'ਅਗਲੀ ਰਵਾਨਗੀ ਵੇਖੋ', hint: 'ਉੱਪਰ ਕੁਦਰਤੀ ਤਰੀਕੇ ਨਾਲ ਪੁੱਛੋ: “Winchester ਤੋਂ ਅਗਲੀ ਲਾਈਟ ਰੇਲ ਕਦੋਂ ਹੈ?” ਰੂਟ ਜਾਂ ਸਟਾਪ ID ਦੀ ਲੋੜ ਨਹੀਂ।', error: 'ਆਵਾਜਾਈ ਜਾਣਕਾਰੀ ਨਹੀਂ ਵੇਖੀ ਜਾ ਸਕੀ। ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ।', debug: 'ਡੀਬੱਗ ਮੋਡ: ਸਵਾਲ ਅਤੇ ਸਰੋਤ ਦੇ ਵੇਰਵੇ' },
};

export default function TransitQuestion({ message, language, requestTrigger = 0, onPendingChange }: {
  message: string; language: Language; requestTrigger?: number; onPendingChange?: (pending: boolean) => void;
}) {
  const t = copy[language];
  const lookup = useResolveTransitRequest();
  const [result, setResult] = useState<TransitRequestResult | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setResult(null);
    lookup.reset();
  }, [message, language]); // A changed question invalidates any previous choice.
  const check = (choice?: string) => {
    const requestGeneration = generation.current;
    setResult(null);
    lookup.mutate({ data: { message: message.trim(), language, choice, debug: true } }, {
      onSuccess: value => {
        if (generation.current === requestGeneration) setResult(value);
      },
    });
  };
  useEffect(() => {
    if (requestTrigger) check();
  }, [requestTrigger]);
  useEffect(() => { onPendingChange?.(lookup.isPending); }, [lookup.isPending, onPendingChange]);
  return (
    <section className="mt-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.4)] p-4" data-testid="transit-question">
      <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.hint}</p>
      <button type="button" onClick={() => check()} disabled={!message.trim() || lookup.isPending}
        className="focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[hsl(var(--primary))] bg-[hsl(var(--card))] px-4 text-sm font-bold text-[hsl(var(--primary))] disabled:opacity-50"
        data-testid="button-transit-request">
        {lookup.isPending && <Loader2 size={16} className="animate-spin" />}{t.check}
      </button>
      {lookup.isError && <p className="mt-3 text-sm text-[hsl(var(--destructive))]" role="alert">{t.error}</p>}
      {result && (
        <div className="mt-4" data-testid="transit-request-result">
          <p className="whitespace-pre-wrap text-sm leading-6" role="status">{result.message}</p>
          {!!result.choices.length && (
            <div className="mt-3 grid gap-2" data-testid="transit-clarification">
              {result.choices.map(choice => (
                <button key={choice.id} type="button" onClick={() => check(choice.id)} disabled={lookup.isPending}
                  className="focus-ring min-h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-left text-sm font-semibold text-[hsl(var(--primary))] disabled:opacity-50">
                  {choice.label}
                </button>
              ))}
            </div>
          )}
          {result.departures.length > 1 && <ul className="mt-3 space-y-2 text-sm">
            {result.departures.map(d => <li key={`${d.route}-${d.dateTime}`}>
              {new Intl.DateTimeFormat({ en: 'en-US', vi: 'vi-VN', es: 'es-US', pa: 'pa-IN' }[language], { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(d.dateTime))} — {d.route} · {d.direction}
            </li>)}
          </ul>}
          {result.debug && <details open className="mt-4 text-xs" data-testid="transit-debug">
            <summary className="focus-ring cursor-pointer font-semibold text-[hsl(var(--muted-foreground))]">{t.debug}</summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-[hsl(var(--background))] p-3">{JSON.stringify(result.debug, null, 2)}</pre>
          </details>}
        </div>
      )}
    </section>
  );
}