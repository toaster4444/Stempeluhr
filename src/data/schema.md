# Stempeluhr – Datenformat (Schema)

Diese App speichert **alle Daten ausschließlich lokal im Browser** (aktuell über `localStorage`).
Es gibt **keine Serverfunktionen** und keine Cloud.

## Storage Key

- `localStorage` Key: `stempeluhr_data_v1`

## Root-Objekt

```json
{
  "stamps": [],
  "settings": {},
  "meta": {
    "lastAction": null
  }
}

