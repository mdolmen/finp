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

export function BilanPage() {
  return <Stub title={fr.bilan.title} placeholder={fr.bilan.placeholder} />;
}

export function OperationsPage() {
  return <Stub title={fr.operations.title} placeholder={fr.operations.placeholder} />;
}

export function CategoriesPage() {
  return <Stub title={fr.categories.title} placeholder={fr.categories.placeholder} />;
}

export function ReglesPage() {
  return <Stub title={fr.regles.title} placeholder={fr.regles.placeholder} />;
}

export function ComptesPage() {
  return <Stub title={fr.comptes.title} placeholder={fr.comptes.placeholder} />;
}
