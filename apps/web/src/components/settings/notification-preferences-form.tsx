"use client";

import * as React from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  DIGEST_LABELS,
  DIGEST_OPTIONS,
  type DigestFrequency,
  type NotificationChannel,
} from "@/lib/settings-options";
import {
  updateNotificationChannelAction,
  updateNotificationPreferenceAction,
} from "@/server/actions/settings";

export type TopicView = {
  id: string;
  label: string;
  description: string;
  critical: boolean;
  digest: DigestFrequency;
  dashboard: boolean;
  sms: boolean;
  email: boolean;
};

type Props = {
  channels: Record<NotificationChannel, boolean>;
  topics: TopicView[];
  updatedAt: string | null;
};

const CHANNEL_META: { id: NotificationChannel; label: string; description: string; icon: string }[] = [
  { id: "email", label: "Email Notifications", description: "Receipts, digests and alerts by email.", icon: "mail" },
  { id: "sms", label: "SMS Alerts", description: "High-urgency alerts to the on-call number.", icon: "sms" },
  { id: "dashboard", label: "Dashboard Feed", description: "In-app activity feed and bell badge.", icon: "notifications_active" },
];

/**
 * Notification preferences with optimistic writes.
 * Every switch and select used to be uncontrolled decoration. Each control now
 * flips immediately, calls its Server Action, and rolls back with an error
 * toast if the write is rejected (e.g. muting a critical alert).
 */
export function NotificationPreferencesForm({ channels, topics, updatedAt }: Props) {
  const [channelState, setChannelState] = React.useState(channels);
  const [topicState, setTopicState] = React.useState(topics);
  const [pending, setPending] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => setChannelState(channels), [channels]);
  React.useEffect(() => setTopicState(topics), [topics]);

  const commitChannel = (channel: NotificationChannel, enabled: boolean) => {
    const previous = channelState;
    setChannelState({ ...channelState, [channel]: enabled });
    setPending(`channel:${channel}`);
    const data = new FormData();
    data.set("channel", channel);
    if (enabled) data.set("enabled", "on");
    startTransition(async () => {
      const result = await updateNotificationChannelAction(undefined, data);
      setPending(null);
      if (result.status === "success") toast.success(result.message);
      else {
        setChannelState(previous);
        toast.error(result.message);
      }
    });
  };

  const commitTopic = (topicId: string, patch: Partial<TopicView>, key: string) => {
    const previous = topicState;
    setTopicState((prev) => prev.map((t) => (t.id === topicId ? { ...t, ...patch } : t)));
    setPending(`${topicId}:${key}`);
    const data = new FormData();
    data.set("topicId", topicId);
    if (patch.digest !== undefined) data.set("digest", patch.digest);
    if (patch.dashboard !== undefined) data.set("dashboard", patch.dashboard ? "on" : "off");
    if (patch.sms !== undefined) data.set("sms", patch.sms ? "on" : "off");
    if (patch.email !== undefined) data.set("email", patch.email ? "on" : "off");
    startTransition(async () => {
      const result = await updateNotificationPreferenceAction(undefined, data);
      setPending(null);
      if (result.status === "success") toast.success(result.message);
      else {
        setTopicState(previous);
        toast.error(result.message);
      }
    });
  };

  const mutedCount = topicState.filter((t) => t.digest === "off").length;

  return (
    <div className="space-y-8">
      <section className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]/50">
          <h2 className="headline-md text-[var(--on-surface)]">Global Channels</h2>
          <span className="body-sm flex items-center gap-2 text-[var(--on-surface-variant)]" role="status" aria-live="polite">
            {isPending ? (
              <>
                <Spinner className="size-3.5" /> Saving…
              </>
            ) : updatedAt ? (
              `Saved ${new Date(updatedAt).toLocaleTimeString()}`
            ) : (
              "Autosaves on change"
            )}
          </span>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {CHANNEL_META.map((channel) => (
            <div key={channel.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]" aria-hidden="true">
                  {channel.icon}
                </span>
                <div>
                  <p className="label-md text-[var(--on-surface)]">{channel.label}</p>
                  <p className="body-sm text-[var(--on-surface-variant)]">{channel.description}</p>
                </div>
              </div>
              <Switch
                aria-label={channel.label}
                checked={channelState[channel.id]}
                disabled={pending === `channel:${channel.id}`}
                onCheckedChange={(checked: boolean) => commitChannel(channel.id, checked)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]/50">
          <h2 className="headline-md text-[var(--on-surface)]">Per-Event Preferences</h2>
          {mutedCount ? (
            <Badge className="bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
              {mutedCount} muted
            </Badge>
          ) : null}
        </div>

        <div className="hidden md:grid grid-cols-[2fr_1fr_auto_auto] items-center gap-4 px-6 py-2 border-b border-[var(--border-subtle)]">
          <span className="label-caps text-[var(--on-surface-variant)]">Event</span>
          <span className="label-caps text-[var(--on-surface-variant)]">Email frequency</span>
          <span className="label-caps text-[var(--on-surface-variant)] w-20 text-center">Dashboard</span>
          <span className="label-caps text-[var(--on-surface-variant)] w-20 text-center">SMS</span>
        </div>

        <div className="divide-y divide-[var(--border-subtle)]">
          {topicState.map((topic) => {
            const locked = topic.critical;
            return (
              <div
                key={topic.id}
                className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto_auto] items-center gap-4 px-6 py-4"
              >
                <div>
                  <p className="label-md flex items-center gap-2 text-[var(--on-surface)]">
                    {topic.label}
                    {locked ? (
                      <Badge className="bg-[var(--failed-status-container,var(--surface-container-high))] text-[var(--on-surface-variant)]">
                        Critical
                      </Badge>
                    ) : null}
                  </p>
                  <p className="body-sm text-[var(--on-surface-variant)]">{topic.description}</p>
                </div>

                <div>
                  <NativeSelect
                    aria-label={`${topic.label} email frequency`}
                    className="w-full"
                    value={topic.digest}
                    disabled={locked || pending === `${topic.id}:digest`}
                    onChange={(e) =>
                      commitTopic(topic.id, { digest: e.target.value as DigestFrequency }, "digest")
                    }
                  >
                    {DIGEST_OPTIONS.map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {locked && option === "instant" ? "Instant (Forced)" : DIGEST_LABELS[option]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>

                <div className="flex w-20 justify-center">
                  <Switch
                    aria-label={`${topic.label} dashboard`}
                    checked={topic.dashboard}
                    disabled={locked || pending === `${topic.id}:dashboard`}
                    onCheckedChange={(checked: boolean) =>
                      commitTopic(topic.id, { dashboard: checked }, "dashboard")
                    }
                  />
                </div>

                <div className="flex w-20 justify-center">
                  <Switch
                    aria-label={`${topic.label} SMS`}
                    checked={topic.sms}
                    disabled={pending === `${topic.id}:sms`}
                    onCheckedChange={(checked: boolean) => commitTopic(topic.id, { sms: checked }, "sms")}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
