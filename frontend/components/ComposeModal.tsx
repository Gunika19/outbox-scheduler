"use client";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "@/lib/api";
import { extractEmails } from "@/lib/parseEmails";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";

// <input type="datetime-local"> wants local time as "YYYY-MM-DDTHH:mm".
function toLocalInput(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function ComposeModal({ open, onClose, token, onCreated }: {
  open: boolean;
  onClose: () => void;
  token?: string;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [startTime, setStartTime] = useState(() => toLocalInput(new Date(Date.now() + 60_000)));
  const [delaySec, setDelaySec] = useState("2");
  const [hourlyLimit, setHourlyLimit] = useState("50");
  const [submitting, setSubmitting] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRecipients(extractEmails(await file.text()));
  }

  function reset() {
    setSubject("");
    setBody("");
    setRecipients([]);
    setFileName("");
    setStartTime(toLocalInput(new Date(Date.now() + 60_000)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (recipients.length === 0) {
      toast.error("Upload a file with at least one email address");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createCampaign(token, {
        subject,
        body,
        recipients,
        startTime: new Date(startTime).toISOString(), // local → UTC ISO
        delayMs: Math.round(Number(delaySec) * 1000),
        hourlyLimit: Number(hourlyLimit),
      });
      toast.success(`Scheduled ${res.emailCount} emails`);
      reset();
      onCreated();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Compose New Email">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        <Textarea label="Body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} required />

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Recipients (.csv or .txt)</span>
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={onFile}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
          />
          {fileName && (
            <span className="mt-1 block text-sm text-gray-600">
              {recipients.length} email{recipients.length === 1 ? "" : "s"} detected
            </span>
          )}
        </label>

        <Input label="Start time" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Delay between emails (s)" type="number" min={0} step="any" value={delaySec} onChange={(e) => setDelaySec(e.target.value)} required />
          <Input label="Hourly limit" type="number" min={1} value={hourlyLimit} onChange={(e) => setHourlyLimit(e.target.value)} required />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner className="h-4 w-4 border-t-white" />}
            Schedule
          </Button>
        </div>
      </form>
    </Modal>
  );
}
