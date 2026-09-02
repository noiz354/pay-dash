// Client-safe KYC vocabulary (ADR-0019).
export const KYC_DOC_TYPES = [
  { value: "incorporation", label: "Certificate of Incorporation" },
  { value: "articles", label: "Articles of Association" },
  { value: "license", label: "Business License" },
  { value: "tax", label: "Tax Registration Certificate" },
] as const;

export type KycDocumentTypeValue = (typeof KYC_DOC_TYPES)[number]["value"];

export const KYC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — as stated on the page

export const KYC_ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function isAcceptedKycFile(file: { type: string; size: number }): string | null {
  if (!KYC_ACCEPTED_TYPES.includes(file.type)) {
    return "Accepted formats: PDF, JPEG or PNG.";
  }
  if (file.size > KYC_MAX_BYTES) {
    return "File is larger than the 10 MB limit.";
  }
  return null;
}
