#!/usr/bin/env python3
"""Erzeugt aus Katalogdaten die SQL-Skripte, mit denen die Zeilen bestimmter Mandanten im Ziel ersetzt werden.

Vorlage — vor dem Einsatz MANDANTEN, AUSSCHLUSS, AUSSCHLUSS_MUSTER, SONDER, KONTO_TABELLEN und KONTO_BENUTZER an das
Projekt anpassen (Werte für das mag-tech-monorepo: references/mag-tech.md).

Eingaben (im Arbeitsordner, erzeugt mit den Abfragen unten):
  quelle-mit-daten.txt  `pg_restore -l <abzug> | awk '/ TABLE DATA /{print $6"."$7}' | sort`
  fk-ziel.txt           kind|eltern|confdeltype|pg_get_constraintdef  (pg_constraint, contype='f', App-Schemas)
  spalten-ziel.txt      schema.tabelle|spalte|attgenerated|attidentity|typ  (pg_attribute, attnum>0, nicht gelöscht)
  pk-ziel.txt           schema.tabelle|spalte1,spalte2  (pg_index indisprimary)
Ausgaben: export-imp.sql (im Zwischenstand ausführen), ersetzen.sql (im Ziel ausführen, eine Transaktion)

Die SQL-Texte entstehen nur aus Bezeichnern des eigenen Katalogs; jeder Bezeichner wird gegen ein strenges Muster
geprüft (`pruefe`). Deshalb ist S608 hier bewusst abgeschaltet.
"""
# ruff: noqa: S608
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

ORDNER = Path.cwd()
MANDANTEN: tuple[str, ...] = ("00000000-0000-0000-0000-000000000000",)  # IDs der zu ersetzenden Mandanten
MANDANT_SPALTE = "firma_id"
AUSSCHLUSS: set[str] = {"public.__drizzle_migrations"}  # Tabellen, deren Daten nie übernommen werden
AUSSCHLUSS_MUSTER = re.compile(r"^public\.(email_|chat_|ki_|ai_|messaging_|push_)")
SONDER = {"public.firmen", "public.users"}  # nie löschen, nur aktualisieren; Verweise darauf sind kein Besitz
KONTO_TABELLEN = {"public.user_firma_roles", "public.user_groups"}  # Zeilen der Anmelde-Konten bleiben, wie sie sind
KONTO_BENUTZER = "(SELECT u.id FROM public.users u WHERE u.keycloak_id IN (SELECT k.id FROM keycloak.user_entity k))"
BEZEICHNER = re.compile(r"^[a-z_][a-z0-9_]*$")
M_LISTE = ", ".join(f"'{m}'" for m in MANDANTEN)


def pruefe(*namen: str) -> None:
    for n in namen:
        if not BEZEICHNER.match(n):
            raise SystemExit(f"unerwarteter Bezeichner: {n!r}")


def q(name: str) -> str:
    schema, tabelle = name.split(".", 1)
    pruefe(schema, tabelle)
    return f'"{schema}"."{tabelle}"'


def imp(name: str) -> str:
    schema, tabelle = name.split(".", 1)
    pruefe(schema, tabelle)
    return f'imp."{schema}__{tabelle}"'


def fk_spalten(defin: str) -> tuple[list[str], list[str]] | None:
    m = re.match(r"FOREIGN KEY \(([^)]+)\) REFERENCES [^(]+\(([^)]+)\)", defin)
    if not m:
        return None
    return [c.strip().strip('"') for c in m.group(1).split(",")], [c.strip().strip('"') for c in m.group(2).split(",")]


def voll(name: str) -> str:
    return name if "." in name else f"public.{name}"


def main() -> None:
    quelle = [z.strip() for z in (ORDNER / "quelle-mit-daten.txt").read_text().splitlines() if z.strip()]
    spalten: dict[str, list[str]] = defaultdict(list)
    for z in (ORDNER / "spalten-ziel.txt").read_text().splitlines():
        teile = z.split("|")
        if len(teile) >= 5 and teile[2] == "":  # generierte Spalten auslassen
            pruefe(teile[1])
            spalten[teile[0]].append(teile[1])
    pks: dict[str, list[str]] = {}
    for z in (ORDNER / "pk-ziel.txt").read_text().splitlines():
        t, cols = z.split("|", 1)
        pruefe(*cols.split(","))
        pks[voll(t)] = cols.split(",")
    fks = []
    for z in (ORDNER / "fk-ziel.txt").read_text().splitlines():
        kind, eltern, aktion, defin = z.split("|", 3)
        fks.append((voll(kind), voll(eltern), aktion, defin))

    tabellen = sorted({t for t in quelle if t not in AUSSCHLUSS and not AUSSCHLUSS_MUSTER.match(t) and t in spalten})
    alle = set(tabellen)
    eltern_von: dict[str, set[str]] = defaultdict(set)
    kanten: dict[str, list[tuple[list[str], str, list[str]]]] = defaultdict(list)
    for kind, eltern, _aktion, defin in fks:
        if kind in alle and eltern in alle and kind != eltern:
            eltern_von[kind].add(eltern)
        cols = fk_spalten(defin)
        if cols and kind in alle and eltern in alle:
            kanten[kind].append((cols[0], eltern, cols[1]))

    # Eltern vor Kindern (Löschen rückwärts); Zyklen werden als Block angehängt — eingefügt wird ohnehin mit
    # session_replication_role = replica und danach explizit geprüft.
    reihenfolge: list[str] = []
    offen = set(tabellen)
    while offen:
        bereit = sorted(t for t in offen if not ((eltern_von[t] - SONDER) & offen))
        if not bereit:
            reihenfolge.extend(sorted(offen))
            break
        reihenfolge.extend(bereit)
        offen -= set(bereit)
    hat_mandant = {t for t in tabellen if MANDANT_SPALTE in spalten[t]}

    def besitz(t: str, alias: str, quelle_imp: bool, tiefe: int = 0) -> str | None:
        """Bedingung „Zeile gehört zu den Mandanten“ über die Mandanten-Spalte oder einen Eltern-Fremdschlüssel."""
        if t in hat_mandant:
            return f'{alias}."{MANDANT_SPALTE}" IN ({M_LISTE})'
        if tiefe > 3:
            return None
        teile = []
        for k_cols, eltern, e_cols in kanten.get(t, []):
            if len(k_cols) != 1 or eltern == t or eltern in SONDER:
                continue
            innen = besitz(eltern, f"e{tiefe}", quelle_imp, tiefe + 1)
            if innen:
                von = imp(eltern) if quelle_imp else q(eltern)
                teile.append(f'{alias}."{k_cols[0]}" IN (SELECT e{tiefe}."{e_cols[0]}" FROM {von} e{tiefe} WHERE {innen})')
        return "(" + " OR ".join(teile) + ")" if teile else None

    def auswahl(t: str) -> str:
        teile = []
        if t not in SONDER:
            bed = besitz(t, "i", True)
            if bed:
                teile.append(bed)
        if t in KONTO_TABELLEN:
            teile.append(f'i."user_id" NOT IN {KONTO_BENUTZER}')
        return (" WHERE " + " AND ".join(teile)) if teile else ""

    z = ["\\set ON_ERROR_STOP on", "\\set VERBOSITY terse", "BEGIN;", "SET LOCAL lock_timeout = '15s';"]
    for t in reversed(reihenfolge):  # 1) Löschen, was es in der Quelle nicht mehr gibt
        bed = None if t in SONDER else besitz(t, "t", False)
        if not bed:
            continue
        fehlt = f"NOT EXISTS (SELECT 1 FROM {imp(t)} i WHERE " + " AND ".join(f'i."{c}" = t."{c}"' for c in pks[t]) + ")"
        konto = f' AND t."user_id" NOT IN {KONTO_BENUTZER}' if t in KONTO_TABELLEN else ""
        z.append(f"DELETE FROM {q(t)} t WHERE {bed} AND {fehlt}{konto};")
    z.append("SET LOCAL session_replication_role = replica;")  # 2) Upsert ohne Trigger/FK, Prüfung folgt
    for t in reihenfolge:
        cols, pk = spalten[t], pks[t]
        setz = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in cols if c not in pk)
        aktion = f"DO UPDATE SET {setz}" if setz else "DO NOTHING"
        if t == "public.users":
            aktion += ' WHERE NOT EXISTS (SELECT 1 FROM keycloak.user_entity k WHERE k.id = "users"."keycloak_id")'
            z.append('UPDATE public.users z SET keycloak_id = NULL WHERE z.keycloak_id IN (SELECT keycloak_id FROM imp."public__users" '
                     'WHERE keycloak_id IS NOT NULL) AND z.id NOT IN (SELECT id FROM imp."public__users") '
                     "AND z.keycloak_id NOT IN (SELECT k.id FROM keycloak.user_entity k);")
        z.append(f"INSERT INTO {q(t)} ({', '.join(chr(34) + c + chr(34) for c in cols)}) "
                 f"SELECT {', '.join('i.' + chr(34) + c + chr(34) for c in cols)} FROM {imp(t)} i{auswahl(t)} "
                 f"ON CONFLICT ({', '.join(chr(34) + c + chr(34) for c in pk)}) {aktion};")
    z.append("SET LOCAL session_replication_role = origin;")
    fk_pruef = []  # 3) Fremdschlüssel nur der übernommenen Zeilen
    for kind, eltern, _aktion, defin in fks:
        cols = fk_spalten(defin)
        if kind not in alle or not cols:
            continue
        k_cols, e_cols = cols
        pruefe(*k_cols, *e_cols)
        wo = auswahl(kind)
        zusatz = (" AND " + wo[len(" WHERE "):]) if wo else ""
        nur = f"EXISTS (SELECT 1 FROM {imp(kind)} i WHERE " + " AND ".join(f'i."{c}" = c."{c}"' for c in pks[kind]) + zusatz + ")"
        nn = " AND ".join(f'c."{c}" IS NOT NULL' for c in k_cols)
        passt = " AND ".join(f'p."{e}" = c."{k}"' for k, e in zip(k_cols, e_cols))
        name = re.sub(r"[^a-z0-9_.]", "", f"{kind}__{eltern}_{'_'.join(k_cols)}")
        fk_pruef.append(f"SELECT '{name}' AS fk, count(*) AS fehlend FROM {q(kind)} c WHERE {nur} AND {nn} "
                        f"AND NOT EXISTS (SELECT 1 FROM {q(eltern)} p WHERE {passt})")
    z.append("CREATE TEMP TABLE import_fk AS " + "\nUNION ALL ".join(fk_pruef) + ";")
    z.append("SELECT 'FK_LUECKE', fk, fehlend FROM import_fk WHERE fehlend > 0;")
    zaehl = []
    for t in reihenfolge:
        on = " AND ".join(f'z."{c}" = i."{c}"' for c in pks[t])
        wo = auswahl(t)
        zaehl.append(f"SELECT '{t}' AS tabelle, (SELECT count(*) FROM {imp(t)} i{wo}) AS quelle, "
                     f"(SELECT count(*) FROM {imp(t)} i JOIN {q(t)} z ON {on}{wo}) AS im_ziel")
    z.append("CREATE TEMP TABLE import_kontrolle AS " + "\nUNION ALL ".join(zaehl) + ";")
    z.append("SELECT 'ABWEICHUNG', tabelle, quelle, im_ziel FROM import_kontrolle WHERE quelle <> im_ziel;")
    z.append("SELECT 'SUMME', count(*), sum(quelle), sum(im_ziel) FROM import_kontrolle;")
    z.append("DO $$ BEGIN IF (SELECT coalesce(sum(fehlend), 0) FROM import_fk) > 0 "
             "OR EXISTS (SELECT 1 FROM import_kontrolle WHERE quelle <> im_ziel) "
             "THEN RAISE EXCEPTION 'Import-Prüfung fehlgeschlagen — nichts übernommen'; END IF; END $$;")
    z.append("COMMIT;")
    (ORDNER / "ersetzen.sql").write_text("\n".join(z) + "\n", encoding="utf-8")
    export = ["\\set ON_ERROR_STOP on", "DROP SCHEMA IF EXISTS imp CASCADE;", "CREATE SCHEMA imp;"]
    export += [f"CREATE TABLE {imp(t)} AS SELECT {', '.join(chr(34) + c + chr(34) for c in spalten[t])} FROM {q(t)};"
               for t in reihenfolge]
    (ORDNER / "export-imp.sql").write_text("\n".join(export) + "\n", encoding="utf-8")
    print(f"Tabellen: {len(reihenfolge)}; mit Mandanten-Spalte: {len(hat_mandant)}")


if __name__ == "__main__":
    main()
