"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings2, Shield, Sparkles } from "lucide-react";
import type {
  LlmProvider,
  LlmProviderUpdatePayload,
  LlmSettingsResponse,
  LlmSettingsUpdatePayload,
  RuntimeSettingsResponse,
  RuntimeSettingsUpdatePayload,
} from "@/types/settings";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type ProviderDraft = {
  apiKey: string;
  clearApiKey: boolean;
  defaultModel: string;
  enabledModels: string[];
};

type DraftState = {
  globalDefaultProvider: LlmProvider;
  globalDefaultModel: string;
  providers: Record<LlmProvider, ProviderDraft>;
};

type RuntimeDraftState = RuntimeSettingsUpdatePayload;

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <section className="panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-56 rounded bg-white/60" />
            <div className="h-4 w-80 rounded bg-white/50" />
          </div>
          <div className="h-10 w-36 rounded bg-white/60" />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-white/50" />
            <div className="h-11 rounded-lg bg-white/60" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-white/50" />
            <div className="h-11 rounded-lg bg-white/60" />
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <div className="space-y-2">
          <div className="h-6 w-56 rounded bg-white/60" />
          <div className="h-4 w-96 rounded bg-white/50" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-lg border bg-bg p-3">
              <div className="h-4 w-20 rounded bg-white/50" />
              <div className="mt-2 h-6 w-28 rounded bg-white/60" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <article key={index} className="panel p-5">
            <div className="h-6 w-40 rounded bg-white/60" />
            <div className="mt-4 h-10 rounded-lg bg-white/60" />
            <div className="mt-3 h-10 rounded-lg bg-white/50" />
            <div className="mt-3 h-24 rounded-lg bg-white/50" />
          </article>
        ))}
      </section>
    </div>
  );
}

function providerTitle(label: string, hasApiKey: boolean, masked: string | null) {
  if (!hasApiKey || !masked) {
    return `${label} (no key)`;
  }
  return `${label} (${masked})`;
}

export function LlmSettingsPanel() {
  const [settings, setSettings] = useState<LlmSettingsResponse | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSettingsResponse | null>(null);
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeDraftState | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<SaveStatus>("idle");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadAll() {
      setStatus("saving");
      setRuntimeStatus("saving");
      setError(null);
      setRuntimeError(null);
      setIsLoading(true);

      try {
        const [settingsResponse, runtimeResponse] = await Promise.all([
          fetch("/api/settings/llm"),
          fetch("/api/settings/runtime"),
        ]);
        const payload = (await settingsResponse.json()) as LlmSettingsResponse | { error: string };
        const runtimePayload = (await runtimeResponse.json()) as RuntimeSettingsResponse | { error: string };

        if (!settingsResponse.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error : "Failed to load settings");
        }

        if (!runtimeResponse.ok || "error" in runtimePayload) {
          throw new Error("error" in runtimePayload ? runtimePayload.error : "Failed to load runtime settings");
        }

        if (!ignore) {
          setSettings(payload);
          setDraft({
            globalDefaultProvider: payload.globalDefaultProvider,
            globalDefaultModel: payload.globalDefaultModel,
            providers: payload.providers.reduce(
              (acc, provider) => {
                acc[provider.provider] = {
                  apiKey: "",
                  clearApiKey: false,
                  defaultModel: provider.defaultModel,
                  enabledModels: provider.enabledModels,
                };
                return acc;
              },
              {} as Record<LlmProvider, ProviderDraft>,
            ),
          });
          setRuntime(runtimePayload);
          setRuntimeDraft(runtimePayload.settings);
          setStatus("idle");
          setRuntimeStatus("idle");
          setIsLoading(false);
        }
      } catch (caught) {
        if (!ignore) {
          const message = caught instanceof Error ? caught.message : "Failed to load settings";
          setRuntimeStatus("error");
          setStatus("error");
          setError(message);
          setRuntimeError(message);
          setIsLoading(false);
        }
      }
    }

    void loadAll();

    return () => {
      ignore = true;
    };
  }, []);

  const providerMap = useMemo(() => {
    if (!settings) {
      return new Map<LlmProvider, LlmSettingsResponse["providers"][number]>();
    }
    return new Map(settings.providers.map((item) => [item.provider, item]));
  }, [settings]);

  function updateProviderDraft(provider: LlmProvider, patch: Partial<ProviderDraft>) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        providers: {
          ...current.providers,
          [provider]: {
            ...current.providers[provider],
            ...patch,
          },
        },
      };
    });
  }

  function toggleModel(provider: LlmProvider, model: string) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const providerDraft = current.providers[provider];
      const exists = providerDraft.enabledModels.includes(model);
      const nextEnabled = exists
        ? providerDraft.enabledModels.filter((entry) => entry !== model)
        : [...providerDraft.enabledModels, model];

      const safeEnabled = nextEnabled.length > 0 ? nextEnabled : [providerDraft.defaultModel];

      return {
        ...current,
        providers: {
          ...current.providers,
          [provider]: {
            ...providerDraft,
            enabledModels: safeEnabled,
            defaultModel: safeEnabled.includes(providerDraft.defaultModel)
              ? providerDraft.defaultModel
              : safeEnabled[0],
          },
        },
      };
    });
  }

  async function saveSettings() {
    if (!settings || !draft) {
      return;
    }

    setStatus("saving");
    setError(null);

    const providers: LlmProviderUpdatePayload[] = settings.providers.map((provider) => ({
      provider: provider.provider,
      apiKey: draft.providers[provider.provider].apiKey.trim() || undefined,
      clearApiKey: draft.providers[provider.provider].clearApiKey || undefined,
      defaultModel: draft.providers[provider.provider].defaultModel,
      enabledModels: draft.providers[provider.provider].enabledModels,
    }));

    const payload: LlmSettingsUpdatePayload = {
      globalDefaultProvider: draft.globalDefaultProvider,
      globalDefaultModel: draft.globalDefaultModel,
      providers,
    };

    try {
      const response = await fetch("/api/settings/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as LlmSettingsResponse | { error: string };

      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Failed to save settings");
      }

      setSettings(result);
      setDraft({
        globalDefaultProvider: result.globalDefaultProvider,
        globalDefaultModel: result.globalDefaultModel,
        providers: result.providers.reduce(
          (acc, provider) => {
            acc[provider.provider] = {
              apiKey: "",
              clearApiKey: false,
              defaultModel: provider.defaultModel,
              enabledModels: provider.enabledModels,
            };
            return acc;
          },
          {} as Record<LlmProvider, ProviderDraft>,
        ),
      });
      setStatus("saved");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Failed to save settings");
    }
  }

  async function saveRuntimeSettings() {
    if (!runtimeDraft) {
      return;
    }

    setRuntimeStatus("saving");
    setRuntimeError(null);

    try {
      const response = await fetch("/api/settings/runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runtimeDraft),
      });

      const result = (await response.json()) as RuntimeSettingsResponse | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Failed to save runtime settings");
      }

      setRuntime(result);
      setRuntimeDraft(result.settings);
      setRuntimeStatus("saved");
    } catch (caught) {
      setRuntimeStatus("error");
      setRuntimeError(caught instanceof Error ? caught.message : "Failed to save runtime settings");
    }
  }

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  if (!settings || !draft || !runtime || !runtimeDraft) {
    return <div className="panel p-6 text-sm text-danger">Failed to load settings.</div>;
  }

  const usagePercent = Math.min(
    100,
    Math.round((runtime.usage.totalTokens / Math.max(1, runtime.settings.monthlyTokenBudget)) * 100),
  );
  const softLimitTokens = Math.round((runtime.settings.monthlyTokenBudget * runtime.settings.softLimitPercent) / 100);

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold">LLM Providers & Models</h2>
            <p className="mt-1 text-sm text-muted">
              Add API keys for major providers and configure global/default model routing.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setWindowOpen(true)}
              className="rounded-lg border bg-bg px-3 py-2 text-sm font-semibold"
            >
              Model Selection Window
            </button>
            <button
              onClick={saveSettings}
              disabled={status === "saving"}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {status === "saving" ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-semibold">Global Default Provider</span>
            <select
              value={draft.globalDefaultProvider}
              onChange={(event) => {
                const nextProvider = event.target.value as LlmProvider;
                setDraft((current) => {
                  if (!current) {
                    return current;
                  }
                  return {
                    ...current,
                    globalDefaultProvider: nextProvider,
                    globalDefaultModel: current.providers[nextProvider].defaultModel,
                  };
                });
              }}
              className="w-full rounded-lg border bg-panel px-3 py-2"
            >
              {settings.providers.map((provider) => (
                <option key={provider.provider} value={provider.provider}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold">Global Default Model</span>
            <select
              value={draft.globalDefaultModel}
              onChange={(event) =>
                setDraft((current) => {
                  if (!current) {
                    return current;
                  }
                  return {
                    ...current,
                    globalDefaultModel: event.target.value,
                  };
                })
              }
              className="w-full rounded-lg border bg-panel px-3 py-2"
            >
              {providerMap
                .get(draft.globalDefaultProvider)
                ?.availableModels.map((model) => <option key={model}>{model}</option>)}
            </select>
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {status === "saved" ? <p className="mt-3 text-sm text-success">Settings saved.</p> : null}
      </section>

      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold">Token Usage & Runtime Controls</h3>
            <p className="mt-1 text-sm text-muted">
              Track estimated token usage and configure budget, response caps, and safety behavior.
            </p>
          </div>
          <button
            onClick={saveRuntimeSettings}
            disabled={runtimeStatus === "saving"}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {runtimeStatus === "saving" ? "Saving..." : "Save Runtime Settings"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border bg-bg p-3">
            <p className="text-xs text-muted">Monthly Budget</p>
            <p className="mt-1 text-lg font-bold">{runtime.settings.monthlyTokenBudget.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-bg p-3">
            <p className="text-xs text-muted">Used Tokens</p>
            <p className="mt-1 text-lg font-bold">{runtime.usage.totalTokens.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-bg p-3">
            <p className="text-xs text-muted">Request Count</p>
            <p className="mt-1 text-lg font-bold">{runtime.usage.requests.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-bg p-3">
            <p className="text-xs text-muted">Soft Limit</p>
            <p className="mt-1 text-lg font-bold">{softLimitTokens.toLocaleString()}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Budget usage</span>
            <span>{usagePercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-bg">
            <div className="h-full rounded-full bg-accent" style={{ width: `${usagePercent}%` }} />
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-semibold">Monthly Token Budget</span>
            <input
              type="number"
              min={10000}
              value={runtimeDraft.monthlyTokenBudget}
              onChange={(event) =>
                setRuntimeDraft((current) =>
                  current
                    ? {
                        ...current,
                        monthlyTokenBudget: Number(event.target.value || 0),
                      }
                    : current,
                )
              }
              className="w-full rounded-lg border bg-panel px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold">Soft Limit Percent</span>
            <input
              type="number"
              min={50}
              max={99}
              value={runtimeDraft.softLimitPercent}
              onChange={(event) =>
                setRuntimeDraft((current) =>
                  current
                    ? {
                        ...current,
                        softLimitPercent: Number(event.target.value || 0),
                      }
                    : current,
                )
              }
              className="w-full rounded-lg border bg-panel px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold">Per Response Token Cap</span>
            <input
              type="number"
              min={256}
              value={runtimeDraft.perResponseTokenCap}
              onChange={(event) =>
                setRuntimeDraft((current) =>
                  current
                    ? {
                        ...current,
                        perResponseTokenCap: Number(event.target.value || 0),
                      }
                    : current,
                )
              }
              className="w-full rounded-lg border bg-panel px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <label className="inline-flex items-center gap-2 rounded-lg border bg-bg px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={runtimeDraft.autoSummarizeOnHighUsage}
              onChange={(event) =>
                setRuntimeDraft((current) =>
                  current
                    ? {
                        ...current,
                        autoSummarizeOnHighUsage: event.target.checked,
                      }
                    : current,
                )
              }
            />
            Auto-summarize on high usage
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border bg-bg px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={runtimeDraft.strictLoopProtection}
              onChange={(event) =>
                setRuntimeDraft((current) =>
                  current
                    ? {
                        ...current,
                        strictLoopProtection: event.target.checked,
                      }
                    : current,
                )
              }
            />
            Strict loop protection mode
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border bg-bg px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={runtimeDraft.strictAgentResponseMode}
              onChange={(event) =>
                setRuntimeDraft((current) =>
                  current
                    ? {
                        ...current,
                        strictAgentResponseMode: event.target.checked,
                      }
                    : current,
                )
              }
            />
            Strict agent response format
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border bg-bg px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={runtimeDraft.allowProviderFallback}
              onChange={(event) =>
                setRuntimeDraft((current) =>
                  current
                    ? {
                        ...current,
                        allowProviderFallback: event.target.checked,
                      }
                    : current,
                )
              }
            />
            Allow provider fallback
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border bg-bg px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={runtimeDraft.redactPiiInMemory}
              onChange={(event) =>
                setRuntimeDraft((current) =>
                  current
                    ? {
                        ...current,
                        redactPiiInMemory: event.target.checked,
                      }
                    : current,
                )
              }
            />
            Redact PII in memory writes
          </label>
        </div>

        <div className="mt-5 rounded-lg border bg-bg p-4">
          <h4 className="text-sm font-bold">Usage by Provider</h4>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {runtime.usage.byProvider.map((item) => (
              <div key={item.provider} className="rounded-lg border bg-panel p-3 text-xs">
                <p className="font-semibold uppercase tracking-wide">{item.provider}</p>
                <p className="mt-1 text-muted">
                  {item.requests} requests · {item.totalTokens.toLocaleString()} tokens
                </p>
              </div>
            ))}
          </div>
        </div>

        {runtimeError ? <p className="mt-3 text-sm text-danger">{runtimeError}</p> : null}
        {runtimeStatus === "saved" ? <p className="mt-3 text-sm text-success">Runtime settings saved.</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {settings.providers.map((provider) => {
          const providerDraft = draft.providers[provider.provider];

          return (
            <article key={provider.provider} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">{providerTitle(provider.label, provider.hasApiKey, provider.apiKeyMasked)}</h3>
                  <p className="mt-1 text-xs text-muted">Default model: {providerDraft.defaultModel}</p>
                </div>
                <span className="badge bg-bg">{provider.availableModels.length} models</span>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold">API Key</span>
                  <input
                    type="password"
                    value={providerDraft.apiKey}
                    onChange={(event) =>
                      updateProviderDraft(provider.provider, {
                        apiKey: event.target.value,
                        clearApiKey: false,
                      })
                    }
                    placeholder={provider.apiKeyMasked ?? `Add ${provider.label} key`}
                    className="w-full rounded-lg border bg-bg px-3 py-2"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={providerDraft.clearApiKey}
                    onChange={(event) =>
                      updateProviderDraft(provider.provider, {
                        clearApiKey: event.target.checked,
                        apiKey: "",
                      })
                    }
                  />
                  Clear saved key
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-semibold">Provider Default Model</span>
                  <select
                    value={providerDraft.defaultModel}
                    onChange={(event) =>
                      updateProviderDraft(provider.provider, {
                        defaultModel: event.target.value,
                        enabledModels: providerDraft.enabledModels.includes(event.target.value)
                          ? providerDraft.enabledModels
                          : [...providerDraft.enabledModels, event.target.value],
                      })
                    }
                    className="w-full rounded-lg border bg-bg px-3 py-2"
                  >
                    {provider.availableModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel p-5">
        <h3 className="text-lg font-bold">Security Notes</h3>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> Keys are masked on read and only replaced when a new key is submitted.
          </li>
          <li className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Provider defaults are separate from global routing defaults.
          </li>
          <li className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Model enablement list controls what each provider can serve.
          </li>
        </ul>
      </section>

      {windowOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="panel max-h-[90vh] w-full max-w-4xl overflow-auto p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-extrabold">Model Selection Window</h3>
              <button onClick={() => setWindowOpen(false)} className="rounded-lg border px-3 py-1 text-sm">
                Close
              </button>
            </div>

            <div className="space-y-4">
              {settings.providers.map((provider) => {
                const providerDraft = draft.providers[provider.provider];
                return (
                  <div key={provider.provider} className="rounded-xl border bg-bg p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-bold">{provider.label}</h4>
                      <span className="text-xs text-muted">{providerDraft.enabledModels.length} enabled</span>
                    </div>

                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block font-semibold">Default Model</span>
                      <select
                        value={providerDraft.defaultModel}
                        onChange={(event) =>
                          updateProviderDraft(provider.provider, {
                            defaultModel: event.target.value,
                            enabledModels: providerDraft.enabledModels.includes(event.target.value)
                              ? providerDraft.enabledModels
                              : [...providerDraft.enabledModels, event.target.value],
                          })
                        }
                        className="w-full rounded-lg border bg-panel px-3 py-2"
                      >
                        {provider.availableModels.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {provider.availableModels.map((model) => {
                        const enabled = providerDraft.enabledModels.includes(model);
                        return (
                          <label key={model} className="inline-flex items-center gap-2 rounded-lg border bg-panel px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => toggleModel(provider.provider, model)}
                            />
                            <span>{model}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setWindowOpen(false)}>
                Keep Editing
              </button>
              <button className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white" onClick={() => setWindowOpen(false)}>
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
