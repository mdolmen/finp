import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";

type PingResult = { pong: boolean; version: string };

function App() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPing() {
    setError(null);
    try {
      const r = await invoke<PingResult>("ping");
      setResult(`backend v${r.version} — pong=${r.pong}`);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-semibold">Finances Personnelles</h1>
      <Button onClick={onPing}>Ping backend</Button>
      {result && <p className="text-sm text-muted-foreground">{result}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </main>
  );
}

export default App;
