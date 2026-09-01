import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function KycPage() {
  return (
    <main className="mx-auto max-w-container-max p-gutter">
      <div className="mb-8">
        <h1 className="headline-xl">Identity Verification</h1>
        <p className="body-md mt-2 text-[var(--on-surface-variant)]">
          Complete your business KYC to unlock full ledger capabilities.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12 items-start">
        {/* Left sidebar: 4 steps */}
        <aside className="rounded-xl border border-[var(--border-subtle)] bg-white p-6 lg:col-span-3 lg:sticky lg:top-[100px]" aria-label="Verification steps">
          <h2 className="headline-md mb-6 border-b border-[var(--border-subtle)] pb-4">Verification Steps</h2>
          <ol className="relative space-y-6 border-l-2 border-[var(--surface-container-high)]">
            <li className="ml-6">
              <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-white" aria-hidden="true">
                <span className="material-symbols-outlined text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check
                </span>
              </span>
              <h3 className="headline-md leading-tight">Basic Info</h3>
              <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Company name &amp; details</p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] ring-4 ring-white" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-white" />
              </span>
              <h3 className="headline-md leading-tight text-[var(--primary)]">Business Documents</h3>
              <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Upload incorporation proof</p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-container-high)] ring-4 ring-white" aria-hidden="true" />
              <h3 className="headline-md leading-tight text-[var(--on-surface-variant)]">Beneficial Owners</h3>
              <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Identify key stakeholders</p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-container-high)] ring-4 ring-white" aria-hidden="true" />
              <h3 className="headline-md leading-tight text-[var(--on-surface-variant)]">Final Review</h3>
              <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Submit for approval</p>
            </li>
          </ol>
        </aside>

        {/* Main content */}
        <div className="space-y-6 lg:col-span-9">
          {/* Secure shield banner — mobile 165 + desktop info card */}
          <div className="flex items-start gap-4 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-6">
            <div className="shrink-0 rounded-lg bg-[var(--primary)]/10 p-2">
              <span className="material-symbols-outlined text-[var(--primary)]" aria-hidden="true">
                shield
              </span>
            </div>
            <div>
              <h3 className="headline-md">Secure Document Submission</h3>
              <p className="body-md mt-2 text-[var(--on-surface-variant)]">
                To comply with global anti-money laundering (AML) regulations, we require official documentation proving your
                entity&apos;s registration. These documents are encrypted at rest. Your data is encrypted end-to-end and stored
                securely according to banking-grade standards.
              </p>
            </div>
          </div>

          {/* Main form card */}
          <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-canvas)]/50 p-6">
              <div>
                <h2 className="headline-lg">Upload Business Documents</h2>
                <p className="body-sm mt-1 text-[var(--on-surface-variant)]">Accepted formats: PDF, JPEG, PNG (Max 10MB)</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                <span className="label-caps uppercase tracking-wider text-amber-700">Action Required</span>
              </span>
            </div>

            <div className="space-y-8 p-6">
              {/* Document Type + Jurisdiction */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="label-caps text-[var(--on-surface-variant)]">Document Type</Label>
                  <Select defaultValue="incorporation">
                    <SelectTrigger aria-label="Document Type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="incorporation">Certificate of Incorporation</SelectItem>
                      <SelectItem value="articles">Articles of Association</SelectItem>
                      <SelectItem value="license">Business License</SelectItem>
                      <SelectItem value="tax">Tax Registration Certificate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jurisdiction" className="label-caps text-[var(--on-surface-variant)]">
                    Issuing Jurisdiction
                  </Label>
                  <Input id="jurisdiction" placeholder="e.g., Delaware, USA" />
                </div>
              </div>

              {/* Drag and drop */}
              <div className="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[var(--border-subtle)] bg-white p-10 transition-colors hover:bg-[var(--surface-container-low)]">
                <div className="mb-4 rounded-full bg-[var(--surface-container-high)] p-4 transition-transform duration-300 group-hover:scale-110">
                  <span className="material-symbols-outlined text-3xl text-[var(--on-surface-variant)]" aria-hidden="true">
                    cloud_upload
                  </span>
                </div>
                <h3 className="headline-md text-center">Drag and drop your file here</h3>
                <p className="body-sm mt-2 text-center text-[var(--on-surface-variant)]">or click to browse from your computer</p>
                <input aria-label="Upload document" type="file" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </div>

              {/* Attached Files */}
              <div className="space-y-3">
                <h3 className="label-caps uppercase text-[var(--on-surface-variant)]">Attached Files</h3>
                <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-white p-3 transition-colors hover:bg-[var(--surface-container-low)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
                      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                        description
                      </span>
                    </div>
                    <div>
                      <p className="body-md font-medium">acme_corp_incorporation_2023.pdf</p>
                      <p className="data-mono mt-0.5 text-xs text-[var(--on-surface-variant)]">2.4 MB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                        check_circle
                      </span>
                      Uploaded
                    </span>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete acme_corp_incorporation_2023.pdf">
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                        delete
                      </span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Action bar */}
              <div className="flex justify-end gap-3 border-t border-[var(--border-subtle)] pt-6">
                <Button variant="outline" aria-label="Save draft">
                  Save Draft
                </Button>
                <Button aria-label="Submit step">
                  Submit Step
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    arrow_forward
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
