# Abnahme von Mandanten-Wächtern und Worker-UI

Drei Prüfungen, die grüne Einzeltests nicht abdecken. Sie gehören als Vorgabe in den Brief und als Prüfschritt in die Abnahme.

## Mandanten-Wächter neuer Routen und Server-Actions

Admins mit `firma.viewAll` haben keine feste Firma in der Session, `getActiveFirmaId(session)` ohne zweites Argument liefert für sie `null` („Keine aktive Firma“) — Worker-Code und Tests mit einer Session mit `firmaId` sehen das nie.

- Die Firma aus der Ressource (Termin/Angebot) ableiten und mit `getActiveFirmaId(session, besitzerFirma)` gegen die Session prüfen (nur `viewAll` darf die explizite Firma nutzen, alle anderen bekommen ihre eigene zurück → Abweichung = kein Zugriff).
- Dasselbe gilt für Verfügbarkeits- und Feature-Prüfungen ohne Datensatz („Funktion verfügbar?“, Einstellungen je Firma). Sie bekommen die in der Oberfläche gewählte Firma (`?firma=`) als Parameter und rufen `getActiveFirmaId(session, gewaehlteFirma)`.
- Zentrale Verdrahtungen (`firmaIdVon: …`) nie mit nur einem Argument.
- Beim Abnehmen neue Treffer von `getActiveFirmaId(session)` ohne zweites Argument per `git diff | grep` suchen. Grund: Der Inhaber testet als Admin über mehrere Firmen, und für ihn verschwindet die Funktion dann still.
- Im Brief einen Test „Admin mit `firma.viewAll`, `firmaId: null`“ verlangen und Rot ohne Fix belegen (nur die Quelldateien per `git stash push -- <src-Pfade>` zurücksetzen, Tests bleiben, danach `stash pop`).

## Tailwind-Sichtbarkeit

Steht neben einer festen Anzeige-Klasse (`flex`) eine bedingte (`hidden`), entscheidet die CSS-Reihenfolge, welche gewinnt — die Anzeige-Klasse nur in der Bedingung setzen (`offen ? "flex" : "hidden"`). Beim Abnehmen von Worker-UI-Code (ein-/ausblendbares Panel, das gemountet bleiben soll) gezielt darauf prüfen.

## Schwebende oder eingebettete UI am Handy, Auffindbarkeit

- Eine Seitenleiste mit fester Breite (`w-64`) als Flex-Geschwister frisst auf 390 px zwei Drittel des Inhalts und lässt Eingabefelder senkrecht umbrechen — Jest/jsdom und Desktop-E2E sehen das nie. Im Brief für UI-Pakete verlangen: Standardzustand unter `sm` zu (Overlay per Knopf), per Tailwind-`sm:`-Varianten statt `window`-Lesen im `useState` (Hydration), plus ein E2E im Projekt `mobile` mit Breitenassertion (Eingabefeld ≥ 300 px, Liste unsichtbar) und einen Screenshot bei 390×844, den ich selbst ansehe.
- Nachbesserung nach der Abnahme des Leitstands: neuer Branch von `origin/<basis>` (der erste PR ist gemergt), nicht auf dem alten weiterarbeiten.
- Neue Nutzerfunktion (Knopf, Dialog) im Brief immer vom Startbildschirm des Nutzers aus planen: Einstiegspunkt auf jedem Reiter/jeder Übersicht, über die er in den Flow kommt (nicht nur auf der Detailseite), Leerzustand mit Hauptaktion, bei fehlendem Recht, fehlender Lizenz, abgeschalteter Firma oder nicht erreichbarem Dienst das Element gedämpft zeigen statt ausblenden; Antippen erklärt den Grund in Alltagssprache und verlinkt Admins zur Einstellung (ein verschwundenes Element hält der Nutzer für einen Fehler, ein toter Knopf ohne Erklärung ebenso), und der E2E startet auf dieser Übersicht statt per Direkt-URL auf der Detailseite. Grund: Eine Funktion, die nur auf einer Unterseite hängt, besteht alle Tests und wird vom Nutzer trotzdem „nicht gefunden“.
- Auffindbarkeit prüfe ich zusätzlich mit einem frischen Worker, der nur die Nachher-Screenshots sieht und sagen soll, wo man die Funktion benutzt.
- Vor-/Nachher-Live-Checks von Prompt-Änderungen messe ich VOR der Änderung (kein stash), und der Brief nennt den Fall „Live-Aufruf nicht möglich → Grund melden, nichts erfinden“.
