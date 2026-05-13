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
- Bilan mensuel avec histogramme par catégorie
- Opérations prévues (projection sur le graphique)
- Aucune donnée ne quitte votre machine

## Données

Les données sont stockées dans un fichier SQLite dans le dossier de données de l'application :

```
~/Library/Application Support/io.github.mathieudolmen.finp/finp.db
```

Pour sauvegarder, copier ce fichier.
