import * as React from "react"
import { cn } from "@/lib/utils"

type CardProps = React.ComponentProps<"div"> & {
  render?: React.ReactElement
}

function Card({ className, render, children, ...props }: CardProps) {
  const classes = cn(
    "rounded-xl bg-card text-card-foreground shadow ring shadow-black/6.5 ring-border",
    className
  )

  if (render) {
    const renderProps = render.props as {
      className?: string
      children?: React.ReactNode
    }

    return React.cloneElement(
      render as React.ReactElement<Record<string, unknown>>,
      {
        ...props,
        className: cn(classes, renderProps.className),
        // Prefer children already provided inside `render={...}`
        children: children ?? renderProps.children,
      }
    )
  }

  return (
    <div data-slot="card" className={classes} {...props}>
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 p-6", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-6 pt-0", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
