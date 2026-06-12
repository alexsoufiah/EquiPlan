#!/bin/bash
# EquiPlan iOS Build-Skript
# Führt alle Schritte aus, um die App in Xcode zu öffnen und für den App Store vorzubereiten

set -e

echo "=== EquiPlan iOS Build ==="
echo ""

# Schritt 1: Railway-URL abfragen wenn noch nicht gesetzt
if grep -q "your-app.railway.app\|equiplan.up.railway.app" capacitor.config.ts; then
  echo "ACHTUNG: Bitte zuerst die Railway-URL in capacitor.config.ts eintragen!"
  echo "Ändere 'url:' in capacitor.config.ts zu deiner echten Railway-URL."
  echo ""
  echo "Zum Fortfahren trotzdem Enter drücken (für Testzwecke)..."
  read
fi

# Schritt 2: Next.js Static Export bauen
# (nur für initiale iOS-Struktur; die App lädt zur Laufzeit die Railway-URL)
echo "1/3: Erstelle Dummy-Ausgabe für Capacitor..."
mkdir -p out
echo '<!DOCTYPE html><html><body>Loading...</body></html>' > out/index.html

# Schritt 3: Capacitor sync
echo "2/3: Capacitor-Sync..."
npx cap sync ios

# Schritt 4: Xcode öffnen
echo "3/3: Xcode wird geöffnet..."
npx cap open ios

echo ""
echo "=== Nächste Schritte in Xcode ==="
echo "1. Wähle deinen Apple Developer Account unter Signing & Capabilities"
echo "2. Setze das Bundle-Identifier: com.equiplan.app"
echo "3. Für TestFlight/App Store: Product → Archive"
echo "4. Im Organizer: Distribute App → App Store Connect"
