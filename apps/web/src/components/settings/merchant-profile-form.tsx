"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { isValidHexColor } from "@/lib/settings-options";
import { updateMerchantProfileAction, type ActionState } from "@/server/actions/settings";

export type MerchantProfileFormValues = {
  legalName: string;
  dba: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  taxId: string;
  supportEmail: string;
  statementDescriptor: string;
  brandColor: string;
  logoUrl: string;
  autoDebit: boolean;
  updatedAt: string | null;
};

const initialState: ActionState = { status: "idle", message: "" };

const fieldClass =
  "h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)]";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
      {errors[0]}
    </p>
  );
}

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || !dirty}
      aria-disabled={pending || !dirty}
      aria-label="Save Changes"
      className="h-9 px-6 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] font-semibold shadow-sm disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Saving…
        </span>
      ) : (
        "Save Changes"
      )}
    </Button>
  );
}

/**
 * The merchant profile as an actual form.
 * The prototype rendered the same fields with `defaultValue` literals and a
 * Save button that did nothing; this keeps the layout, adds a real
 * `<form action>`, dirty tracking (Cancel/Save stay disabled until something
 * changes), inline validation errors and a live brand-colour swatch.
 */
export function MerchantProfileForm({ profile }: { profile: MerchantProfileFormValues }) {
  const [state, formAction] = useActionState(updateMerchantProfileAction, initialState);
  const formRef = React.useRef<HTMLFormElement>(null);
  const handled = React.useRef<ActionState | null>(null);

  const [values, setValues] = React.useState(profile);
  const [baseline, setBaseline] = React.useState(profile);

  React.useEffect(() => {
    setValues(profile);
    setBaseline(profile);
  }, [profile]);

  const dirty = React.useMemo(
    () => (Object.keys(baseline) as (keyof MerchantProfileFormValues)[]).some((k) => values[k] !== baseline[k]),
    [values, baseline]
  );

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      setBaseline(values);
      toast.success(state.message);
    } else {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Warn before losing unsaved edits — the prototype let you navigate away silently.
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = <K extends keyof MerchantProfileFormValues>(key: K, value: MerchantProfileFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const colorValid = isValidHexColor(values.brandColor);

  return (
    <form ref={formRef} action={formAction} className="contents">
      <div className="space-y-8">
        {/* Business Information */}
        <section className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]/50">
            <h2 className="headline-md text-[var(--on-surface)]">Business Information</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <Label htmlFor="legal-name" className="label-caps text-[var(--on-surface-variant)]">
                Legal Business Name
              </Label>
              <Input
                id="legal-name"
                name="legalName"
                value={values.legalName}
                onChange={(e) => set("legalName", e.target.value)}
                aria-label="Legal Business Name"
                aria-invalid={Boolean(state.fieldErrors?.legalName)}
                className={fieldClass}
              />
              <FieldError errors={state.fieldErrors?.legalName} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dba" className="label-caps text-[var(--on-surface-variant)]">
                Doing Business As (DBA)
              </Label>
              <Input
                id="dba"
                name="dba"
                value={values.dba}
                onChange={(e) => set("dba", e.target.value)}
                aria-label="Doing Business As"
                className={fieldClass}
              />
              <FieldError errors={state.fieldErrors?.dba} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="address" className="label-caps text-[var(--on-surface-variant)]">
                Registered Address
              </Label>
              <Input
                id="address"
                name="address"
                value={values.address}
                onChange={(e) => set("address", e.target.value)}
                aria-label="Registered Address"
                className={`${fieldClass} mb-3`}
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  name="city"
                  value={values.city}
                  onChange={(e) => set("city", e.target.value)}
                  aria-label="City"
                  className={fieldClass}
                />
                <Input
                  name="state"
                  value={values.state}
                  onChange={(e) => set("state", e.target.value)}
                  aria-label="State"
                  className={fieldClass}
                />
                <Input
                  name="postalCode"
                  value={values.postalCode}
                  onChange={(e) => set("postalCode", e.target.value)}
                  aria-label="ZIP code"
                  className={fieldClass}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FieldError errors={state.fieldErrors?.city} />
                <FieldError errors={state.fieldErrors?.state} />
                <FieldError errors={state.fieldErrors?.postalCode} />
              </div>
              <FieldError errors={state.fieldErrors?.address} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tax-id" className="label-caps text-[var(--on-surface-variant)]">
                Tax ID (EIN)
              </Label>
              <Input
                id="tax-id"
                name="taxId"
                value={values.taxId}
                onChange={(e) => set("taxId", e.target.value)}
                aria-label="Tax ID"
                className={`${fieldClass} data-mono`}
              />
              <FieldError errors={state.fieldErrors?.taxId} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="support-email" className="label-caps text-[var(--on-surface-variant)]">
                Support Email
              </Label>
              <Input
                id="support-email"
                name="supportEmail"
                type="email"
                value={values.supportEmail}
                onChange={(e) => set("supportEmail", e.target.value)}
                aria-label="Support Email"
                aria-invalid={Boolean(state.fieldErrors?.supportEmail)}
                className={fieldClass}
              />
              <p className="body-sm text-xs text-[var(--on-surface-variant)]">
                Printed on receipts and dispute correspondence.
              </p>
              <FieldError errors={state.fieldErrors?.supportEmail} />
            </div>
          </div>
        </section>

        {/* Platform Branding */}
        <section className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]/50">
            <h2 className="headline-md text-[var(--on-surface)]">Platform Branding</h2>
          </div>
          <div className="p-6 flex flex-col md:flex-row gap-8">
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
                <Label className="label-caps text-[var(--on-surface-variant)]">Brand Logo</Label>
                <p className="body-sm text-[var(--on-surface-variant)] mb-3">
                  Appears on checkout pages and receipts.
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded border border-[var(--outline-variant)] bg-[var(--surface-container-highest)] flex items-center justify-center overflow-hidden shrink-0">
                    {values.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="Company Logo" className="w-full h-full object-cover" src={values.logoUrl} />
                    ) : (
                      <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]" aria-hidden="true">
                        image
                      </span>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="logo-url" className="label-caps text-[var(--on-surface-variant)]">
                      Logo URL
                    </Label>
                    <Input
                      id="logo-url"
                      name="logoUrl"
                      value={values.logoUrl}
                      onChange={(e) => set("logoUrl", e.target.value)}
                      placeholder="https://cdn.example.com/logo.png"
                      aria-label="Logo URL"
                      className={fieldClass}
                    />
                    <FieldError errors={state.fieldErrors?.logoUrl} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
                <Label htmlFor="brand-color" className="label-caps text-[var(--on-surface-variant)]">
                  Primary Brand Color
                </Label>
                <div className="flex items-center gap-3 mt-2">
                  <div
                    aria-label={`Color swatch ${values.brandColor}`}
                    className="w-9 h-9 rounded border border-[var(--outline-variant)] shadow-sm shrink-0"
                    style={{ backgroundColor: colorValid ? values.brandColor : "transparent" }}
                  />
                  <Input
                    id="brand-color"
                    name="brandColor"
                    value={values.brandColor}
                    onChange={(e) => set("brandColor", e.target.value)}
                    aria-label="Primary Brand Color"
                    aria-invalid={!colorValid}
                    className="w-32 h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)] data-mono uppercase"
                  />
                  <input
                    type="color"
                    aria-label="Pick brand colour"
                    value={colorValid ? values.brandColor : "#1a56db"}
                    onChange={(e) => set("brandColor", e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border border-[var(--outline-variant)] bg-transparent p-0.5"
                  />
                </div>
                {!colorValid ? (
                  <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                    Use a hex colour such as #1a56db
                  </p>
                ) : null}
                <FieldError errors={state.fieldErrors?.brandColor} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="statement-descriptor" className="label-caps text-[var(--on-surface-variant)]">
                  Statement Descriptor
                </Label>
                <Input
                  id="statement-descriptor"
                  name="statementDescriptor"
                  value={values.statementDescriptor}
                  onChange={(e) => set("statementDescriptor", e.target.value.toUpperCase())}
                  maxLength={22}
                  aria-label="Statement Descriptor"
                  className={`${fieldClass} data-mono uppercase`}
                />
                <p className="body-sm text-xs text-[var(--on-surface-variant)]">
                  {values.statementDescriptor.length}/22 characters — shown on the cardholder statement.
                </p>
                <FieldError errors={state.fieldErrors?.statementDescriptor} />
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] p-3">
                <input type="hidden" name="autoDebit" value={values.autoDebit ? "on" : "off"} />
                <Switch
                  aria-label="Auto-debit platform invoices"
                  checked={values.autoDebit}
                  onCheckedChange={(checked: boolean) => set("autoDebit", checked)}
                />
                <span>
                  <span className="label-md block text-[var(--on-surface)]">Auto-debit platform invoices</span>
                  <span className="body-sm block text-[var(--on-surface-variant)]">
                    Collect monthly statements automatically on the due date.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </section>

        {baseline.updatedAt ? (
          <p className="body-sm text-[var(--on-surface-variant)]">
            Last saved {new Date(baseline.updatedAt).toLocaleString()}.
          </p>
        ) : null}
      </div>

      {/* Sticky Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 md:ml-[var(--sidebar-width)] bg-[var(--surface-container-lowest)] border-t border-[var(--border-subtle)] p-4 px-gutter flex items-center justify-end gap-3 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <span
          className="body-sm mr-auto text-[var(--on-surface-variant)]"
          role="status"
          aria-live="polite"
        >
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button
          type="button"
          variant="ghost"
          aria-label="Cancel"
          disabled={!dirty}
          onClick={() => setValues(baseline)}
          className="h-9 px-4 font-semibold text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] disabled:opacity-50"
        >
          Cancel
        </Button>
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}
