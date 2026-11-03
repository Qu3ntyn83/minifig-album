# Minifiguren-Sammelalbum

**Deutsch** · [English](#english)

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-unterst%C3%BCtzen-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/quentyn83)

Sammel-Tracker für alle LEGO Collectible-Minifigures-Serien (51 Serien, 775 Figuren, Stand 10/2026),
mit Bildern, Wunschliste, Doppelten, Tauschliste, BrickLink-Preisen und automatischer
Erkennung neuer Serien.

Ein Container, keine Datenbank: die Sammlung liegt als `data/state.json` im Bind-Mount,
plus tägliche Sicherungen unter `data/backups/` (die letzten 30 Tage).

## Screenshots

![Übersicht mit Fortschritt, Sammlungswert und aufgeklappter Serie](docs/screenshots/uebersicht.png)

<p>
  <img src="docs/screenshots/handy-serie.png" alt="Serie am Handy im Dark Mode" width="300">
  &nbsp;
  <img src="docs/screenshots/handy-grossansicht.png" alt="Großansicht einer Figur mit BrickLink-Preisen" width="300">
</p>

![Tauschliste mit Doppelten und Gesuchten zum Kopieren](docs/screenshots/tauschliste.png)

<sub>Die Screenshots zeigen eine Beispielsammlung mit Beispielpreisen.</sub>

## Funktionen

- Alle Serien von Series 1 (2010) bis heute, nummerierte und Lizenzserien
- Abhaken per Tipp, Doppelte zählen, Wunschliste
- Fotos jeder Figur (Rebrickable) mit Großansicht
- BrickLink-Preise gebraucht: Ø Verkäufe der letzten 6 Monate und Ø aktuelle Angebote,
  dazu Sammlungswert und Restkosten pro Serie
- Serien oder einzelne Figuren ausblenden, die man nicht sammeln will
- Tauschliste zum Kopieren, Export und Import der Sammlung
- Neue Serien erscheinen automatisch, sobald sie im Rebrickable-Katalog stehen
- Für Handy und Desktop, mit hellem und dunklem Design
- Oberfläche auf Deutsch oder Englisch (Umschalter oben rechts, Standard nach Browsersprache)

## Installation

Bei jedem Push auf `main` baut GitHub Actions das Image und legt es unter
`ghcr.io/qu3ntyn83/minifig-album:latest` ab.

```bash
sudo git clone https://github.com/Qu3ntyn83/minifig-album.git /opt/minifig-album
cd /opt/minifig-album
sudo mkdir -p data && sudo chown -R 1000:1000 data
sudo docker compose pull && sudo docker compose up -d
curl -s http://localhost:3020/healthz   # -> {"ok":true}
```

Die App läuft dann unter `http://<server-ip>:3020`. Port und Pfad lassen sich in
`docker-compose.yml` anpassen.

## Zugriff von außen

Die App hat keine eigene Anmeldung. Soll sie aus dem Internet erreichbar sein, gehört ein
Reverse Proxy mit Anmeldung davor. Ein Beispiel für Caddy mit `basic_auth` steht in
`Caddyfile.snippet`:

```bash
docker exec caddy caddy hash-password --plaintext 'DEIN-PASSWORT'
# Hash, Domain, Benutzer und Ziel im Snippet eintragen und in dein Caddyfile übernehmen
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

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
2. Einen Access Token erzeugen. Als IP die öffentliche IP eintragen, von der dein Server
   ins Internet geht.
3. Auf dem Server:
   ```bash
   cd /opt/minifig-album && sudo cp .env.example .env && sudo nano .env   # 4 Werte eintragen
   sudo docker compose up -d
   sudo docker logs -f minifig-album   # zeigt den Fortschritt
   ```

Meldet das Log `TOKEN_IP_MISMATCHED`, steht dort die IP, die BrickLink gesehen hat. Diese
beim Access Token eintragen.

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

## Versionen

Neben `latest` gibt es feste Versionen, z. B. `ghcr.io/qu3ntyn83/minifig-album:1.0.0`
oder `:1.0` für alle Patch-Updates einer Version. Sie entstehen aus Git-Tags (`v1.0.0`).

## Update

```bash
cd /opt/minifig-album && sudo git pull && sudo docker compose pull && sudo docker compose up -d
```

Oder automatisch mit einem Container-Updater wie Watchtower.

## Sicherung

Den Ordner `data/` in dein Backup aufnehmen. Zusätzlich gibt es in der App unter
„Sichern“ einen Export als Text.

## Mitwirkende

- [Torsten Weise](https://github.com/Qu3ntyn83) (@Qu3ntyn83): Idee, Betrieb und Weiterentwicklung

Fehler und Wünsche gern als [Issue](https://github.com/Qu3ntyn83/minifig-album/issues).

## Unterstützen

Wenn dir das Projekt hilft und du mir einen Kaffee ausgeben möchtest, freue ich mich sehr:

<a href="https://buymeacoffee.com/quentyn83"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="45"></a>

## Lizenz

[MIT](LICENSE) – Torsten Weise

---

<a id="english"></a>

# Minifigure Collection (English)

[Deutsch](#minifiguren-sammelalbum) · **English**

A collection tracker for every LEGO Collectible Minifigures series (51 series, 775 figures,
as of 10/2026), with images, wishlist, duplicates, trade list, BrickLink prices and automatic
detection of new series.

One container, no database: your collection lives in `data/state.json` in a bind mount,
plus daily backups in `data/backups/` (last 30 days).

## Screenshots

The screenshots in the German section above show the app with a sample collection and sample
prices. The interface switches between German and English with one tap.

## Features

- Every series from Series 1 (2010) to today, numbered and licensed
- Tap to tick off, count duplicates, wishlist
- A photo of every figure (Rebrickable) with a large view
- BrickLink prices for used figures: average sales over the last 6 months and average current
  listings, plus collection value and cost to complete each series
- Hide series or single figures you don't want to collect
- Trade list ready to copy, export and import of your collection
- New series appear automatically as soon as they are listed in the Rebrickable catalog
- Works on phone and desktop, light and dark theme
- Interface in German or English (switch at the top right, default follows the browser)

## Installation

Every push to `main` makes GitHub Actions build the image and publish it as
`ghcr.io/qu3ntyn83/minifig-album:latest`.

```bash
sudo git clone https://github.com/Qu3ntyn83/minifig-album.git /opt/minifig-album
cd /opt/minifig-album
sudo mkdir -p data && sudo chown -R 1000:1000 data
sudo docker compose pull && sudo docker compose up -d
curl -s http://localhost:3020/healthz   # -> {"ok":true}
```

The app then runs at `http://<server-ip>:3020`. Change port and path in `docker-compose.yml`.

## Access from the internet

The app has no login of its own. If it should be reachable from the internet, put a reverse
proxy with authentication in front of it. `Caddyfile.snippet` has an example for Caddy with
`basic_auth`:

```bash
docker exec caddy caddy hash-password --plaintext 'YOUR-PASSWORD'
# Fill in hash, domain, user and target in the snippet, then add it to your Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

If Caddy runs in the same Docker network, you can use `reverse_proxy minifig-album:3000`
instead of the IP and drop the port mapping.

## BrickLink prices (optional)

For each figure the app shows two values from the BrickLink price guide, both for **used**
condition and for the minifigure without stand (BrickLink number such as `col312`):

- **Sold**: average price of sales over the last 6 months
- **Listed**: average price of current listings

It also shows your collection value and roughly what completing each series would cost.

Setup:

1. Log in to BrickLink and create API access at
   https://www.bricklink.com/v2/api/register_consumer.page
2. Create an access token. Enter the public IP your server uses to reach the internet.
3. On the server:
   ```bash
   cd /opt/minifig-album && sudo cp .env.example .env && sudo nano .env   # enter the 4 values
   sudo docker compose up -d
   sudo docker logs -f minifig-album   # shows progress
   ```

If the log reports `TOKEN_IP_MISMATCHED`, it includes the IP BrickLink saw. Add that IP to
your access token.

The first run takes a little over half an hour (2 requests per figure, with a pause between
them). After that, prices refresh weekly. BrickLink allows 5,000 requests per day; the app
uses at most 4,000. The cache lives in `data/prices.json`.

## New series

Once a day the server checks the public Rebrickable catalog. When a new Collectible
Minifigures series appears there (at least 6 single figures), it shows up in the app
automatically, with images and, where Brickset has it, the BrickLink number for prices.
The cache lives in `data/catalog.json`.

- `CATALOG_SKIP`: set numbers to ignore (default: `71049`, the F1 race cars)
- `CATALOG_CHECK_HOURS`: check interval in hours (default: 24)

## Versions

Besides `latest` there are fixed versions, e.g. `ghcr.io/qu3ntyn83/minifig-album:1.0.0`, or
`:1.0` for all patch updates of a version. They are built from Git tags (`v1.0.0`).

## Updating

```bash
cd /opt/minifig-album && sudo git pull && sudo docker compose pull && sudo docker compose up -d
```

Or automatically with a container updater such as Watchtower.

## Backup

Include the `data/` folder in your backups. The app also offers a text export under
“Backup”.

## Contributors

- [Torsten Weise](https://github.com/Qu3ntyn83) (@Qu3ntyn83): idea, operation and development

Bugs and wishes are welcome as an [issue](https://github.com/Qu3ntyn83/minifig-album/issues).

## Support

If the project helps you and you'd like to buy me a coffee, I'd be very happy:

<a href="https://buymeacoffee.com/quentyn83"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="45"></a>

## License

[MIT](LICENSE) – Torsten Weise
