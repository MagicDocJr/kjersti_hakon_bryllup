# Kjersti og Håkon — bryllupsside

Nettsiden for bryllupet 25.–27. juni 2027 på Malungen gjestegård, på https://www.kjerstioghakon.no. Den følger brudens skisse (himmelblå topp, lyseblå/hvite bånd, skrivemaskintekst), bare med parets egne bilder, og har et program der himmelen følger sola over Malungen mens man ruller.

Ren HTML/CSS/JS uten byggesteg, som Ragnhild & Vetle-siden.

| Adresse | Fil | Hva |
|---|---|---|
| `/` | `index.html`, `style.css`, `main.js`, `img/` | Én side som rulles. Menyen er **Forside · Program · Svar**: Forside er alt det praktiske i rekkefølgen fra parets dokument, deretter programmet. |
| `/svar/` | `svar/index.html` + `assets/svar.js` | Svarskjemaet. Samme adresse som QR-koden på invitasjonen. Gamle lenker til `#svar` sendes hit. |
| `/oversikt/` | `oversikt/index.html` | Parets gjesteoversikt, med innlogging (se under). |
| `/onskeliste/` | `onskeliste/index.html` | Sender videre til ønskelisten på onsk.no (QR-koden peker hit). |

Sidene er merket `noindex` med vilje: de viser kontonumre og telefonnumre, og skal bare nås via invitasjonen.

Tidligere utkast (`klassisk/`, `kreativ/`, `samlet/`) og «sett av datoen»-siden ligger i git-historikken.

## Kjøre lokalt

```sh
python3 -m http.server 5317
# http://127.0.0.1:5317/            nettsiden
# http://127.0.0.1:5317/svar/       svarskjemaet
# http://127.0.0.1:5317/oversikt/   gjesteoversikten
```

## Innhold fra paret (2026-11-02)

Parets dokument «Nettside bryllup» er fasit for all tekst. Tekstene er lagt inn ordrett; bare tydelige skrivefeil er rettet (kokkeltivt, stillett, losje, Brullups-). Ikke legg til egne formuleringer uten at paret har godkjent dem.

Tekstene for overnatting (1 600 kr per gjest, kontonr. 9492 08 35907), kleskode, pakkeliste, toastmastere, gave (kontonr. 1440 47 84154, ønskeliste på onsk.no) og det tentative programmet er lagt inn i begge versjoner. Svarfristen er 1. februar 2027. Nedtellingen går til innsjekk fredag 25. juni kl. 17.00.

- **Monogram**: `assets/monogram.svg` er tegnet om til vektor fra parets PDF. Bruk det med `<svg viewBox="0 0 355 378"><use href="../assets/monogram.svg#kh"/></svg>`, så tar det fargen fra `color`.
- **QR til invitasjonen**: `assets/qr-invitasjon.svg` (til trykk) og `assets/qr-invitasjon.png` peker til https://www.kjerstioghakon.no/.
- **QR til svar og ønskeliste**: `assets/qr-svar.svg|png` peker til https://www.kjerstioghakon.no/svar/ og `assets/qr-onskeliste.svg|png` til https://www.kjerstioghakon.no/onskeliste/. `/svar/` er selve skjemaet. `/onskeliste/` er en liten side som sender videre; bytt målet der hvis ønskelisten får ny lenke, så virker den trykte koden fortsatt.
- **Svarskjemaet** ligger i `assets/svar.js` og brukes av alle versjonene. Hver person: navn, kommer (ja/nei), overnatte (ja/nei), matallergier/preferanser (ja/nei, og fritekst som må fylles ut ved ja) og kommentar. Boksen om betaling står over skjemaet. «Har du husket å betale for overnatting?» (ja/nei) vises når noen sover over. E-post er valgfri.
- **Programmet** (2026-11-04, etter innspill fra paret): fredag innsjekk 17.00 og «Grilling og Aperol» fra 19.00, lørdag bare «Nærmere info kommer», søndag som før. Bildene i programmet er fjernet; bare sola er igjen. Programmet mangler tidspunkter utenom fredag og utsjekk. `data-at` på hvert punkt styrer likevel himmelen; de tidene vises ikke.

## Fakta som står flere steder

Når en av disse endres, oppdater **alle** stedene i samme omgang. Programmet er nyeste kilde for tidspunkter.

| Fakta | Hvor |
|---|---|
| Innsjekk fredag kl. 17 | `index.html`: velkomsttekst, Overnatting (Innsjekk), Program · `main.js`: `CHECK_IN` (nedtelling) |
| Mingling / grilling kl. 19 | `index.html`: Overnatting (Innsjekk), Program |
| Utsjekk søndag | `index.html`: bare i Program (fjernet fra Overnatting 2026-11-04 for å unngå to versjoner) |
| Svarfrist 1. februar 2027 | `index.html`: ved «Svar nå», Overnatting (Frist for betaling) · `svar/index.html`: innledning, betalingsboksen |
| Pris 1 600 kr per gjest | `index.html`: Overnatting · `svar/index.html`: hint · `assets/svar.js`, `oversikt/index.html`, `supabase/functions/kh-confirm/index.ts`: `PRICE_PER_PERSON` |
| Kontonr. overnatting 9492 08 35907 | `index.html`: Overnatting · `svar/index.html`: betalingsboksen · `assets/svar.js`, `kh-confirm/index.ts`: `ACCOUNT` (kvittering og e-post) |
| Gavekontonr. 1440 47 84154 | `index.html`: Ønskeliste |

Endres `kh-confirm`, må funksjonen deployes på nytt i Supabase.

## Gjesteoversikt (`/oversikt/`)

Privat side der paret ser svarene live: hvor mange som kommer, overnatter og har betalt, svarfrist, utvikling over tid, allergier, kommentarer og hele gjestelisten med filtre. Fungerer på mobil. De logger inn med kjerstioghakon@gmail.com og passord (en bruker i Supabase Auth, opprettet av admin). RLS lar bare den adressen lese `kh_responses`. Siden viser tall, søk og filter (f.eks. «overnatter, ikke betalt»), allergiliste og CSV-eksport. Nye svar dukker opp uten omlasting via Supabase Realtime.

## Bildekilder

Parets egne bilder ligger i `assets/foto/` og deles av begge versjoner: forlovelsen, båt, Paris, fotoboks, pizza, frokost på senga, baguett, bading og akvarellen av Malungen. De er hentet fra .docx-eksporten av «Nettside bryllup» (skarpere enn HTML-eksporten), beskåret til 4:5 der det trengs og lagret som webp i 700 og 1200 px bredde.

Gjestegård-fotoet fra Wikimedia er byttet ut med parets akvarell, så ingen bilder krever kreditering på siden lenger.

Siden bruker bare parets egne bilder.

- Strektegningene (grill, vin, frokost, hjerte, brudepar) og QR-koden er laget for prosjektet

## Teknisk: forsiden og blomsterenga

- Forsidebildet er fotoboks-stripen (`assets/foto/fotoboks.webp`), samme som på invitasjonen (parets ønske 2026-11-04).
- Forsiden står i blomsterenga man kan dra gjennom: `meadow.js` (three.js fra cdnjs, WebGL), hentet tilbake fra `kreativ-eng/` i git-historikken. Navn og fotostripe står i himmelen; `main.js` vipper kameraet så horisonten havner på toppen av `.hero-ground`, uansett skjermstørrelse. Blomstene skilles i en myk bølge rundt pekeren. Bevegelsen er som originalen (myk, litt etter pekeren); eneste endring er at treffpunktet regnes en tredjedel opp på stilkene i stedet for på bakken, så bølgen havner nærmere det som er under musa/fingeren. Kameraet svaier litt sidelengs med musa (en tredjedel av originalen, aldri opp/ned), og over himmelen skilles ingenting. `?debug` i adressen gir `meadow.state()` i konsollen. Enga tegnes bare mens den er synlig. Uten WebGL vises bildet `img/eng-sm.webp` nederst. På mobil scroller siden som vanlig; enga reagerer på at man drar sidelengs.

## Teknisk: programhimmelen

- Programhimmelen: `sunPosition()` i `main.js` regner solhøyde og asimut for Malungen (60,77° N, 11,45° Ø). Scrollposisjonen mellom to programpunkter gjøres om til et klokkeslett, så natta mellom fredag og lørdag går gjennom skumring og soloppgang. En smal linje under menyen viser klokkeslett og solhøyde.
- `prefers-reduced-motion` slår av overgangene.

## Svar (Supabase)

Svarene lagres i tabellen `kh_responses` i samme Supabase-prosjekt som Ragnhild & Vetle (`bevrttmvumfodpkauiio`). Oppsettet ligger i `supabase/kh_responses.sql`.

- Én rad per gjest. Gjester sendt i samme skjema deler `household_id`.
- `paid_lodging`: gjestens eget svar på «Har du husket å betale for overnatting?», bare satt for de som overnatter.
- `allergies` inneholder avkryssede valg (gluten, laktose, nøtter, skalldyr, fisk, egg, vegetar, vegan) og fritekst, kommaseparert.
- Den offentlige nøkkelen i `main.js` kan bare legge til rader, ikke lese, endre eller slette, verken her eller i R&V sin `responses`. Testet mot live-databasen 2026-10-06.
- Les svarene i Supabase-dashbordet (Table Editor → `kh_responses`) eller med service_role-nøkkelen fra et lokalt skript. Den nøkkelen skal aldri inn i repoet.
- Alle med tilgang til prosjektets organisasjon i Supabase ser begge bryllupenes gjestelister.
- Gratisprosjektet sover etter ca. en uke uten trafikk, og da virker ikke svarskjemaet. `.github/workflows/keepalive.yml` kaller `kh_ping()` hver tredje dag. Feiler pingen, sender GitHub e-post til eieren av repoet. Våkn prosjektet da i Supabase-dashbordet.

## Publisering

GitHub Pages fra `main` (rotmappen), med eget domene `www.kjerstioghakon.no` (filen `CNAME`). DNS ligger hos Domeneshop:

| Type | Navn | Verdi |
|---|---|---|
| A | (tom / @) | 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 |
| AAAA | (tom / @) | 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153 |
| CNAME | www | magicdocjr.github.io |

**Bytt versjonsnummer når CSS eller JS endres.** Lenkene til `style.css`, `main.js`, `meadow.js` og `assets/svar.js` har `?v=ÅÅÅÅMMDD` (i `index.html`, `svar/index.html` og `main.js`). Ellers kan gjester som har vært inne før, få den gamle filen fra mobilens mellomlager. Det skjedde med svarskjemaet 2026-11-05: noen så fortsatt det gamle allergifeltet uten ja/nei. Bytt alle til dagens dato, f.eks. `grep -rln 'v=20261105' . | xargs sed -i 's/v=20261105/v=NY_DATO/g'`.

Alle sidene har `noindex` til ekte bilder og detaljer er på plass. Når paret har valgt versjon, flytt den til roten (eller la `index.html` videresende dit).
