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
    empty: "Aucun compte. Ajoutez-en un pour commencer.",
    connect: "Connecter",
    connectSoon: "Bientôt disponible",
    import: "Importer",
    addTitle: "Ajouter un compte",
    addDescription: "Donnez-lui un nom pour le distinguer.",
    namePlaceholder: "Compte courant",
    errorDuplicate: "Un compte avec ce nom existe déjà.",
  },
  common: {
    loading: "Chargement…",
    error: "Erreur",
    cancel: "Annuler",
    confirm: "Confirmer",
    close: "Fermer",
    back: "Retour",
    add: "Ajouter",
    edit: "Modifier",
    delete: "Supprimer",
  },
  import: {
    title: "Importer des opérations — {name}",
    description: "Choisissez un fichier CSV puis associez les colonnes.",
    pickFile: "Choisir un fichier CSV",
    fileLabel: "Fichier",
    rowsCount: "lignes",
    fieldCharset: "Encodage",
    fieldDelimiter: "Séparateur de colonnes",
    fieldDate: "Colonne date",
    fieldDateFormat: "Format de date",
    fieldMontantMode: "Format des montants",
    fieldMontant: "Colonne montant",
    fieldDebit: "Colonne débit (sortant)",
    fieldCredit: "Colonne crédit (entrant)",
    fieldDecimal: "Séparateur décimal",
    fieldLibelle: "Colonne libellé",
    preview: "Aperçu (5 premières lignes)",
    validate: "Valider",
    run: "Importer",
    confirmTitle: "Prêt à importer",
    confirmCount: "ligne(s) prête(s) à être importée(s)",
    confirmFailedHeader: "ligne(s) seront ignorée(s) à cause de ces erreurs :",
    imported: "Importées :",
    skipped: "Doublons ignorés :",
    skippedExistingHeader:
      "Opérations déjà présentes (rejetées comme doublons) :",
    failed: "Lignes en erreur",
    ruleAssigned: "Règles appliquées :",
  },
} as const;
