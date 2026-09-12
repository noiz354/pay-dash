"use client";
import * as React from "react";
import Link from "next/link";

/**
 * SkipLink — Accessibility Component
 * 
 * Provides keyboard-accessible skip link to main content
 * Hidden visually but accessible to screen readers and keyboard users
 * First focusable element on the page
 */

export interface SkipLinkProps {
  /** Target element ID (default: "main-content") */
  targetId?: string;
  /** Link text (default: "Skip to main content") */
  children?: React.ReactNode;
}

export function SkipLink({ targetId = "main-content", children = "Skip to main content" }: SkipLinkProps) {
  return (
    <Link
      href={`#${targetId}`}
      className="skip-link"
      aria-label={typeof children === "string" ? children : "Skip to main content"}
    >
      {children}
    </Link>
  );
}

/**
 * CSS for skip link (should be added to globals.css)
 * 
 * .skip-link {
 *   position: absolute;
 *   top: -40px;
 *   left: 0;
 *   background: var(--primary);
 *   color: var(--on-primary);
 *   padding: 8px 16px;
 *   z-index: 100;
 *   transition: top 0.15s ease-in-out;
 * }
 * 
 * .skip-link:focus {
 *   top: 0;
 *   outline: 2px solid var(--on-primary);
 *   outline-offset: 2px;
 * }
 * 
 * @media (prefers-reduced-motion: reduce) {
 *   .skip-link {
 *     transition: none;
 *   }
 * }
 */

/**
 * Main content wrapper that adds the skip link target
 */

export interface MainContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MainContent({ children, className }: MainContentProps) {
  return (
    <main id="main-content" className={className} tabIndex={-1}>
      {children}
    </main>
  );
}
