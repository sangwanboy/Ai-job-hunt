"use client";

import { useMemo, useState } from "react";

const campaignRows = [
  { recruiter: "Priya N.", channel: "LinkedIn", tone: "Direct", status: "Ready", eta: "Today" },
  { recruiter: "Marcus T.", channel: "Email", tone: "Warm", status: "Queued", eta: "Tomorrow" },
  { recruiter: "Elena R.", channel: "LinkedIn", tone: "Strategic", status: "Draft", eta: "Today" },
  { recruiter: "Daniel K.", channel: "Email", tone: "Concise", status: "Queued", eta: "2 days" },
];

type DraftItem = {
  recruiterId: string;
  recruiterName: string;
  channel: string;
  tone: string;
  subject: string;
  body: string;
};

export default function OutreachPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const queuedCount = useMemo(
    () => campaignRows.filter((row) => row.status === "Queued" || row.status === "Draft").length,
    [],
  );

  async function generateDraftBatch() {
    setIsGenerating(true);
    setToast(null);

    try {
      const response = await fetch("/api/outreach/generate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const payload = (await response.json()) as { drafts?: DraftItem[]; error?: string };
      if (!response.ok || !payload.drafts) {
        throw new Error(payload.error ?? "Failed to generate outreach drafts");
      }

      setDrafts(payload.drafts);
      setShowDrafts(true);
    } catch (error) {
      setToast({ 
        message: error instanceof Error ? error.message : "Failed to generate draft batch", 
        type: "error" 
      });
    } finally {
      setIsGenerating(false);
    }
  }

  function updateDraft(index: number, patch: Partial<DraftItem>) {
    setDrafts((current) => current.map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...patch } : draft)));
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <section className="flex flex-none flex-wrap items-start justify-between gap-3 pb-6">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Outreach</h2>
          <p className="mt-1 text-sm text-muted">Plan campaigns, personalize drafts, and control send cadence.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            className={`btn-secondary ${isPaused ? "bg-amber-100 border-amber-300 text-amber-700" : ""}`}
            onClick={() => {
              setIsPaused(!isPaused);
              setToast({ 
                message: isPaused ? "Queue resumed." : "Queue paused. No messages will be sent.", 
                type: "info" 
              });
            }}
          >
            {isPaused ? "Resume Queue" : "Pause Queue"}
          </button>
          <button className="btn-primary disabled:opacity-60" onClick={generateDraftBatch} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "Generate Draft Batch"}
          </button>
        </div>
      </section>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-6 pb-6 custom-scrollbar">
        {toast ? (
          <div className={`rounded-xl border px-4 py-3 text-sm flex justify-between items-center ${
            toast.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : 
            toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
            "border-blue-200 bg-blue-50 text-blue-700"
          }`}>
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 font-bold">×</button>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <article className={`panel p-4 ${isPaused ? "opacity-60 grayscale-[0.5]" : ""}`}>
            <p className="text-sm text-muted text-center flex items-center justify-center gap-2">
              Queued Today
              {isPaused && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
            </p>
            <p className="mt-2 text-2xl font-extrabold text-center">{queuedCount}</p>
          </article>
          <article className="panel p-4">
            <p className="text-sm text-muted text-center">Personalized</p>
            <p className="mt-2 text-2xl font-extrabold text-center">87%</p>
          </article>
          <article className="panel p-4">
            <p className="text-sm text-muted text-center">Positive Replies</p>
            <p className="mt-2 text-2xl font-extrabold text-center">19%</p>
          </article>
        </section>

        <section className="panel overflow-hidden p-0">
          <div className="border-b border-white/60 bg-white/70 px-4 py-3">
            <h3 className="font-bold">Campaign Queue</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/65 text-left text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Recruiter</th>
                  <th className="px-4 py-2 font-semibold">Channel</th>
                  <th className="px-4 py-2 font-semibold">Tone</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">ETA</th>
                </tr>
              </thead>
              <tbody>
                {campaignRows.map((row) => (
                  <tr key={`${row.recruiter}-${row.channel}`} className="border-t border-white/60">
                    <td className="px-4 py-3 font-semibold">{row.recruiter}</td>
                    <td className="px-4 py-3">{row.channel}</td>
                    <td className="px-4 py-3">{row.tone}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${isPaused ? "bg-amber-50 text-amber-700 border-amber-200" : ""}`}>
                        {isPaused && row.status !== "Draft" ? "PAUSED" : row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.eta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {showDrafts ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 sticky top-0 bg-white/95 pb-4 backdrop-blur-sm z-10">
              <div>
                <h3 className="text-xl font-extrabold">Generated Draft Batch</h3>
                <p className="mt-1 text-sm text-muted">Review, edit, and approve drafts before queueing.</p>
              </div>
              <button className="btn-secondary" onClick={() => setShowDrafts(false)}>
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {drafts.map((draft, index) => (
                <article key={draft.recruiterId} className="rounded-2xl border border-white/60 bg-white/80 p-4 transition-all hover:border-cyan-300 hover:shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold">{draft.recruiterName}</h4>
                      <p className="text-sm text-muted">
                        {draft.channel} · {draft.tone}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-secondary" onClick={() => {
                        setToast({ message: `Draft for ${draft.recruiterName} ready for manual edit.`, type: "info" });
                      }}>
                        Edit
                      </button>
                      <button className="btn-primary" onClick={() => {
                        setToast({ message: `Approved & queued ${draft.recruiterName}.`, type: "success" });
                        setDrafts(prev => prev.filter((_, i) => i !== index));
                        if (drafts.length === 1) setShowDrafts(false);
                      }}>
                        Approve & Queue
                      </button>
                    </div>
                  </div>

                  <label className="mt-4 block text-sm">
                    <span className="mb-1 block font-semibold">Subject</span>
                    <input
                      value={draft.subject}
                      onChange={(event) => updateDraft(index, { subject: event.target.value })}
                      className="field"
                    />
                  </label>

                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block font-semibold">Body</span>
                    <textarea
                      value={draft.body}
                      onChange={(event) => updateDraft(index, { body: event.target.value })}
                      rows={6}
                      className="field"
                    />
                  </label>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
