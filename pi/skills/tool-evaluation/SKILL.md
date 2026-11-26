---
name: tool-evaluation
description: "Ein fremdes Tool, Paket oder eine Bibliothek auf Anfrage erklären und einschätzen, ob der Nutzer es braucht („was kann X, brauche ich es, was nützt es?\") — Namen entzerren, lokalen Installations- und Abhängigkeitsstand prüfen, vorhandene Projekt-Notizen und Vorab-Entscheide per session_search finden, Primärquellen (Ankündigung, README, CHANGELOG) lesen und nur das Delta seit dem letzten geprüften Stand berichten; Urteil zuerst. Use when the user asks what a tool, package or library is, whether it is needed, or what it would give them, without asking to install or build with it."
---

# tool-evaluation

# tool-evaluation (Was ist X, brauche ich es?)

Klasse: Der Nutzer nennt ein fremdes Tool, Paket oder eine Bibliothek und will wissen, was es kann, ob er es
braucht und was es ihm nützt — ohne Installations- oder Bauauftrag. Ziel: ein begründetes Urteil, das auf dem
eigenen Stand des Nutzers beruht, nicht eine allgemeine Produktbeschreibung.

## Verfahren (in dieser Reihenfolge)

1. **Namen entzerren.** Erst Hersteller bzw. Kontext des Namens klären (`web_search` mit Name plus Hersteller,
   zwei bis drei verschiedene Winkel) — derselbe Kurzname gehört oft mehreren Produkten. Liefert `which <name>`
   nichts, kann es ein Paket sein, das zu einem installierten Programm gehört: im Store-Pfad des Programms die
   `package.json` (Abhängigkeiten) und die Doku des Programms durchsuchen.
2. **Lokalen Stand prüfen:** `which <name>`, `nix profile list | grep -i <name>`, globale npm-Pakete. Liegt das
   Paket im Store, die Abhängigkeitsliste des installierten Programms lesen und dessen Zielverzeichnis nach dem
   Paketnamen durchsuchen (`grep -rl <paket> <programm>/dist | wc -l`) — nur so ist belegbar, ob der eigene
   Bestand es nutzt.
3. **Vorhandenen Bezug des Nutzers suchen:** `session_search` mit dem Namen; Treffer zeigen laufende Sessions
   und Projektordner. Dann die Projekt-Notizen zum Thema lesen (Audits, Research-Dateien, Lückenlisten,
   Entscheidungsdokumente, oft unter `.tmp/`). Dort stehen die geprüfte Version bzw. das Datum des Vorbilds und
   die bisherige Entscheidung (übernommen, bewusst nicht, offen). Dateien einer gerade laufenden anderen Session
   nur lesen, nie ändern.
4. **Primärquellen lesen:** Ankündigungs-Post des Herstellers, README und CHANGELOG im Hauptzweig
   (`fetch_content` mit URLs-Liste), Registrierungsseite des Pakets für Version und Datum. Podcast-Transkripte,
   Kurzfassungen und Suchschnipsel nur als Wegweiser auf Primärquellen nutzen.
5. **Delta seit dem geprüften Stand bilden:** Im CHANGELOG nur die Abschnitte ab der in Schritt 3 gefundenen
   Version lesen. Je Eintragung entscheiden, ob sie das Projekt des Nutzers betrifft (gleicher Baustein, gleiche
   Lücke); den Rest in einer Zeile zusammenfassen.
6. **Antwort:** Urteil zuerst (brauchst du es: nein/ja, ein Satz Grund), dann „Was es ist" (zwei Sätze),
   „Was es kann" (Stichpunkte in klaren Worten), „Für dein Projekt" (Stand laut Notizen mit Pfad, offene Punkte,
   Neuerungen als Tabelle Version · Neuerung · warum relevant). Schluss mit einem kurzen Angebot für den
   nächsten Schritt. Jede Aussage über den Stand des Nutzers mit Dateipfad belegen.

## Fallstricke

- **Ein Kurzname ohne Hersteller liefert Gleichnamiges:** mehrere Produkte teilen sich Kernwörter — zuerst den
  Hersteller klären, sonst wird das falsche Produkt erklärt (Mechanismus: die Suche ordnet nach Popularität,
  nicht nach dem gemeinten Kontext).
- **Im Store vorhanden heißt nicht genutzt:** ein Paket kann als Abhängigkeit eines anderen liegen, ohne dass das
  eigene Programm es einbindet — die Abhängigkeitsliste des Programms zählt, nicht das Vorhandensein im Store.
- **„Experimental" im README ernst nehmen:** solche Pakete ändern die API zwischen Minor-Versionen innerhalb von
  Wochen (im CHANGELOG an den Abschnitten „Breaking Changes" abzählen) — Stabilität und Versions-Pflicht nennen,
  statt das Paket als einführbar zu beschreiben.
- **Die allgemeine Erklärung ist nicht die Antwort:** ohne die Notizen des Nutzers (Schritt 3) bleibt „brauche
  ich es" unbegründet, und bereits getroffene Entscheidungen werden erneut zur Debatte gestellt.
