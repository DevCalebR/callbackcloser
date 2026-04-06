import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SetupChecklistItem = {
  key: string;
  label: string;
  detail: string;
  complete: boolean;
};

export function SetupChecklist({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: SetupChecklistItem[];
}) {
  const completedCount = items.filter((item) => item.complete).length;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant={completedCount === items.length ? 'success' : 'outline'}>
            {completedCount}/{items.length} complete
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="rounded-xl border bg-background/80 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-medium">{item.label}</p>
              <Badge variant={item.complete ? 'success' : 'outline'}>{item.complete ? 'Complete' : 'Pending'}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
