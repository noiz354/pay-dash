import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-[0.25rem] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50 disabled:pointer-events-none h-9 px-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[#1a56db]",
        outline: "border border-[var(--outline-variant)] bg-white hover:bg-[var(--surface-container)]",
        ghost: "hover:bg-[var(--surface-container)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
