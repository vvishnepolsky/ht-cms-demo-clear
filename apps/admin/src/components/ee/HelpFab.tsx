import { HelpCircle } from 'lucide-react';
import { Button } from '../ui/button';

export function HelpFab() {
  return (
    <Button
      size="icon"
      variant="default"
      aria-label="Help"
      className="fixed bottom-5 right-5 rounded-full shadow-lg h-12 w-12 z-30"
      onClick={() => window.open('https://docs.healthy-together.health/cms-demo', '_blank')}
    >
      <HelpCircle className="w-6 h-6" />
    </Button>
  );
}
