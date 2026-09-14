import * as React from 'react';

/**
 * Use this to hold space while content is loading. Size and shape it to roughly match what will appear so the layout doesn't shift when the real content arrives. It's more informative than a spinner for pages or sections with structured content like cards, lists, or table rows.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={className} {...props} />;
}

export { Skeleton };
