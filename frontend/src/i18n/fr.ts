// Single source of truth for UI strings. Plain object — no runtime t() helper
// until we actually add a second locale. Imports look like:
//   import { fr } from "@/i18n/fr";
//   <h1>{fr.bilan.title}</h1>

export const fr = {
  app: {
    title: "Finances Personnelles",
  },
  nav: {
    bilan: "Bilan",
    operations: "Opérations",
    categories: "Catégories",
    regles: "Règles",
    comptes: "Comptes",
    toggleSidebar: "Afficher / masquer le menu",
  },
  bilan: {
    title: "Bilan",
    placeholder: "Aperçu mensuel à venir.",
  },
  operations: {
    title: "Opérations",
    placeholder: "Liste des opérations à venir.",
  },
  categories: {
    title: "Catégories",
    placeholder: "Gestion des catégories à venir.",
  },
  regles: {
    title: "Règles",
    placeholder: "Règles de classification à venir.",
  },
  comptes: {
    title: "Comptes",
    placeholder: "Gestion des comptes et import à venir.",
  },
  common: {
    loading: "Chargement…",
    error: "Erreur",
    cancel: "Annuler",
    confirm: "Confirmer",
    add: "Ajouter",
    edit: "Modifier",
    delete: "Supprimer",
  },
} as const;
