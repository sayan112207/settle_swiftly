import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

/**
 * Built on Radix directly rather than on `ui/slider`, for the same reasons
 * `AppCheckbox` is: the primitive fills its range with `bg-primary` (#18A873,
 * banned as a fill) and its thumb sets `focus-visible:outline-none`, which the
 * app's tokens file forbids. `ui/slider` is untouched.
 */
type AppSliderProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  /** Required: the slider sits beside a visible label, not inside one. */
  "aria-label": string;
  /** Read aloud instead of the bare number, e.g. "1.0%" or "10 days". */
  valueText: string;
  className?: string;
};

/** A single-thumb slider in the app's tokens. */
export function AppSlider({
  value,
  min,
  max,
  step,
  onValueChange,
  valueText,
  className,
  ...props
}: AppSliderProps) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(next) => {
        const first = next[0];
        if (first !== undefined) onValueChange(first);
      }}
      className={cn("relative flex h-5 w-full touch-none items-center select-none", className)}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-pill bg-hairline">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={props["aria-label"]}
        aria-valuetext={valueText}
        className="block size-4 cursor-pointer rounded-pill border-2 border-accent bg-card"
      />
    </SliderPrimitive.Root>
  );
}
