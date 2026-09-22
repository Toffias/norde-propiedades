import { Button } from '@norde/ui/components/button';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Norde · Gestión</h1>
      <p className="text-muted-foreground">Panel interno en construcción.</p>
      <div>
        <Button disabled>Ingresar</Button>
      </div>
    </main>
  );
}
