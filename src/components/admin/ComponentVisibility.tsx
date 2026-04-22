import { GlassCard } from '@/components/ui/GlassCard';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useComponentVisibility, KNOWN_COMPONENTS } from '@/hooks/useComponentVisibility';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';

export const ComponentVisibility = () => {
  const { hidden, toggle, loading } = useComponentVisibility();
  const { toast } = useToast();

  const groups = KNOWN_COMPONENTS.reduce<Record<string, typeof KNOWN_COMPONENTS>>(
    (acc, c) => {
      (acc[c.group] ||= []).push(c);
      return acc;
    },
    {}
  );

  const handleToggle = async (key: string, label: string) => {
    await toggle(key);
    const nowHidden = !hidden.includes(key);
    toast({
      title: nowHidden ? 'Component hidden' : 'Component visible',
      description: nowHidden
        ? `${label} is now hidden from non-admin users.`
        : `${label} is now visible to everyone.`,
    });
  };

  return (
    <div className="space-y-4" data-testid="panel-component-visibility">
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-primary/20">
            <EyeOff className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Component Visibility</h3>
            <p className="text-sm text-muted-foreground">
              Hide any feature from non-admin users. Admins always see everything.
              Changes apply instantly across all browsers.
            </p>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground">Loading visibility settings…</p>
        )}

        <div className="space-y-6">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">{group}</h4>
              <div className="space-y-2">
                {items.map((item) => {
                  const isHidden = hidden.includes(item.key);
                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      data-testid={`row-visibility-${item.key}`}
                    >
                      <div className="flex items-center gap-3">
                        {isHidden ? (
                          <EyeOff className="h-4 w-4 text-destructive" />
                        ) : (
                          <Eye className="h-4 w-4 text-primary" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{item.label}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.key}</p>
                        </div>
                        {isHidden && (
                          <Badge variant="destructive" className="text-xs">hidden</Badge>
                        )}
                      </div>
                      <Switch
                        checked={!isHidden}
                        onCheckedChange={() => handleToggle(item.key, item.label)}
                        data-testid={`switch-visibility-${item.key}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};
