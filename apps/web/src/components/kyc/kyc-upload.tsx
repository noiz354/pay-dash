"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format";
import { KYC_DOC_TYPES, isAcceptedKycFile } from "@/lib/kyc-options";
import {
  removeKycDocumentAction,
  submitKycDocumentAction,
  type ActionState,
} from "@/server/actions/kyc";
import type { KycSubmission } from "@/server/data/kyc";

// The real upload surface (ADR-0019): the file input has an onChange, the
// attached file comes from the store (not a hard-coded acme row), Remove and
// Submit are server actions, and the 10 MB / format limits stated on the
// page are actually enforced.
export function KycUpload({ submission }: { submission: KycSubmission | null }) {
  const [file, setFile] = React.useState<{ name: string; size: number } | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [docType, setDocType] = React.useState<string>(submission?.docType ?? "incorporation");
  const [jurisdiction, setJurisdiction] = React.useState(submission?.jurisdiction ?? "");

  const [state, formAction] = useActionState(submitKycDocumentAction, {
    status: "idle",
    message: "",
  } as ActionState<{ fileName: string }>);
  const [removeState, removeAction] = useActionState(removeKycDocumentAction, {
    status: "idle",
    message: "",
  } as ActionState);

  const handled = React.useRef<typeof removeState | null>(null);
  React.useEffect(() => {
    if (removeState === handled.current || removeState.status === "idle") return;
    handled.current = removeState;
    if (removeState.status === "success") {
      toast.success(removeState.message);
    } else if (removeState.status === "error") {
      toast.error(removeState.message);
    }
  }, [removeState]);

  // Once the store holds a submission, the attached row is the stored record,
  // not the client's in-flight pick.
  React.useEffect(() => {
    if (submission) setFile(null);
  }, [submission]);

  const hasSubmission = !!submission;
  const activeFile = file ?? (submission ? { name: submission.fileName, size: submission.sizeBytes } : null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const error = isAcceptedKycFile(f);
    if (error) {
      setFileError(error);
      setFile(null);
      return;
    }
    setFileError(null);
    setFile({ name: f.name, size: f.size });
  };

  return (
    <div className="space-y-8 p-6">
      {/* Document Type + Jurisdiction */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="kyc-doc-type" className="label-caps text-[var(--on-surface-variant)]">
            Document Type
          </Label>
          <NativeSelect
            id="kyc-doc-type"
            name="docType"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
          >
            {KYC_DOC_TYPES.map((t) => (
              <NativeSelectOption key={t.value} value={t.value}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kyc-jurisdiction" className="label-caps text-[var(--on-surface-variant)]">
            Issuing Jurisdiction
          </Label>
          <Input
            id="kyc-jurisdiction"
            name="jurisdiction"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            placeholder="e.g. Indonesia (KemenkumHAM)"
            className="border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
          />
        </div>
      </div>

      {/* File pick */}
      <label
        htmlFor="kyc-file"
        className="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-10 transition-colors hover:bg-[var(--surface-container-low)]"
      >
        <div className="mb-4 rounded-full bg-[var(--surface-container-high)] p-4 transition-transform duration-300 group-hover:scale-110">
          <span className="material-symbols-outlined text-3xl text-[var(--on-surface-variant)]">
            cloud_upload
          </span>
        </div>
        <h3 className="headline-md text-center text-[var(--on-surface)]">Drag and drop your file here</h3>
        <p className="body-sm mt-2 text-center text-[var(--on-surface-variant)]">
          or click to browse from your computer
        </p>
        <input
          id="kyc-file"
          aria-label="Upload document"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={onFileChange}
        />
      </label>
      {fileError ? (
        <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
          {fileError}
        </p>
      ) : null}

      {/* Attached file — the freshly picked file, or the stored submission */}
      {activeFile ? (
        <div className="space-y-3">
          <h3 className="label-caps text-[var(--on-surface-variant)]">Attached file</h3>
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-3">
            <div className="flex items-center gap-3">
              <div className="rounded bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
                <span className="material-symbols-outlined text-[20px]">description</span>
              </div>
              <div>
                <p className="body-md font-medium text-[var(--on-surface)] break-all">{activeFile.name}</p>
                <p className="data-mono mt-0.5 text-xs text-[var(--on-surface-variant)]">
                  {formatBytes(activeFile.size)}
                  {hasSubmission && !file ? " · submitted" : ""}
                </p>
              </div>
            </div>
            {hasSubmission && !file ? (
              <form action={removeAction} className="flex items-center gap-2">
                <RemoveButton />
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <p className="body-sm text-[var(--failed-status)]" role="alert">
          {state.message}
        </p>
      ) : null}

      {/* Submit — hidden inputs carry the file metadata into the action */}
      <form action={formAction} className="flex justify-end gap-3 border-t border-[var(--border-subtle)] pt-6">
        <input type="hidden" name="fileName" value={file?.name ?? ""} />
        <input type="hidden" name="sizeBytes" value={file ? String(file.size) : ""} />
        <SubmitButton disabled={!!fileError} />
      </form>
    </div>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled}
      aria-label="Submit for review"
      className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] disabled:opacity-50 min-w-[12rem]"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Submitting…
        </span>
      ) : (
        <>
          Submit for review
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_forward
          </span>
        </>
      )}
    </Button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      aria-label="Remove submission"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
    >
      {pending ? (
        <Spinner className="size-4" />
      ) : (
        <span className="material-symbols-outlined text-[18px]">delete</span>
      )}
    </Button>
  );
}
