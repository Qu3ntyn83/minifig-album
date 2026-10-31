# Minifiguren-Sammelalbum

Sammel-Tracker für alle LEGO Collectible-Minifigures-Serien (51 Serien, 774 Figuren, Stand 10/2026).
Ein Container, keine Datenbank: die Sammlung liegt als `data/state.json` im Bind-Mount,
plus tägliche Sicherungen unter `data/backups/` (die letzten 30 Tage).

## Installation auf D-Dock-01

Bei jedem Push auf `main` baut GitHub Actions das Image und legt es unter
`ghcr.io/qu3ntyn83/minifig-album:latest` ab.

```bash
sudo git clone https://github.com/Qu3ntyn83/minifig-album.git /opt/minifig-album
sudo chown -R $USER: /opt/minifig-album
cd /opt/minifig-album
mkdir -p data && sudo chown -R 1000:1000 data
docker compose pull && docker compose up -d
curl -s http://localhost:3020/healthz   # -> {"ok":true}
```

Ist das Repo privat, braucht der Server einmalig einen Login bei GHCR
(Personal Access Token mit `read:packages`):
`echo TOKEN | docker login ghcr.io -u Qu3ntyn83 --password-stdin`

Intern erreichbar unter http://192.168.178.41:3020

## Extern über Caddy

Die App hat keine eigene Anmeldung. Wenn sie extern erreichbar sein soll, unbedingt
`basic_auth` in Caddy davorsetzen (siehe `Caddyfile.snippet`):

```bash
docker exec caddy caddy hash-password --plaintext 'DEIN-PASSWORT'
# Hash ins Snippet eintragen, Block in /opt/caddy/Caddyfile übernehmen
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

DNS: `minifigs-home.powerscripting.de` als CNAME auf deinen DDNS-Record in Cloudflare anlegen.

Hängt Caddy im selben Docker-Netzwerk, kannst du statt der IP auch
`reverse_proxy minifig-album:3000` nutzen und das Port-Mapping weglassen.

## BrickLink-Preise (optional)

Pro Figur zeigt die App zwei Werte aus dem BrickLink-Preisführer, jeweils **gebraucht**
für die Minifigur ohne Ständer (BrickLink-Nummer wie `col312`):

- **Verk.**: Durchschnittspreis der Verkäufe der letzten 6 Monate
- **Ang.**: Durchschnittspreis der aktuellen Angebote

Dazu den Sammlungswert und pro Serie, was das Vervollständigen ungefähr kostet.

Einrichtung:

1. Auf BrickLink einloggen und unter https://www.bricklink.com/v2/api/register_consumer.page
   einen API-Zugang anlegen.
2. Einen Access Token erzeugen. Als IP die öffentliche IP von D-Dock-01 eintragen, oder
   `0.0.0.0`, wenn sie sich ändern kann.
3. Auf dem Server:
   ```bash
   cd /opt/minifig-album && cp .env.example .env && nano .env   # 4 Werte eintragen
   docker compose up -d
   docker logs -f minifig-album   # zeigt den Fortschritt
   ```

Der erste Durchlauf dauert gut eine halbe Stunde (2 Abfragen pro Figur, mit Pause dazwischen).
Danach werden die Preise wöchentlich aufgefrischt. BrickLink erlaubt 5.000 Abfragen pro Tag,
die App nutzt höchstens 4.000. Der Cache liegt in `data/prices.json`.

## Neue Serien

Der Server prüft einmal täglich den öffentlichen Rebrickable-Katalog. Taucht dort eine
neue Collectible-Minifigures-Serie auf (mindestens 6 Einzelfiguren), erscheint sie
automatisch in der App, mit Bildern und, soweit über Brickset auffindbar, mit
BrickLink-Nummer für die Preise. Der Cache liegt in `data/catalog.json`.

- `CATALOG_SKIP`: Setnummern, die ignoriert werden (Standard: `71049`, die F1-Rennwagen)
- `CATALOG_CHECK_HOURS`: Prüfintervall in Stunden (Standard: 24)

## Update

```bash
cd /opt/minifig-album && git pull && docker compose pull && docker compose up -d
```

## Sicherung

Für Backrest einfach `/opt/minifig-album/data` mitsichern.
Zusätzlich gibt es in der App unter „Sichern“ einen Export als Text.
