'use client';

import { StepHeader } from '../components/ui';

export function StepHeaderLink() {
  return <StepHeader kicker="Anti-arnaque" onBack={() => window.history.back()} />;
}
