import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function MerchantProfilePage() {
  return (
    <main className="flex-1 flex flex-col min-h-screen bg-[var(--surface-canvas)]">
      <div className="flex-1 w-full max-w-5xl mx-auto p-gutter space-y-8 pb-32">
        <div className="flex flex-col gap-2">
          <h1 className="headline-xl text-[var(--on-surface)]">Merchant Profile</h1>
          <p className="body-md text-[var(--on-surface-variant)]">
            Manage your business identity, contact details, and platform branding preferences.
          </p>
        </div>

        {/* Business Information — 2-col Legal Acme LLC/DBA + 3-col Address + Tax 12-3456789 mono */}
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
                defaultValue="Acme Corporation LLC"
                aria-label="Legal Business Name"
                className="h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dba" className="label-caps text-[var(--on-surface-variant)]">
                Doing Business As (DBA)
              </Label>
              <Input
                id="dba"
                defaultValue="Acme"
                aria-label="Doing Business As"
                className="h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)]"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="address" className="label-caps text-[var(--on-surface-variant)]">
                Registered Address
              </Label>
              <Input
                id="address"
                defaultValue="123 Financial Plaza, Suite 400"
                aria-label="Registered Address"
                className="h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)] mb-3"
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  defaultValue="New York"
                  aria-label="City"
                  className="h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)]"
                />
                <Input
                  defaultValue="NY"
                  aria-label="State"
                  className="h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)]"
                />
                <Input
                  defaultValue="10004"
                  aria-label="ZIP code"
                  className="h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)]"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tax-id" className="label-caps text-[var(--on-surface-variant)]">
                Tax ID (EIN)
              </Label>
              <Input
                id="tax-id"
                defaultValue="12-3456789"
                aria-label="Tax ID"
                className="h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)] data-mono"
              />
            </div>
          </div>
        </section>

        {/* Branding — logo alt + Upload New + Color #1a56db swatch */}
        <section className="bg-[var(--surface-container-lowest)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface)]/50">
            <h2 className="headline-md text-[var(--on-surface)]">Platform Branding</h2>
          </div>
          <div className="p-6 flex flex-col md:flex-row gap-8">
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
                <Label className="label-caps text-[var(--on-surface-variant)]">Brand Logo</Label>
                <p className="body-sm text-[var(--on-surface-variant)] mb-3">Appears on checkout pages and receipts.</p>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded border border-[var(--outline-variant)] bg-[var(--surface-container-highest)] flex items-center justify-center overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="Company Logo"
                      className="w-full h-full object-cover"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuBG2zIJTW2oZwBPQe4szZvIp0bP8_vupP04z_g7nxbcO-eybPITl8rgr_J4BTEauLXjGMVVnVGrMU1qFNS7iWEdXVv_trIvzfYkaxNeknMaW_7hG4kb2pL0nRLVOKtoOs7wD9BmXgGMYmrabvZotdohv87ZBO3oZUYY91EAGK33C9BkUbUFsFsRHry52K0j9oB7HLd4s4gIPKijfgLHUzYGOARytljBKp0DauwX_gQJ0NBZqt0VythY"
                    />
                  </div>
                  <Button
                    variant="outline"
                    aria-label="Upload new logo"
                    className="h-9 border border-[var(--outline-variant)] bg-white text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
                  >
                    Upload New
                  </Button>
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
                    aria-label="Color swatch #1a56db"
                    className="w-9 h-9 rounded border border-[var(--outline-variant)] bg-[var(--primary-container)] shadow-sm shrink-0"
                    style={{ backgroundColor: "#1a56db" }}
                  />
                  <Input
                    id="brand-color"
                    defaultValue="#1a56db"
                    aria-label="Primary Brand Color"
                    className="w-32 h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface)] data-mono uppercase"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Sticky Action Footer — Cancel/Save */}
      <div className="fixed bottom-0 left-0 right-0 md:ml-[var(--sidebar-width)] bg-[var(--surface-container-lowest)] border-t border-[var(--border-subtle)] p-4 px-gutter flex justify-end gap-3 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <Button
          variant="ghost"
          aria-label="Cancel"
          className="h-9 px-4 font-semibold text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
        >
          Cancel
        </Button>
        <Button
          aria-label="Save Changes"
          className="h-9 px-6 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] font-semibold shadow-sm"
        >
          Save Changes
        </Button>
      </div>
    </main>
  );
}
