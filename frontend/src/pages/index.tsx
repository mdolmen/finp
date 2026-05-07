import { fr } from "@/i18n/fr";

type StubProps = { title: string; placeholder: string };

function Stub({ title, placeholder }: StubProps) {
  return (
    <div className="px-6 py-5">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{placeholder}</p>
    </div>
  );
}

export { BilanPage } from "./bilan";

export { OperationsPage } from "./operations";

export { CategoriesPage } from "./categories";

export function ReglesPage() {
  return <Stub title={fr.regles.title} placeholder={fr.regles.placeholder} />;
}

export { ComptesPage } from "./comptes";
