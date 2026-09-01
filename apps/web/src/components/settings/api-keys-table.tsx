import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/common/copy-button";
import { EmptyState } from "@/components/common/empty-state";
import { ApiKeyRowActions } from "@/components/settings/api-key-row-actions";
import { CreateApiKeyDialog } from "@/components/settings/create-api-key-dialog";
import { formatDateLong, formatRelative } from "@/lib/format";
import type { ApiKey } from "@/server/data/settings";

// Key list for one environment. Replaces three hard-coded rows with real data,
// a working copy control, an overflow menu that actually mutates, revoked-state
// styling and an empty state that offers the create action.
export function ApiKeysTable({
  title,
  description,
  environment,
  keys,
}: {
  title: string;
  description: string;
  environment: "LIVE" | "TEST";
  keys: ApiKey[];
}) {
  const active = keys.filter((k) => k.status === "ACTIVE").length;

  return (
    <section className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]/50">
        <div>
          <h2 className="headline-md flex items-center gap-2 text-[var(--on-surface)]">
            {title}
            <Badge
              className={
                environment === "LIVE"
                  ? "bg-[var(--primary-container)] text-[var(--on-surface)]"
                  : "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"
              }
            >
              {active} active
            </Badge>
          </h2>
          <p className="body-sm text-[var(--on-surface-variant)]">{description}</p>
        </div>
        <CreateApiKeyDialog
          defaultEnvironment={environment}
          triggerLabel={`New ${environment === "LIVE" ? "live" : "test"} key`}
        />
      </div>

      {keys.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon="key_off"
            title={`No ${environment.toLowerCase()} keys yet`}
            description="Create a scoped key to start calling the API from this environment."
            action={<CreateApiKeyDialog defaultEnvironment={environment} triggerLabel="Create key" />}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th scope="col" className="label-caps px-6 py-3 text-[var(--on-surface-variant)]">Name</th>
                <th scope="col" className="label-caps px-6 py-3 text-[var(--on-surface-variant)]">Key</th>
                <th scope="col" className="label-caps px-6 py-3 text-[var(--on-surface-variant)]">Scopes</th>
                <th scope="col" className="label-caps px-6 py-3 text-[var(--on-surface-variant)]">Created</th>
                <th scope="col" className="label-caps px-6 py-3 text-[var(--on-surface-variant)]">Last used</th>
                <th scope="col" className="label-caps px-6 py-3 text-right text-[var(--on-surface-variant)]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {keys.map((key) => (
                <tr
                  key={key.id}
                  className={key.status === "REVOKED" ? "opacity-60" : undefined}
                  data-testid={`api-key-row-${key.id}`}
                >
                  <td className="px-6 py-4">
                    <div className="label-md text-[var(--on-surface)]">{key.name}</div>
                    {key.status === "REVOKED" ? (
                      <Badge className="mt-1 bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
                        Revoked
                      </Badge>
                    ) : null}
                    {key.rolledFrom ? (
                      <div className="body-sm text-xs text-[var(--on-surface-variant)]">
                        Rolled from {key.rolledFrom}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <code className="data-mono text-sm text-[var(--on-surface)]">{key.maskedSecret}</code>
                      <CopyButton value={key.maskedSecret} label="Copy" />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <Badge
                          key={scope}
                          className="bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"
                        >
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="body-sm px-6 py-4 text-[var(--on-surface-variant)]">
                    {formatDateLong(key.createdAt)}
                  </td>
                  <td className="body-sm px-6 py-4 text-[var(--on-surface-variant)]">
                    {key.lastUsedAt ? formatRelative(key.lastUsedAt) : "Never used"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ApiKeyRowActions
                      id={key.id}
                      name={key.name}
                      status={key.status}
                      maskedSecret={key.maskedSecret}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
