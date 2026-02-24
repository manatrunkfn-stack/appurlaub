# 🌍 Appurlaub

Eine Web-App, in der Nutzer sich registrieren und Beiträge zu kaum bekannten Urlaubsorten verschiedener Regionen einstellen können. Andere Nutzer können die Orte als **besonders schön** 🌟 oder **besonders gefährlich** ⚠️ bewerten.

---

## Schnellstart – Website lokal öffnen

### Voraussetzungen

- [Node.js](https://nodejs.org/) (Version 18 oder neuer)
- npm (wird mit Node.js mitgeliefert)

### 1. Abhängigkeiten installieren

```bash
npm install
```

### 2. Server starten

```bash
npm start
```

Der Server läuft dann auf **http://localhost:3000** – diese Adresse einfach im Browser öffnen.

> Beim ersten Start werden automatisch 5 Beispielorte (Demo-Daten) eingefügt.

---

## Tests ausführen

```bash
npm test
```

Führt alle API-Tests mit Jest aus (30 Tests).

---

## Funktionen

| Feature | Beschreibung |
|---------|-------------|
| Registrierung / Login | Konto erstellen und einloggen |
| Ort einstellen | Titel, Beschreibung, Region, Standort und Bild-URL angeben |
| Bewerten | Ort als 🌟 **schön** oder ⚠️ **gefährlich** markieren |
| Filtern & Sortieren | Nach Region filtern, nach Bewertungsanzahl sortieren |

---

## Umgebungsvariablen (optional)

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `PORT` | `3000` | Port, auf dem der Server läuft |
| `JWT_SECRET` | `appurlaub-secret-key` | Geheimnis für JWT-Token-Signierung |

Beispiel:

```bash
PORT=8080 JWT_SECRET=mein-geheimnis npm start
```

---

## Projektstruktur

```
appurlaub/
├── server.js        # Express-Backend (API-Routen)
├── database.js      # SQLite-Datenbank & Schema
├── package.json
├── public/
│   ├── index.html   # Single-Page-App
│   ├── style.css    # Styling
│   └── app.js       # Frontend-JavaScript
└── tests/
    └── api.test.js  # API-Tests (Jest + Supertest)
```
