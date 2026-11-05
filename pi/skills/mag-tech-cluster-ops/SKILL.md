---
name: mag-tech-cluster-ops
description: "Installation, Umzug und Stilllegung von Kunden-Clustern (besichtigungs-app/zentrio) auf den Mag-Tech-VMs per customer-vm-Installer inkl. Backups (Longhorn/S3), Flux-Kanälen und dem gehärteten Keycloak auth.mag-tech.eu. Use when a customer VM/cluster shall be installed, moved, decommissioned, or its Keycloak clients/backups/Flux delivery managed."
---

# mag-tech-cluster-ops

---
name: mag-tech-cluster-ops
description: Installation, Umzug und Stilllegung von Kunden-Clustern (besichtigungs-app/zentrio) auf den Mag-Tech-VMs per customer-vm-Installer inkl. Backups (Longhorn/S3), Flux-Kanälen und dem gehärteten Keycloak auth.mag-tech.eu. Use when a customer VM/cluster shall be installed, moved, decommissioned, or its Keycloak clients/backups/Flux delivery managed.
---

# mag-tech-cluster-ops

Klasse: Lebenszyklus der Kunden-Kubernetes-Cluster (k3s + Longhorn + Flux + Edge-Caddy) der Mag-Tech-Apps. Code-Pfaden/PR-Fluss siehe `mag-tech-app-entwicklung`; Auslieferungskanäle regelt der Auslieferungshelfer (einziger Weg: `docs/rules/auslieferung-ein-weg.md`).

## Inventar (Live-Quellen statt Merkliste)
- VMs über `herdr` (demo-vps, slava-demo-vps, intern-vps …; SSH als root, BatchMode funktioniert). Domains per `getent hosts <domain>` auflösen. Install-Skripte + Configs je VM unter `/root/cluster-setup` bzw. `/root/auth-k8s`, Flux-Zustand in ns `flux-system`, Edge-Caddy in ns `edge` (ConfigMap `caddy-sites`, Keys `<tenant>.caddy`).
- Installer: `apps/<app>/k8s/customer-vm/` im Monorepo, laufbar über Repo-Root `npm run install:cluster -- <slug>` (nix develop). Zentrio hat seit MAG-1576 (Branch zentrio-k8s-port) einen eigenen Port desselben Installers: KEIN Cluster-Keycloak, sondern zentraler Issuer auth.mag-tech.eu (Client `zentrio`, Sync-User `zentrio-sync`, Secret-Sync per REST statt kcadm), NodePort 30090 (läuft parallel zu 30080/30081 der Besichtigungs-App → hostcaddy koexistiert), Harbor-Projekt `zentrio`, DB-Name intern weiterhin `besichtigung` (Fork-Konvention), keine CI-Kanal-Tag-Schritte (Lead manuell). Kunden-State unter `apps/besichtigungs-app/customers/<slug>/` ist gitignored — der VOLLSTÄNDIGE State (cluster.conf, cluster-secrets.env, s3.env, license-PEMs) liegt auf gamzat-dev `~/projects/MaG-Tech-MonoRepo/...`; vor Arbeit an einem Kunden von dort synchronisieren (Statusdateien dort können älter sein als der Live-Cluster — Flux-Tag auf dem Cluster ist die Wahrheit, nicht cluster.conf).

## Installation/Rerun
- Non-interaktiv: `PW=$(grep '^SSH_PASSWORD=' customers/<slug>/cluster-secrets.env | cut -d'"' -f2); NONINTERACTIVE=1 SSH_PASSWORD="$PW" npm run install:cluster -- <slug> [--mode shared-vm --namespace <slug>]`. Der Installer persistiert das Passwort ins Recovery-Kit des Kunden.
- shared-vm-Zusatztenant erzeugt `customers/<slug>/deploy/{README.md,resources.env}` und BRICHT AB, bis beide auf `main` committet sind: main-CI bäckt sie ins `kunde-<slug>/deploy`-Artefakt, Flux zieht es — ohne main-Merge kein Rerun (PR-Kette: test → main). `DEPLOY_TAG=latest` gilt als veraltet; Kanal-Realität ist `kunde-<slug>`.
- Ressourcen-Profile auf 7,7-Gi-VMs mit 2 Tenants: App 512Mi/250m→1Gi/1, Keycloak 384Mi→768Mi (+`KC_JAVA_OPTS -Xmx384m` — Limit ohne JVM-Flag ist inert), Postgres 256Mi→512Mi (+`PG_SHARED_BUFFERS 128MB`/`PG_EFFECTIVE_CACHE_SIZE 512MB`).

## Umzug (VM→VM)
1. Alt: `kubectl -n <ns> create job --from=cronjob/pg-backup <name>` anstoßen, Longhorn-Backups je PVC anlegen (Backup-CR im ns longhorn-system mit `spec.backupTargetName`, `volumeName`, `createSnapshot: true`; KEIN `spec.syncNotification` — Feld existiert nicht) und auf `Completed` warten.
2. Ziel: Alt-Tenant stilllegen (siehe unten), dann Installer-Rerun für den Umzugs-Tenant.
3. Daten: Postgres der App-Generation ist EINE DB `besichtigung` mit Schema `public` (App) + `keycloak` (Keycloak teilt die DB) → kompletter Umzug per `kubectl exec postgres-0 -- pg_dumpall`-Pipe Alt→Neu nach app+keycloak stoppen, DB droppen/neu anlegen (psql default-DB ≠ Nutzername: `$POSTGRES_USER`/`$POSTGRES_DB` in der Pod-Shell nutzen). Media-PVC vorher auf tatsächliche Datenmenge prüfen ( oft 0 B — dann kein Kopieren nötig). Danach Workloads hochskalieren und Domains (App+Keycloak) per curl mit TLS verifizieren.
4. Erst nach Verifikation beim User: Alt-Tenant auf der Quell-VM stilllegen.

## Stilllegung eines Tenants
1. Finale Backups (pg-backup-CronJob anstoßen + Longhorn-Backups je PVC, Completed abwarten).
2. Flux-Kundenobjekte löschen: Kustomization + OCIRepository (beide heißen wie der Tenant-NS) in `flux-system`.
3. Edge: `kubectl -n edge patch cm caddy-sites -p '{"data":{"<ns>.caddy":null}}'` (Key entfernen, nicht die ganze CM).
4. `kubectl delete ns <tenant-ns>`; danach Longhorn-Volumes UND zugehörige PVs explizit löschen (StorageClass longhorn = Retain → PVs bleiben sonst als Released liegen).

## Keycloak auth.mag-tech.eu (intern-vps, ns auth)
- Bewusst gehärtet: Bootstrap-Admin per `deploy.sh --ohne-bootstrap-admin` aus Realm master + Secret entfernt; einziger Admin ist der 2FA-Login des Nutzers. Keycloak 26 legt `KC_BOOTSTRAP_ADMIN_*` NUR auf frischer DB an — ein Env-Restart auf existierender DB erstellt ihn nicht (`LOGIN_ERROR user_not_found`), also diesen Weg nicht erneut versuchen; temporäre Admins per Env sind sinnlos.
- Client-/User-Anlagen (z. B. neue App-Client + Sync-Dienstuser) laufen über VORBEREITETEN Teil-Import durch den Nutzer: JSON (`clients` + `users` mit `credentials` und `clientRoles: {"realm-management": [...]}`) erzeugen, via scp AUCH auf den Rechner des Nutzers legen (z. B. `~/Downloads/<app>-realm-teilimport.json`) — die Konsole wählt im Import-Dialog nur LOKALE Dateien, ein Serverpfad allein ist nicht auswählbar. Import: Realm `mag-tech` → Realm settings → Partial import (Präzedenzfall aishop). Generierte Secrets lokal 600er-gesichert für cluster-secrets.env aufbewahren.
- Clients heißen wie die App (harbor, license-broker, auslieferungshelfer, aishop → zentrio), NICHT `<app>-web`.
- Apps dieser Familie (besichtigungs-app/zentrio) brauchen in Keycloak KEINE Gruppen/Rollen: Keycloak authentifiziert nur, App-Rollen/-Rechte leben in der App-DB, erste Anmeldung legt den App-Benutzer per Auto-Create an (E-Mail-Match). Realm-Gruppen (`registry-admins`, `plattform-admins`) sind nur für Plattformdienste wie Harbor. Folge: Jeder Realm-User bekommt App-Zugriff automatisch; eine Gruppen-Nachrüstung erzeugt nur falsche Erwartungen.

## Auslieferung
- Kanal-Tags (`deploy:kunde-<slug>`) bewegt nur der Auslieferungshelfer; ein Cluster-Umzug braucht dort KEINE Änderung (Flux zieht). Stillgelegte Kunden im Helfer als stillgelegt markieren.
