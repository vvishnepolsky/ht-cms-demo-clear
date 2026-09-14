import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { cn } from '../lib/utils';

/**
 * Use this when a user must pick exactly one option from a short list, such as gender, payment method, or notification preference. Wrap it in a Form for validation. If the user can select more than one option, use Checkbox instead.
 */
function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn('grid w-full gap-3', className)} {...props} />;
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        'relative inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-card outline-none shadow-[0_0_0_1px_var(--color-border)] transition-[background,box-shadow] duration-150 data-[checked]:bg-primary data-[checked]:shadow-none focus-visible:shadow-[0_0_0_1px_var(--color-ring),0_0_0_4px_var(--color-ring)/50] data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex size-4 items-center justify-center after:absolute after:top-1/2 after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-background"
      />
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
