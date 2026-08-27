export const motionEase = [0.22, 1, 0.36, 1] as const;
export const panelTransition = { duration: 0.65, ease: motionEase };
export const statsReturnTransition = { duration: 0.58, ease: motionEase };
export const timelineReturnTransition = {
  ...statsReturnTransition,
  opacity: { duration: 0.46, ease: 'linear' as const },
};
export const layerLayoutTransition = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 30,
  mass: 0.8,
};
