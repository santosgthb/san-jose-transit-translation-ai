import { useQueryClient } from '@tanstack/react-query';
import { getListSubmissionsQueryKey, useUpdateSubmissionResponseStatus, type RiderSubmission } from '@workspace/api-client-react';
import type { Language } from '@/App';

const copy = {
  en: { replied: 'Staff reply recorded', pending: 'No staff reply recorded', mark: 'Mark staff reply sent', undo: 'Mark not responded', help: 'Records a reply already sent; this does not send a reply.', error: 'Could not save the response status. Try again.' },
  vi: { replied: 'Đã ghi nhận phản hồi của nhân viên', pending: 'Chưa ghi nhận phản hồi của nhân viên', mark: 'Đánh dấu đã gửi phản hồi', undo: 'Đánh dấu chưa phản hồi', help: 'Ghi nhận phản hồi đã gửi; thao tác này không gửi phản hồi.', error: 'Không thể lưu trạng thái phản hồi. Hãy thử lại.' },
  es: { replied: 'Respuesta del personal registrada', pending: 'Sin respuesta del personal registrada', mark: 'Marcar respuesta enviada', undo: 'Marcar sin respuesta', help: 'Registra una respuesta ya enviada; no envía una respuesta.', error: 'No se pudo guardar el estado. Inténtelo de nuevo.' },
  pa: { replied: 'ਸਟਾਫ਼ ਦਾ ਜਵਾਬ ਦਰਜ ਹੈ', pending: 'ਸਟਾਫ਼ ਦਾ ਜਵਾਬ ਦਰਜ ਨਹੀਂ ਹੈ', mark: 'ਸਟਾਫ਼ ਦਾ ਜਵਾਬ ਭੇਜਿਆ ਨਿਸ਼ਾਨ ਲਗਾਓ', undo: 'ਜਵਾਬ ਨਹੀਂ ਦਿੱਤਾ ਨਿਸ਼ਾਨ ਲਗਾਓ', help: 'ਪਹਿਲਾਂ ਭੇਜਿਆ ਜਵਾਬ ਦਰਜ ਕਰਦਾ ਹੈ; ਇਹ ਜਵਾਬ ਨਹੀਂ ਭੇਜਦਾ।', error: 'ਜਵਾਬ ਦੀ ਸਥਿਤੀ ਸੰਭਾਲੀ ਨਹੀਂ ਜਾ ਸਕੀ। ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ।' },
};
export default function StaffResponseStatus({ submission, language }: { submission: RiderSubmission; language: Language }) {
  const t = copy[language];
  const client = useQueryClient();
  const update = useUpdateSubmissionResponseStatus();
  return <div className="mt-4 border-b border-[hsl(var(--border))] pb-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-bold text-[hsl(var(--primary))]" data-testid={`staff-response-status-${submission.id}`}>
        {submission.staffResponseSent ? t.replied : t.pending}
      </span>
      <button type="button" disabled={update.isPending} onClick={() => update.mutate({
        id: submission.id, data: { staffResponseSent: !submission.staffResponseSent },
      }, { onSuccess: saved => {
        client.setQueryData<RiderSubmission[]>(getListSubmissionsQueryKey(), rows => rows?.map(row => row.id === saved.id ? saved : row));
        void client.invalidateQueries({ queryKey: getListSubmissionsQueryKey() });
      } })}
        className="focus-ring min-h-10 rounded-lg border border-[hsl(var(--border))] px-3 text-xs font-bold text-[hsl(var(--primary))] disabled:opacity-50"
        data-testid={`button-staff-response-${submission.id}`}>
        {submission.staffResponseSent ? t.undo : t.mark}
      </button>
    </div>
    <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{t.help}</p>
    {update.isError && <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">{t.error}</p>}
  </div>;
}