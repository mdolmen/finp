# Finp — Finances Personnelles

Application de gestion de finances personnelles, locale et sans abonnement.

## Prérequis

- macOS 12 ou supérieur
- Aucune connexion internet requise

## Installation

1. Télécharger le fichier `.dmg` depuis les releases.
2. Ouvrir le `.dmg` et glisser **Finp** dans le dossier Applications.
3. Au premier lancement, faire **clic droit → Ouvrir** (macOS bloque les apps non signées par défaut).

## Premiers pas

1. Aller dans **Comptes** et créer un compte bancaire.
2. Importer un relevé CSV via le bouton **Importer**.
3. Assigner des catégories aux opérations depuis la page **Opérations**.
4. Configurer des règles d'auto-catégorisation dans **Règles**.
5. Consulter le **Bilan** pour visualiser dépenses et revenus par mois.

## Fonctionnalités

- Import CSV avec détection automatique des colonnes
- Catégorisation manuelle ou automatique par règles
- Bilan mensuel avec histogramme par catégorie, décomposé par catégorie
- Projection des opérations prévues sur le graphique
- Solde courant par compte (basé sur un solde initial + toutes les opérations)
- Recherche plein texte sur les libellés (SQLite FTS5)
- Aucune donnée ne quitte votre machine

## Données

Les données sont stockées dans un fichier SQLite dans le dossier de données de l'application :

```
~/Library/Application Support/io.github.mathieudolmen.finp/finp.db
```

Pour sauvegarder, copier ce fichier.

## Connexion bancaire (Tink)

Le code d'intégration avec l'API Tink Open Banking est présent mais **désactivé dans l'interface**.

La raison : l'API Tink est conçue pour qu'une entreprise fournisse des services financiers à ses propres utilisateurs via la plateforme Tink. Elle n'est pas prévue pour un usage individuel où une personne accède directement à ses propres comptes. En pratique, cela se traduit par des contraintes d'enregistrement, de validation et de contrat qui ne correspondent pas à un outil personnel.

L'alternative naturelle est le CSV : tous les établissements bancaires français permettent d'exporter l'historique des opérations au format CSV depuis l'espace client en ligne.

## Développement

Voir [CLAUDE.md](CLAUDE.md) pour les conventions de code, la stack technique et les commandes de développement.
