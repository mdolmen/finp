"""Generate two synthetic French-bank-style CSVs for manual testing.

Outputs in ./examples/ (relative to repo root):
    - sample-bank-operations-signed.csv  (Date;Montant;Libellé — single signed column)
    - sample-bank-operations-split.csv   (Date;Débit;Crédit;Libellé — two columns)

Run: ``uv run python examples/generate.py``  (or just plain ``python``)
"""

from __future__ import annotations

import csv
import random
from datetime import date, timedelta
from pathlib import Path

# Deterministic so re-runs produce the same file.
RNG = random.Random(42)


def _fr_date(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _fr_amount(value_eur: float) -> str:
    return f"{value_eur:.2f}".replace(".", ",")


# --- Recurring monthly events (date_of_month, amount, libelle) ---

RECURRING = [
    (1, -850.00, "PRELEVEMENT LOYER SCI ROUSSEAU"),
    (5, 2410.00, "VIREMENT SALAIRE ACME SAS"),
    (12, -44.80, "PRELEVEMENT EDF FACTURE"),
    (14, -29.99, "PRELEVEMENT FREE TELECOM"),
    (18, -19.99, "ORANGE MOBILE FORFAIT"),
    (22, -54.30, "MUTUELLE HARMONIE"),
    (26, -75.20, "PASS NAVIGO MENSUEL"),
    (28, -10.99, "NETFLIX ABONNEMENT"),
]

GROCERY_LIBELLES = [
    "CB CARREFOUR MARKET",
    "CB AUCHAN HYPERMARCHE",
    "CB MONOPRIX",
    "CB FRANPRIX",
    "CB LIDL",
    "CB BIOCOOP",
]

CAFE_RESTO = [
    "CB LE PETIT BISTRO",
    "CB BOULANGERIE PAUL",
    "CB STARBUCKS COFFEE",
    "CB MAISON LANDEMAINE",
    "CB SUSHI SHOP",
    "CB BIG MAMMA",
    "CB BURGER KING",
    "CB BAR DU MARCHE",
    "CB BRASSERIE LIPP",
    "CB COLUMBUS CAFE",
]

OTHER_DEBITS = [
    ("CB AMAZON.FR", 15.0, 80.0),
    ("CB FNAC.COM", 12.0, 50.0),
    ("CB UBER TRIP", 8.0, 35.0),
    ("CB TOTAL ENERGIES", 45.0, 75.0),
    ("CB PHARMACIE DU CENTRE", 6.0, 40.0),
    ("CB DECATHLON", 15.0, 120.0),
    ("CB IKEA PARIS", 25.0, 220.0),
    ("CB CINEMA UGC", 11.0, 14.0),
    ("CB SNCF VOYAGES", 25.0, 180.0),
]

OCCASIONAL_CREDITS = [
    ("VIREMENT REMBOURSEMENT AMI", 10.0, 60.0),
    ("VIREMENT CAF", 130.0, 220.0),
    ("REMBOURSEMENT SECU", 5.0, 45.0),
]

INTERNAL_TRANSFERS = [
    -200.0,
    -500.0,
    -300.0,
]


def generate_rows(months: int = 14) -> list[tuple[date, float, str]]:
    """Return (date, amount_signed, libelle) tuples spanning the last ``months`` months."""
    today = date.today()
    end = date(today.year, today.month, 1)
    # Walk back ``months`` whole months.
    start_y, start_m = end.year, end.month - (months - 1)
    while start_m <= 0:
        start_m += 12
        start_y -= 1
    cursor = date(start_y, start_m, 1)

    rows: list[tuple[date, float, str]] = []
    while cursor < end:
        next_month_y, next_month_m = (
            (cursor.year, cursor.month + 1) if cursor.month < 12 else (cursor.year + 1, 1)
        )
        month_end = date(next_month_y, next_month_m, 1) - timedelta(days=1)

        # Recurring entries.
        for day, amount, libelle in RECURRING:
            d = min(date(cursor.year, cursor.month, day), month_end)
            rows.append((d, amount, libelle))

        # Groceries: ~weekly.
        for week in range(4):
            d = date(cursor.year, cursor.month, min(3 + 7 * week, month_end.day))
            amount = -RNG.uniform(35.0, 130.0)
            libelle = RNG.choice(GROCERY_LIBELLES)
            rows.append((d, amount, libelle))

        # Cafés / restos: 6–10 per month.
        for _ in range(RNG.randint(6, 10)):
            d = date(cursor.year, cursor.month, RNG.randint(1, month_end.day))
            amount = -RNG.uniform(3.5, 45.0)
            libelle = RNG.choice(CAFE_RESTO)
            rows.append((d, amount, libelle))

        # Other random debits: 4–7 per month.
        for _ in range(RNG.randint(4, 7)):
            d = date(cursor.year, cursor.month, RNG.randint(1, month_end.day))
            libelle, lo, hi = RNG.choice(OTHER_DEBITS)
            amount = -RNG.uniform(lo, hi)
            rows.append((d, amount, libelle))

        # Occasional credit (50% chance per month).
        if RNG.random() < 0.5:
            d = date(cursor.year, cursor.month, RNG.randint(1, month_end.day))
            libelle, lo, hi = RNG.choice(OCCASIONAL_CREDITS)
            amount = RNG.uniform(lo, hi)
            rows.append((d, amount, libelle))

        # Internal transfer once a month, mid-month, to "EPARGNE".
        d = date(cursor.year, cursor.month, 16)
        rows.append((d, RNG.choice(INTERNAL_TRANSFERS), "VIREMENT VERS EPARGNE LIVRET A"))

        # Step to next month.
        cursor = date(next_month_y, next_month_m, 1)

    rows.sort(key=lambda r: (r[0], r[2]))
    return rows


def write_signed(path: Path, rows: list[tuple[date, float, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Date", "Montant", "Libellé"])
        for d, amount, libelle in rows:
            w.writerow([_fr_date(d), _fr_amount(amount), libelle])


def write_split(path: Path, rows: list[tuple[date, float, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Date", "Débit", "Crédit", "Libellé"])
        for d, amount, libelle in rows:
            if amount < 0:
                w.writerow([_fr_date(d), _fr_amount(-amount), "", libelle])
            else:
                w.writerow([_fr_date(d), "", _fr_amount(amount), libelle])


def main() -> None:
    here = Path(__file__).parent
    rows = generate_rows()
    write_signed(here / "sample-bank-operations-signed.csv", rows)
    write_split(here / "sample-bank-operations-split.csv", rows)
    print(f"Wrote {len(rows)} rows to examples/sample-bank-operations-{{signed,split}}.csv")


if __name__ == "__main__":
    main()
