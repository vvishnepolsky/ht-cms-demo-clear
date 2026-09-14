import { Separator as SeparatorPrimitive } from '@base-ui/react/separator';

/**
 * Use this to add a thin visual divider between sections of content, sidebar groups, or menu items. It can be horizontal or vertical. It's purely decorative. For structural separation between major sections, consider spacing or headings instead.
 */
function Separator({ className, orientation = 'horizontal', ...props }: SeparatorPrimitive.Props) {
  return <SeparatorPrimitive data-slot="separator" orientation={orientation} className={className} {...props} />;
}

export { Separator };
