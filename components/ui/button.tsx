import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// House rules: every button is a pill; cards are 14px, inputs 9px. The default button is the amber bulb, the one primary action per screen.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out-expo outline-none select-none focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-felt active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.1em]",
  {
    variants: {
      variant: {
        default:
          "bg-bulb font-semibold text-bulb-ink shadow-bulb hover:bg-[#ffc04f] hover:shadow-[0_10px_26px_-10px_rgb(255_181_52/0.8)]",
        outline: "border-line bg-felt-2 text-letter hover:border-line-2 hover:bg-felt-3",
        secondary: "bg-felt-3 text-letter hover:bg-line",
        ghost: "text-dim hover:bg-felt-3 hover:text-letter",
        destructive: "bg-down/15 text-down hover:bg-down/25",
        link: "rounded-none px-0 text-dim underline decoration-line-2 underline-offset-4 hover:text-letter hover:decoration-current",
      },
      size: {
        default: "h-10 px-4",
        xs: "h-7 gap-1 px-2.5 text-xs",
        sm: "h-9 px-3.5",
        lg: "h-11 px-6 text-[0.95rem]",
        icon: "size-10",
        "icon-xs": "size-7",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
