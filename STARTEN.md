# Pferdeplan – Anleitung

## App starten

```bash
cd pferdeplan
npm run dev
```

Dann im Browser öffnen: **http://localhost:3000**  
Im lokalen Netzwerk erreichbar unter: **http://[IP-Adresse]:3000**

## Standard-Passwörter

| Rolle   | Passwort   | Rechte                    |
|---------|------------|---------------------------|
| Viewer  | `viewer123` | Zeitplan lesen            |
| Admin   | `admin123`  | Alles bearbeiten + löschen |

**Passwörter unbedingt ändern!** → Admin-Login → ⚙️ → Passwörter

## Funktionen

- **Zeitplan**: Einträge nach Datum, navigierbar mit Pfeilen
- **Phasen**: Aufbau (orange), Wettkampf (blau), Abbau (lila), Pause (grau)
- **Sprecher**: 3 Sprecher mit Name, Rolle und Farbe
- **Plätze**: Mehrere Veranstaltungsplätze verwaltbar
- **Einsatzgruppen**: Teams zuweisbar
- **Push-Benachrichtigungen**: 🔔-Symbol aktivieren → bei jeder Änderung Benachrichtigung

## Daten

Die Datenbank liegt unter `data/pferdeplan.db` (SQLite).  
Für Backups einfach diese Datei kopieren.
