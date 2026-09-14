'use client';

import * as React from 'react';
import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';

/**
 * Use this to represent a person or entity with a photo. Compose it with the image and fallback sub-components. The fallback shows automatically if the image fails to load or no source is provided. Keep fallback text to initials. Use the group variant when you need to stack multiple avatars together.
 */
function Avatar({
  className,
  size = 'default',
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: 'default' | 'sm' | 'lg';
}) {
  return <AvatarPrimitive.Root data-slot="avatar" data-size={size} className={className} {...props} />;
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return <AvatarPrimitive.Image data-slot="avatar-image" className={className} {...props} />;
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return <AvatarPrimitive.Fallback data-slot="avatar-fallback" className={className} {...props} />;
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="avatar-badge" className={className} {...props} />;
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="avatar-group" className={className} {...props} />;
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="avatar-group-count" className={className} {...props} />;
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge };
