import { Table } from "@/components/ui/Table";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Email, EmailStatus } from "@/types/api";

const badge: Record<EmailStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700",
  sending: "bg-amber-50 text-amber-700",
  sent: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
};

const fmt = (iso: string) => new Date(iso).toLocaleString();

export function EmailTable({ emails, loading, emptyTitle }: {
  emails: Email[];
  loading: boolean;
  emptyTitle: string;
}) {
  if (loading && emails.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (emails.length === 0) {
    return <EmptyState title={emptyTitle} description="Compose a new email to get started." />;
  }

  return (
    <Table headers={["Email", "Subject", "Scheduled / Sent", "Status"]}>
      {emails.map((e) => (
        <tr key={e.id} className="hover:bg-gray-50">
          <td className="px-4 py-3">{e.recipient}</td>
          <td className="max-w-xs truncate px-4 py-3 text-gray-700">{e.subject}</td>
          <td className="whitespace-nowrap px-4 py-3 text-gray-600">
            {e.sentAt ? fmt(e.sentAt) : fmt(e.scheduledAt)}
          </td>
          <td className="px-4 py-3">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[e.status]}`} title={e.error ?? undefined}>
              {e.status}
            </span>
            {e.previewUrl && (
              <a href={e.previewUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs text-blue-600 hover:underline">
                preview
              </a>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}
