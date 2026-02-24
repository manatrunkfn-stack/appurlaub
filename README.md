# 🌍 AppUrlaub

Eine Web-App zum Entdecken und Teilen wenig bekannter Urlaubsorte – mit Bewertungssystem für besonders schöne und besonders gefährliche Orte.

## Voraussetzungen

- [Node.js](https://nodejs.org/) (Version 18 oder neuer)
- npm (wird mit Node.js mitgeliefert)

## Installation

```bash
# 1. Abhängigkeiten installieren
npm install
```

## Website starten

```bash
# JWT-Secret setzen und Server starten
JWT_SECRET=mein-geheimes-passwort npm start
```

Anschließend die Website im Browser öffnen:

**→ http://localhost:3000**

### Entwicklungsmodus (mit Auto-Reload)

```bash
JWT_SECRET=mein-geheimes-passwort npm run dev
```

## Funktionen

- **Registrierung & Login** – Konto erstellen und anmelden
- **Orte eintragen** – Titel, Beschreibung, Region, Standort, optionales Bild und Kategorie (Schön / Gefährlich)
- **Bewerten** – Andere Orte als 🌿 *wunderschön* oder ⚠️ *gefährlich* bewerten
- **Filtern** – Nach Region oder Kategorie filtern

## Hinweise

- `JWT_SECRET` muss beim Start gesetzt sein (beliebiger langer Text, z. B. eine zufällige Zeichenkette)
- Die Datenbank (`appurlaub.db`) wird automatisch beim ersten Start erstellt
- Standard-Port: **3000** (änderbar mit `PORT=8080 JWT_SECRET=... npm start`)
